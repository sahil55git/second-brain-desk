package in.mahadevtraders.desk;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;
import android.view.WindowManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Live weight from a Bluetooth weighing scale (classic Bluetooth serial port, e.g. iScale: the
 * scale sends the weight as text lines all the time). Browsers cannot open this kind of
 * Bluetooth, so the app does it and hands the raw bytes to the page.
 *
 * The link is KEPT here, not in the page: once open() names a scale, a supervisor thread holds the
 * link and reconnects by itself (screen off, page reloading, scale switched off and on, Bluetooth
 * turned off and on) until close() is called:
 *   - every connect has a time limit and shares one phone-wide gate with the printer (BtLinks);
 *   - a link that brings no bytes for 20 s is treated as dead and reopened (the scale went away
 *     without Android noticing);
 *   - Bluetooth turned back on, or the page asking again, = try at once (no waiting out a back-off);
 *   - while the app is in the background, bytes are not forwarded (the page is asleep; they would
 *     pile up), but the link stays up so the weight is there the moment the screen is back.
 * Events: "scaleOpened" (link up), "scaleBytes" (raw text), "scaleClosed" (link lost; it is being
 * retried). What the bytes mean is decided by the page (lib/scaleBt.ts, lib/scaleLink.ts).
 */
@CapacitorPlugin(name = "MahadevScale", permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) })
public class MahadevScalePlugin extends Plugin {
    private static final Pattern SCALEISH = Pattern.compile("scale|weigh|iscale|i-?\\d{2}|s-?\\d{2}|hc-?0|bt0|jdy|spp|serial|essae|balance", Pattern.CASE_INSENSITIVE);
    private static final String NEED_PERMISSION = "Allow Nearby devices for Mahadev Desk (Android Settings → Apps → Mahadev Desk → Permissions), then try again.";
    /** wait between tries while the scale is away: quick at first, then every 5 s (a scale switched back on is found in seconds) */
    private static final long[] BACKOFF_MS = { 500, 1000, 2000, 3000, 5000 };
    /** connected but no bytes for this long = the link is dead (the scale sends several lines a second) */
    private static final long DEAD_MS = 20_000;

    private final Object lock = new Object();
    /** the scale the page asked for; null = keep nothing open */
    private String wanted;
    private BluetoothSocket socket;
    private String addr;
    private String name;
    private volatile long lastRx;
    private Thread supervisor;
    /** set to make the supervisor try now instead of finishing its wait */
    private boolean kick;
    private int failures;
    private String lastError = "";
    private volatile boolean paused;
    /** open() calls waiting for the link */
    private final List<PluginCall> waiting = new ArrayList<>();
    private BroadcastReceiver btReceiver;

    private boolean needsBtPermission() {
        return Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    // ---------------------------------------------------------------- life of the app
    @Override
    public void load() {
        // Bluetooth switched off: drop the link now. Switched on: try at once.
        btReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                if (!BluetoothAdapter.ACTION_STATE_CHANGED.equals(i.getAction())) return;
                int st = i.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1);
                if (st == BluetoothAdapter.STATE_TURNING_OFF || st == BluetoothAdapter.STATE_OFF) dropSocket();
                if (st == BluetoothAdapter.STATE_ON) wake(true);
            }
        };
        try {
            ContextCompat.registerReceiver(getContext(), btReceiver, new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED), ContextCompat.RECEIVER_EXPORTED);
        } catch (Exception ignored) {
            btReceiver = null;
        }
    }

    @Override
    protected void handleOnPause() {
        paused = true;
    }

    @Override
    protected void handleOnResume() {
        paused = false;
        wake(true); // the phone was asleep: if the link went, try now
    }

    @Override
    protected void handleOnDestroy() {
        stopAll("The app closed.");
        try { if (btReceiver != null) getContext().unregisterReceiver(btReceiver); } catch (Exception ignored) {}
    }

    // ---------------------------------------------------------------- paired devices
    @PluginMethod
    public void list(PluginCall call) {
        if (needsBtPermission()) {
            requestPermissionForAlias("bluetooth", call, "listAfterPermission");
            return;
        }
        doList(call);
    }

    @PermissionCallback
    private void listAfterPermission(PluginCall call) {
        doList(call);
    }

    private void doList(PluginCall call) {
        JSArray arr = new JSArray();
        boolean btOn = false;
        try {
            BluetoothAdapter a = adapter();
            if (a != null && !needsBtPermission()) {
                btOn = a.isEnabled();
                Set<BluetoothDevice> bonded = btOn ? a.getBondedDevices() : null;
                if (bonded != null) {
                    for (BluetoothDevice d : bonded) {
                        String n = d.getName() == null ? d.getAddress() : d.getName();
                        int major = d.getBluetoothClass() == null ? BluetoothClass.Device.Major.UNCATEGORIZED : d.getBluetoothClass().getMajorDeviceClass();
                        // never a scale: headphones, phones, computers, watches, printers
                        if (major == BluetoothClass.Device.Major.AUDIO_VIDEO || major == BluetoothClass.Device.Major.PHONE || major == BluetoothClass.Device.Major.COMPUTER
                                || major == BluetoothClass.Device.Major.WEARABLE || major == BluetoothClass.Device.Major.TOY || major == BluetoothClass.Device.Major.IMAGING) continue;
                        JSObject o = new JSObject();
                        o.put("id", d.getAddress());
                        o.put("name", n);
                        o.put("scale", SCALEISH.matcher(n).find());
                        arr.put(o);
                    }
                }
            }
        } catch (SecurityException ignored) {}
        JSObject r = new JSObject();
        r.put("devices", arr);
        r.put("bluetoothOn", btOn);
        call.resolve(r);
    }

    // ---------------------------------------------------------------- open / close
    /**
     * Keep a link to this scale. Resolves as soon as it is up (at once if it already is); if the next
     * try fails it rejects with the reason, but the app keeps trying in the background until close().
     */
    @PluginMethod
    public void open(PluginCall call) {
        if (needsBtPermission()) {
            requestPermissionForAlias("bluetooth", call, "openAfterPermission");
            return;
        }
        doOpen(call);
    }

    @PermissionCallback
    private void openAfterPermission(PluginCall call) {
        if (needsBtPermission()) {
            call.reject(NEED_PERMISSION);
            return;
        }
        doOpen(call);
    }

    private void doOpen(final PluginCall call) {
        final String want = call.getString("id", "");
        if (want == null || !BluetoothAdapter.checkBluetoothAddress(want.toUpperCase(Locale.ROOT))) {
            call.reject("Choose the scale again.");
            return;
        }
        final String target = want.toUpperCase(Locale.ROOT);
        BluetoothSocket old = null;
        synchronized (lock) {
            if (!target.equals(wanted)) {
                // a different scale: let go of the old one
                old = socket;
                socket = null;
                addr = null;
                failures = 0;
            }
            wanted = target;
            if (socket != null && socket.isConnected() && target.equals(addr)) {
                call.resolve(opened());
                return;
            }
            waiting.add(call);
            kick = true;
            lock.notifyAll();
            ensureSupervisor();
        }
        try { if (old != null) old.close(); } catch (Exception ignored) {}
    }

    /** Stop keeping a link: the page disconnected on purpose (or chose another scale). */
    @PluginMethod
    public void close(PluginCall call) {
        stopAll("Disconnected.");
        call.resolve();
    }

    /** What the link is doing now (for the scale page). */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        synchronized (lock) {
            r.put("wanted", wanted == null ? "" : wanted);
            r.put("connected", socket != null && socket.isConnected());
            r.put("name", name == null ? "" : name);
            r.put("failures", failures);
            r.put("error", lastError);
            r.put("quietMs", lastRx == 0 ? -1 : SystemClock.elapsedRealtime() - lastRx);
        }
        call.resolve(r);
    }

    private JSObject opened() {
        JSObject r = new JSObject();
        r.put("name", name == null ? (addr == null ? "" : addr) : name);
        return r;
    }

    private void stopAll(String why) {
        BluetoothSocket s;
        List<PluginCall> calls;
        synchronized (lock) {
            wanted = null;
            s = socket;
            socket = null;
            addr = null;
            calls = new ArrayList<>(waiting);
            waiting.clear();
            lock.notifyAll();
        }
        try { if (s != null) s.close(); } catch (Exception ignored) {}
        for (PluginCall c : calls) {
            try { c.reject(why); } catch (Exception ignored) {}
        }
    }

    private void dropSocket() {
        BluetoothSocket s;
        synchronized (lock) {
            s = socket;
        }
        try { if (s != null) s.close(); } catch (Exception ignored) {} // the reader notices and reports
    }

    private void wake(boolean now) {
        synchronized (lock) {
            if (wanted == null) return;
            if (now) {
                kick = true;
                failures = 0;
            }
            lock.notifyAll();
            ensureSupervisor();
        }
    }

    /** Call with `lock` held. */
    private void ensureSupervisor() {
        if (supervisor != null && supervisor.isAlive()) return;
        supervisor = new Thread(this::supervise, "mahadev-scale");
        supervisor.setDaemon(true);
        supervisor.start();
    }

    // ---------------------------------------------------------------- the supervisor
    private void supervise() {
        for (;;) {
            String target;
            synchronized (lock) {
                if (wanted == null) {
                    supervisor = null;
                    return;
                }
                target = wanted;
                kick = false;
            }
            BluetoothSocket s = null;
            String err = null;
            try {
                s = connectOnce(target);
            } catch (SecurityException se) {
                err = NEED_PERMISSION;
            } catch (Exception e) {
                err = "The scale did not answer. Is it switched on, near the phone and not connected to another phone? (" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()) + ")";
            }

            if (s != null) {
                List<PluginCall> calls;
                boolean keep;
                synchronized (lock) {
                    keep = target.equals(wanted);
                    if (keep) {
                        socket = s;
                        addr = target;
                        failures = 0;
                        lastError = "";
                        lastRx = SystemClock.elapsedRealtime();
                    }
                    calls = keep ? new ArrayList<>(waiting) : new ArrayList<>();
                    if (keep) waiting.clear();
                }
                if (!keep) {
                    try { s.close(); } catch (Exception ignored) {}
                    continue;
                }
                JSObject r = opened();
                for (PluginCall c : calls) {
                    try { c.resolve(r); } catch (Exception ignored) {}
                }
                notifyListeners("scaleOpened", r);
                String why = readUntilDropped(s);
                boolean still;
                synchronized (lock) {
                    if (socket == s) {
                        socket = null;
                        addr = null;
                    }
                    still = target.equals(wanted);
                    lastError = why;
                }
                try { s.close(); } catch (Exception ignored) {}
                if (still) {
                    JSObject o = new JSObject();
                    o.put("error", why);
                    notifyListeners("scaleClosed", o);
                }
                // a scale that was just working: try again almost at once
                pause(300);
                continue;
            }

            // the try failed: tell anybody waiting, then wait a little (less if somebody asks)
            List<PluginCall> calls;
            int n;
            synchronized (lock) {
                failures++;
                n = failures;
                lastError = err == null ? "" : err;
                calls = new ArrayList<>(waiting);
                waiting.clear();
            }
            for (PluginCall c : calls) {
                try { c.reject(err); } catch (Exception ignored) {}
            }
            if (NEED_PERMISSION.equals(err)) {
                // needs a person: stop until the page asks again
                synchronized (lock) {
                    wanted = null;
                    supervisor = null;
                }
                return;
            }
            pause(BACKOFF_MS[Math.min(n, BACKOFF_MS.length) - 1]);
        }
    }

    /** Waits up to ms, or less if open()/Bluetooth-on/app-resume asks for a try now. */
    private void pause(long ms) {
        long until = SystemClock.elapsedRealtime() + ms;
        synchronized (lock) {
            while (wanted != null && !kick) {
                long left = until - SystemClock.elapsedRealtime();
                if (left <= 0) break;
                try {
                    lock.wait(left);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    private BluetoothSocket connectOnce(String target) throws Exception {
        BluetoothAdapter a = adapter();
        if (a == null) throw new Exception("This phone has no Bluetooth.");
        if (!a.isEnabled()) throw new Exception("Bluetooth is off. Turn it on.");
        BluetoothDevice d = a.getRemoteDevice(target);
        if (d.getBondState() != BluetoothDevice.BOND_BONDED) throw new Exception("The scale is not paired with this phone any more. Pair it in Bluetooth settings.");
        // a print job is using Bluetooth: let it finish first (it holds the gate for the whole slip)
        if (!BtLinks.enter(30_000)) throw new Exception("Bluetooth is busy (printing).");
        try {
            // a background retry of a scale that worked before: one quick try the way that worked
            boolean quick;
            synchronized (lock) { quick = failures > 0 && failures % 4 != 0; }
            BluetoothSocket s = BtLinks.open(a, d, 6000, 4000, quick);
            try { if (d.getName() != null) name = d.getName(); } catch (SecurityException ignored) {}
            return s;
        } finally {
            BtLinks.leave();
        }
    }

    /** Reads until the link drops (or carries nothing for DEAD_MS). Returns why it ended. */
    private String readUntilDropped(final BluetoothSocket s) {
        // a watchdog: a scale that walked away without Android noticing leaves read() blocked for ever
        final boolean[] done = { false };
        Thread dog = new Thread(() -> {
            for (;;) {
                try { Thread.sleep(2000); } catch (InterruptedException e) { return; }
                synchronized (done) { if (done[0]) return; }
                if (SystemClock.elapsedRealtime() - lastRx > DEAD_MS) {
                    try { s.close(); } catch (Exception ignored) {}
                    return;
                }
            }
        }, "mahadev-scale-watch");
        dog.setDaemon(true);
        dog.start();
        String why = "The scale disconnected.";
        byte[] buf = new byte[256];
        try {
            InputStream in = s.getInputStream();
            for (;;) {
                int n = in.read(buf); // blocks; throws when the link drops or close() is called
                if (n < 0) break;
                if (n == 0) continue;
                lastRx = SystemClock.elapsedRealtime();
                if (paused) continue; // the page is asleep: do not pile up thousands of messages
                JSObject o = new JSObject();
                o.put("base64", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP));
                notifyListeners("scaleBytes", o);
            }
        } catch (Exception e) {
            if (SystemClock.elapsedRealtime() - lastRx > DEAD_MS) why = "No weight came from the scale for 20 s (switched off or too far?).";
            else if (e.getMessage() != null) why = "The scale disconnected (" + e.getMessage() + ").";
        }
        synchronized (done) { done[0] = true; }
        dog.interrupt();
        return why;
    }

    // ---------------------------------------------------------------- keep the work screen alive
    /** Keeps the screen on while a weighing screen is open (a sleeping phone pauses the page). */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        final Activity act = getActivity();
        if (act == null) {
            call.resolve();
            return;
        }
        act.runOnUiThread(() -> {
            try {
                if (on) act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Exception ignored) {}
            call.resolve();
        });
    }

    /** Is Android allowed to stop this app to save battery? (that would cut the scale and printer) */
    @PluginMethod
    public void batteryStatus(PluginCall call) {
        boolean free = true;
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                free = pm == null || pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            }
        } catch (Exception ignored) {}
        JSObject r = new JSObject();
        r.put("unrestricted", free);
        call.resolve(r);
    }

    /** Android's "Let this app run in the background?" question, or the battery settings list. */
    @PluginMethod
    public void askBattery(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e2) {
                call.reject(e2.getMessage());
            }
        }
    }
}
