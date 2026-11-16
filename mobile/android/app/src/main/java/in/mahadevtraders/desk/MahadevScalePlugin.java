package in.mahadevtraders.desk;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;

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
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Live weight from a Bluetooth weighing scale (classic Bluetooth serial port, e.g. iScale: the
 * scale sends the weight as text lines all the time). Browsers cannot open this kind of
 * Bluetooth, so the app does it and hands the raw bytes to the page.
 *
 * Deliberately simple: open() connects ONCE, a reader thread forwards the bytes ("scaleBytes")
 * and reports when the link drops ("scaleClosed"). When to try again, and what the bytes mean,
 * is decided by the page (lib/scaleBt.ts, lib/scaleLink.ts) so phone and computer follow the
 * same tested rules. The scale must be paired in Android's Bluetooth settings first.
 */
@CapacitorPlugin(name = "MahadevScale", permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) })
public class MahadevScalePlugin extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final Pattern SCALEISH = Pattern.compile("scale|weigh|iscale|i-?\\d{2}|s-?\\d{2}|hc-?0|bt0|jdy|spp|serial|essae|balance", Pattern.CASE_INSENSITIVE);
    private static final String NEED_PERMISSION = "Allow Nearby devices for Mahadev Desk (Android Settings → Apps → Mahadev Desk → Permissions), then try again.";

    private final Object lock = new Object();
    private BluetoothSocket socket;
    private String addr;
    /** Goes up every time a link is opened or closed, so an old reader thread knows it is stale. */
    private int generation = 0;
    private boolean opening = false;

    private boolean needsBtPermission() {
        return Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
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
                        String name = d.getName() == null ? d.getAddress() : d.getName();
                        int major = d.getBluetoothClass() == null ? BluetoothClass.Device.Major.UNCATEGORIZED : d.getBluetoothClass().getMajorDeviceClass();
                        // never a scale: headphones, phones, computers, watches, printers
                        if (major == BluetoothClass.Device.Major.AUDIO_VIDEO || major == BluetoothClass.Device.Major.PHONE || major == BluetoothClass.Device.Major.COMPUTER
                                || major == BluetoothClass.Device.Major.WEARABLE || major == BluetoothClass.Device.Major.TOY || major == BluetoothClass.Device.Major.IMAGING) continue;
                        JSObject o = new JSObject();
                        o.put("id", d.getAddress());
                        o.put("name", name);
                        o.put("scale", SCALEISH.matcher(name).find());
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
        if (want == null || !BluetoothAdapter.checkBluetoothAddress(want.toUpperCase())) {
            call.reject("Choose the scale again.");
            return;
        }
        final String target = want.toUpperCase();
        synchronized (lock) {
            // the page was reloaded while the link stayed up: keep using it
            if (socket != null && socket.isConnected() && target.equals(addr)) {
                JSObject r = new JSObject();
                r.put("name", target);
                call.resolve(r);
                return;
            }
            if (opening) {
                call.reject("Already connecting to the scale.");
                return;
            }
            opening = true;
        }
        // connecting can take ten seconds: never on the thread every other plugin call shares
        Thread t = new Thread(() -> {
            BluetoothSocket s = null;
            try {
                closeQuietly();
                BluetoothAdapter a = adapter();
                if (a == null) throw new Exception("This phone has no Bluetooth.");
                if (!a.isEnabled()) throw new Exception("Bluetooth is off. Turn it on.");
                BluetoothDevice d = a.getRemoteDevice(target);
                try { a.cancelDiscovery(); } catch (SecurityException ignored) {}
                s = connect(d);
                final int gen;
                synchronized (lock) {
                    socket = s;
                    addr = target;
                    gen = ++generation;
                    opening = false;
                }
                String name = target;
                try { if (d.getName() != null) name = d.getName(); } catch (SecurityException ignored) {}
                JSObject r = new JSObject();
                r.put("name", name);
                call.resolve(r);
                readLoop(s, gen);
            } catch (Exception e) {
                try { if (s != null) s.close(); } catch (Exception ignored) {}
                synchronized (lock) { opening = false; }
                String m = e instanceof SecurityException ? NEED_PERMISSION
                        : "The scale did not answer. Is it switched on, near the phone and not connected to another phone? (" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()) + ")";
                call.reject(m);
            }
        }, "mahadev-scale");
        t.setDaemon(true);
        t.start();
    }

    /** Three ways in, because cheap Bluetooth modules differ: secure, insecure, then channel 1. */
    private BluetoothSocket connect(BluetoothDevice d) throws Exception {
        BluetoothSocket s = null;
        try {
            s = d.createRfcommSocketToServiceRecord(SPP);
            s.connect();
            return s;
        } catch (Exception first) {
            try { if (s != null) s.close(); } catch (Exception ignored) {}
        }
        try {
            s = d.createInsecureRfcommSocketToServiceRecord(SPP);
            s.connect();
            return s;
        } catch (Exception second) {
            try { if (s != null) s.close(); } catch (Exception ignored) {}
        }
        Method m = d.getClass().getMethod("createRfcommSocket", int.class);
        s = (BluetoothSocket) m.invoke(d, 1);
        try {
            s.connect();
            return s;
        } catch (Exception third) {
            try { s.close(); } catch (Exception ignored) {}
            throw third;
        }
    }

    /** Runs on the scale thread until the link drops or is closed on purpose. */
    private void readLoop(BluetoothSocket s, int gen) {
        String why = "The scale disconnected.";
        byte[] buf = new byte[256];
        try {
            InputStream in = s.getInputStream();
            for (;;) {
                int n = in.read(buf); // blocks; throws when the link drops or close() is called
                if (n < 0) break;
                if (n == 0) continue;
                synchronized (lock) { if (gen != generation) return; }
                JSObject o = new JSObject();
                o.put("base64", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP));
                notifyListeners("scaleBytes", o);
            }
        } catch (Exception e) {
            if (e.getMessage() != null) why = "The scale disconnected (" + e.getMessage() + ").";
        }
        boolean mine;
        synchronized (lock) {
            mine = gen == generation;
            if (mine) {
                generation++;
                socket = null;
                addr = null;
            }
        }
        try { s.close(); } catch (Exception ignored) {}
        // closed on purpose (close() or a new open()) is not news; a dropped link is
        if (mine) {
            JSObject o = new JSObject();
            o.put("error", why);
            notifyListeners("scaleClosed", o);
        }
    }

    private void closeQuietly() {
        BluetoothSocket s;
        synchronized (lock) {
            s = socket;
            socket = null;
            addr = null;
            generation++;
        }
        try { if (s != null) s.close(); } catch (Exception ignored) {}
    }

    @PluginMethod
    public void close(PluginCall call) {
        closeQuietly();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        closeQuietly();
    }
}
