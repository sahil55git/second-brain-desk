package in.mahadevtraders.desk;

import android.Manifest;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;

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

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Printing straight to a label / receipt printer: paired Bluetooth printers (classic Bluetooth,
 * the serial port most thermal printers use; browsers cannot reach these) and USB printers on an
 * OTG cable. The page builds the printer's own bytes (TSPL / ESC-POS / ZPL) and sends them here.
 * Ids: "nbt:<MAC address>" and "nusb:<vendor>:<product>" (hex).
 */
@CapacitorPlugin(name = "MahadevPrinter", permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) })
public class MahadevPrinterPlugin extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String USB_PERMISSION = "in.mahadevtraders.desk.USB_PERMISSION";
    private static final Pattern PRINTERISH = Pattern.compile("print|pos|thermal|label|receipt|h30|helett|posiflow|xp-|xprinter|mpt|rpp|tsc|zebra|godex|tsp|bixolon|epson|gprinter|hprt|pt-|ptp|bt-?58|bt-?80", Pattern.CASE_INSENSITIVE);

    private volatile BluetoothSocket btSocket;
    private volatile String btAddr;
    private UsbDeviceConnection usbConn;
    private UsbEndpoint usbOut;
    private UsbInterface usbIface;
    private String usbId;

    private boolean needsBtPermission() {
        return Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

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
                        // Many cheap thermal printers report a wrong class (headset, phone, computer…), so every
                        // paired device is listed; only the likely printers are marked and sorted first.
                        JSObject o = new JSObject();
                        o.put("id", "nbt:" + d.getAddress());
                        o.put("name", name);
                        o.put("kind", "bluetooth");
                        o.put("printer", major == BluetoothClass.Device.Major.IMAGING || PRINTERISH.matcher(name).find());
                        o.put("cls", major);
                        arr.put(o);
                    }
                }
            }
        } catch (SecurityException ignored) {}
        UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (um != null) {
            for (UsbDevice d : um.getDeviceList().values()) {
                if (findOut(d) == null) continue;
                String name = ((d.getManufacturerName() == null ? "" : d.getManufacturerName()) + " " + (d.getProductName() == null ? "" : d.getProductName())).trim();
                if (name.isEmpty()) name = String.format(Locale.ROOT, "USB %04x:%04x", d.getVendorId(), d.getProductId());
                JSObject o = new JSObject();
                o.put("id", usbIdOf(d));
                o.put("name", name);
                o.put("kind", "usb");
                o.put("printer", isPrinterClass(d) || PRINTERISH.matcher(name).find());
                arr.put(o);
            }
        }
        JSObject r = new JSObject();
        r.put("printers", arr);
        r.put("bluetoothOn", btOn);
        r.put("permission", !needsBtPermission());
        call.resolve(r);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String id = call.getString("id", "");
        byte[] bytes;
        try {
            bytes = Base64.decode(call.getString("base64", ""), Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("Bad print data");
            return;
        }
        try {
            if (id != null && id.startsWith("nbt:")) {
                if (needsBtPermission()) {
                    call.reject("Allow Nearby devices for Mahadev Desk (Android Settings → Apps → Mahadev Desk → Permissions), then try again.");
                    return;
                }
                writeBt(id.substring(4), bytes);
            } else if (id != null && id.startsWith("nusb:")) {
                writeUsb(id, bytes);
            } else {
                call.reject("Unknown printer");
                return;
            }
            JSObject r = new JSObject();
            r.put("sent", bytes.length);
            call.resolve(r);
        } catch (Exception e) {
            String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            call.reject(m);
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        jobs.submit(() -> {
            synchronized (this) {
                closeBt();
                closeUsb();
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) {
            closeBt();
            closeUsb();
        }
        jobs.shutdownNow();
        timers.shutdownNow();
    }

    // ================================================================ one print job (app 1.3.39+)
    // Save & Print sends a whole slip in ONE call. Everything that used to go wrong with the web page
    // talking to the printer piece by piece is handled here, on one queue, in order:
    //   - jobs never overlap (one thread), so two quick prints cannot mix their bytes;
    //   - connecting has a hard time limit (a sleeping printer cannot hang "Printing..." for ever);
    //   - a link the printer has dropped (switched off, slept, walked away) is noticed by a reader
    //     thread and opened again before sending, instead of writing into a dead socket;
    //   - printers that answer ESC/POS status (DLE EOT) are asked for paper first, and after sending
    //     they are asked again, so "printed" really means the printer is there;
    //   - bytes go in small paced pieces so battery printers with a 4 KB buffer (MPT-II/III) keep up;
    //   - if the link fails BEFORE any byte went out, it reconnects and tries again (3 times);
    //     if it fails AFTER some bytes went out, it stops and says so (no double slips).
    // Errors carry a code the page turns into a plain message: BT_OFF, NO_PERMISSION, NOT_PAIRED,
    // NO_ANSWER, PAPER_OUT, COVER_OPEN, PARTIAL, BAD_DATA, UNKNOWN_PRINTER.

    private final ExecutorService jobs = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "mahadev-print");
        t.setDaemon(true);
        return t;
    });
    private final ScheduledExecutorService timers = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "mahadev-print-idle");
        t.setDaemon(true);
        return t;
    });
    private ScheduledFuture<?> idleClose;
    /** set by the reader thread when the printer closed the link */
    private volatile boolean linkDead = true;
    private volatile long rxCount = 0;
    private volatile int lastRx = -1;
    /** printers that did not answer a status question this session: not asked again (saves time) */
    private final Set<String> silent = Collections.synchronizedSet(new HashSet<>());
    private final Set<String> answers = Collections.synchronizedSet(new HashSet<>());

    private static class PrintFail extends Exception {
        final String code;
        PrintFail(String code, String msg) {
            super(msg);
            this.code = code;
        }
    }

    private void fail(PluginCall call, Exception e) {
        if (e instanceof PrintFail) call.reject(e.getMessage(), ((PrintFail) e).code);
        else call.reject(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(), "NO_ANSWER");
    }

    @PluginMethod
    public void printJob(PluginCall call) {
        String id = call.getString("id", "");
        if (id != null && id.startsWith("nbt:") && needsBtPermission()) {
            requestPermissionForAlias("bluetooth", call, "printJobAfterPermission");
            return;
        }
        startJob(call);
    }

    @PermissionCallback
    private void printJobAfterPermission(PluginCall call) {
        if (needsBtPermission()) {
            call.reject("Allow Nearby devices for Mahadev Desk (Android Settings → Apps → Mahadev Desk → Permissions), then print again.", "NO_PERMISSION");
            return;
        }
        startJob(call);
    }

    private void startJob(final PluginCall call) {
        final String id = call.getString("id", "");
        final byte[] bytes;
        try {
            bytes = Base64.decode(call.getString("base64", ""), Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("Bad print data", "BAD_DATA");
            return;
        }
        if (bytes.length == 0) {
            call.reject("Nothing to print", "BAD_DATA");
            return;
        }
        final int chunk = Math.max(64, Math.min(4096, call.getInt("chunk", 512)));
        final int delayMs = Math.max(0, Math.min(500, call.getInt("delayMs", 20)));
        final boolean status = call.getBoolean("status", true);
        final long keepMs = Math.max(10_000L, Math.min(30L * 60_000L, (long) call.getInt("keepMs", 120_000)));
        jobs.submit(() -> {
            long t0 = SystemClock.elapsedRealtime();
            try {
                JSObject r;
                if (id != null && id.startsWith("nbt:")) r = runBtJob(id.substring(4), bytes, chunk, delayMs, status, keepMs);
                else if (id != null && id.startsWith("nusb:")) {
                    synchronized (this) { writeUsb(id, bytes); }
                    r = new JSObject();
                    r.put("sent", bytes.length);
                    r.put("confirmed", false);
                } else throw new PrintFail("UNKNOWN_PRINTER", "Unknown printer");
                r.put("ms", SystemClock.elapsedRealtime() - t0);
                call.resolve(r);
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    /** Open the link now (counter screen opened, first item added) so Save & Print does not wait for it. */
    @PluginMethod
    public void prepare(PluginCall call) {
        final String id = call.getString("id", "");
        if (id == null || !id.startsWith("nbt:")) {
            call.resolve();
            return;
        }
        if (needsBtPermission()) {
            call.reject("Allow Nearby devices for Mahadev Desk", "NO_PERMISSION");
            return;
        }
        final long keepMs = Math.max(10_000L, Math.min(30L * 60_000L, (long) call.getInt("keepMs", 120_000)));
        jobs.submit(() -> {
            try {
                synchronized (this) {
                    ensureLink(id.substring(4));
                    touch(keepMs);
                }
                JSObject r = new JSObject();
                r.put("ok", true);
                call.resolve(r);
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    /** Android's own "Turn on Bluetooth?" question. */
    @PluginMethod
    public void enableBluetooth(PluginCall call) {
        try {
            BluetoothAdapter a = adapter();
            if (a == null) {
                call.reject("This phone has no Bluetooth.", "BT_OFF");
                return;
            }
            if (!a.isEnabled()) {
                Intent i = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not ask to turn on Bluetooth: " + e.getMessage(), "BT_OFF");
        }
    }

    /** Android's Bluetooth settings, to pair a new printer. */
    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        try {
            getContext().startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** The whole job holds the Bluetooth gate, so the scale does not start reconnecting in the middle of a slip. */
    private JSObject runBtJob(String addr, byte[] bytes, int chunk, int delayMs, boolean status, long keepMs) throws Exception {
        boolean gate = BtLinks.enter(25000); // busy for too long: print anyway
        try {
            return runBtJobGated(addr, bytes, chunk, delayMs, status, keepMs);
        } finally {
            if (gate) BtLinks.leave();
        }
    }

    private JSObject runBtJobGated(String addr, byte[] bytes, int chunk, int delayMs, boolean status, long keepMs) throws Exception {
        Exception last = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            int[] sent = { 0 };
            try {
                synchronized (this) {
                    ensureLink(addr);
                    boolean ask = status && !silent.contains(addr);
                    if (ask) checkPaper(addr, attempt == 0 ? 450 : 700);
                    sendPaced(bytes, chunk, delayMs, sent);
                    boolean confirmed = false;
                    if (ask && answers.contains(addr)) {
                        // the printer answered before: ask again now that it has the slip. An answer = it is
                        // really there. No answer but the link is still up = a slow printer: treat as sent
                        // (not an error, so nobody prints a second copy). Link gone = say so.
                        int st;
                        try {
                            st = askStatus(1, Math.min(8000, 2500 + bytes.length / 4));
                        } catch (IOException gone) {
                            throw new PrintFail("PARTIAL", "The printer dropped the link just after the slip was sent. Check the slip; if it did not come out, print again.");
                        }
                        confirmed = st >= 0;
                    }
                    touch(keepMs);
                    JSObject r = new JSObject();
                    r.put("sent", sent[0]);
                    r.put("confirmed", confirmed);
                    r.put("attempts", attempt + 1);
                    return r;
                }
            } catch (PrintFail pf) {
                if (!"NO_ANSWER".equals(pf.code)) {
                    synchronized (this) { if ("PARTIAL".equals(pf.code)) closeBt(); }
                    throw pf;
                }
                last = pf;
                synchronized (this) { closeBt(); }
            } catch (Exception e) {
                synchronized (this) { closeBt(); }
                if (sent[0] > 0) throw new PrintFail("PARTIAL", "The printer lost the link in the middle of the slip (" + sent[0] + " of " + bytes.length + " bytes). Check the slip; if it is cut short, print again.");
                last = e;
            }
            if (attempt < 2) Thread.sleep(attempt == 0 ? 500 : 1500);
        }
        String why = last == null || last.getMessage() == null ? "" : " (" + last.getMessage() + ")";
        if (last instanceof PrintFail && !"NO_ANSWER".equals(((PrintFail) last).code)) throw last;
        throw new PrintFail("NO_ANSWER", "The Bluetooth printer did not answer. Is it switched on, near the tablet, and not connected to another phone or app?" + why);
    }

    /** Keep the link for a while after printing, then let it go (a sleeping printer drops it anyway, and
     *  another phone may want to print). Opening it again takes 1-2 seconds. */
    private void touch(long keepMs) {
        if (idleClose != null) idleClose.cancel(false);
        idleClose = timers.schedule(() -> jobs.submit(() -> {
            synchronized (this) { closeBt(); }
        }), keepMs, TimeUnit.MILLISECONDS);
    }

    private void ensureLink(String addr) throws Exception {
        if (btSocket != null && !linkDead && btSocket.isConnected() && addr.equalsIgnoreCase(btAddr)) return;
        openBt(addr);
    }

    private void sendPaced(byte[] bytes, int chunk, int delayMs, int[] sent) throws Exception {
        OutputStream out = btSocket.getOutputStream();
        for (int at = 0; at < bytes.length; at += chunk) {
            if (linkDead) throw new IOException("the printer closed the link");
            int n = Math.min(chunk, bytes.length - at);
            out.write(bytes, at, n);
            out.flush();
            sent[0] += n;
            if (delayMs > 0 && at + n < bytes.length) Thread.sleep(delayMs);
        }
    }

    /** DLE EOT n (ESC/POS real-time status). Returns the status byte, or -1 when the printer said nothing. */
    private int askStatus(int n, long waitMs) throws Exception {
        long before = rxCount;
        OutputStream out = btSocket.getOutputStream();
        out.write(new byte[] { 0x10, 0x04, (byte) n });
        out.flush();
        long end = SystemClock.elapsedRealtime() + waitMs;
        while (SystemClock.elapsedRealtime() < end) {
            if (rxCount != before) {
                int b = lastRx;
                return (b & 0x93) == 0x12 ? b : -1; // fixed bits of a real status byte
            }
            if (linkDead) throw new IOException("the printer closed the link");
            Thread.sleep(15);
        }
        return -1;
    }

    private void checkPaper(String addr, long waitMs) throws Exception {
        int paper = askStatus(4, waitMs);
        if (paper < 0) {
            if (!answers.contains(addr)) silent.add(addr);
            return;
        }
        answers.add(addr);
        if ((paper & 0x60) == 0x60) throw new PrintFail("PAPER_OUT", "The printer has no paper. Put in a new roll and print again.");
        int off = askStatus(2, 400);
        if (off >= 0 && (off & 0x04) != 0) throw new PrintFail("COVER_OPEN", "The printer's cover is open. Close it and print again.");
    }

    // ---------------------------------------------------------------- Bluetooth (classic serial)
    private synchronized void writeBt(String addr, byte[] bytes) throws Exception {
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                ensureLink(addr);
                OutputStream out = btSocket.getOutputStream();
                out.write(bytes);
                out.flush();
                touch(120_000);
                return;
            } catch (Exception e) {
                closeBt();
                if (attempt == 1) throw new Exception("The Bluetooth printer did not answer. Is it switched on, near the phone and not printing for another phone? (" + e.getMessage() + ")");
            }
        }
    }

    private void openBt(String addr) throws Exception {
        closeBt();
        BluetoothAdapter a = adapter();
        if (a == null) throw new PrintFail("BT_OFF", "This phone has no Bluetooth.");
        if (!a.isEnabled()) throw new PrintFail("BT_OFF", "Bluetooth is off. Turn it on and try again.");
        final BluetoothDevice d;
        try {
            d = a.getRemoteDevice(addr.toUpperCase(Locale.ROOT));
            if (d.getBondState() != BluetoothDevice.BOND_BONDED) throw new PrintFail("NOT_PAIRED", "This printer is not paired with the tablet any more. Pair it in Android Settings → Bluetooth (PIN 0000 or 1234).");
        } catch (SecurityException se) {
            throw new PrintFail("NO_PERMISSION", "Allow Nearby devices for Mahadev Desk (Android Settings → Apps → Mahadev Desk → Permissions).");
        } catch (IllegalArgumentException bad) {
            throw new PrintFail("UNKNOWN_PRINTER", "Bad printer address: " + addr);
        }
        // one Bluetooth connect at a time, phone-wide (the scale may be reconnecting right now): see BtLinks
        if (!BtLinks.enter(20000)) throw new PrintFail("NO_ANSWER", "Bluetooth is busy (the scale is reconnecting). Print again in a moment.");
        try {
            BluetoothSocket s = BtLinks.open(a, d, 7000, 5000, false);
            btSocket = s;
            btAddr = addr;
            startReader(s);
        } catch (SecurityException se) {
            throw new PrintFail("NO_PERMISSION", "Allow Nearby devices for Mahadev Desk (Android Settings → Apps → Mahadev Desk → Permissions).");
        } catch (PrintFail pf) {
            throw pf;
        } catch (Exception e) {
            throw new PrintFail("NO_ANSWER", "Could not connect to the printer (" + (e.getMessage() == null ? "no answer" : e.getMessage()) + ").");
        } finally {
            BtLinks.leave();
        }
    }

    /** BluetoothSocket.connect() can block for half a minute on a sleeping printer: give it a limit. */
    private static void connectWithin(final BluetoothSocket s, long ms) throws Exception {
        final Exception[] err = { null };
        Thread t = new Thread(() -> {
            try {
                s.connect();
            } catch (Exception e) {
                err[0] = e;
            }
        }, "mahadev-print-connect");
        t.setDaemon(true);
        t.start();
        t.join(ms);
        if (t.isAlive()) {
            try { s.close(); } catch (Exception ignored) {}
            t.join(1500);
            throw new IOException("no answer within " + (ms / 1000) + " s");
        }
        if (err[0] != null) throw err[0];
        if (!s.isConnected()) throw new IOException("not connected");
    }

    /** Reads whatever the printer sends (status answers) and notices at once when the link drops. */
    private void startReader(final BluetoothSocket s) {
        linkDead = false;
        lastRx = -1;
        Thread t = new Thread(() -> {
            try {
                InputStream in = s.getInputStream();
                byte[] buf = new byte[64];
                while (true) {
                    int n = in.read(buf);
                    if (n < 0) break;
                    if (n > 0) {
                        lastRx = buf[n - 1] & 0xff;
                        rxCount = rxCount + 1;
                    }
                }
            } catch (Exception ignored) {
                // closed
            }
            if (btSocket == s || btSocket == null) linkDead = true;
        }, "mahadev-print-rx");
        t.setDaemon(true);
        t.start();
    }

    private void closeBt() {
        linkDead = true;
        try { if (btSocket != null) btSocket.close(); } catch (Exception ignored) {}
        btSocket = null;
        btAddr = null;
    }

    // ---------------------------------------------------------------- USB (OTG)
    private static String usbIdOf(UsbDevice d) {
        return String.format(Locale.ROOT, "nusb:%04x:%04x", d.getVendorId(), d.getProductId());
    }

    private static boolean isPrinterClass(UsbDevice d) {
        for (int i = 0; i < d.getInterfaceCount(); i++) if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return true;
        return false;
    }

    /** The interface and bulk-out endpoint to send to: a printer-class one first. */
    private static Object[] findOut(UsbDevice d) {
        Object[] fallback = null;
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface f = d.getInterface(i);
            for (int e = 0; e < f.getEndpointCount(); e++) {
                UsbEndpoint ep = f.getEndpoint(e);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                    if (f.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return new Object[] { f, ep };
                    if (fallback == null && (f.getInterfaceClass() == UsbConstants.USB_CLASS_VENDOR_SPEC || f.getInterfaceClass() == UsbConstants.USB_CLASS_PER_INTERFACE)) fallback = new Object[] { f, ep };
                }
            }
        }
        return fallback;
    }

    private synchronized void writeUsb(String id, byte[] bytes) throws Exception {
        UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (um == null) throw new Exception("This phone has no USB host support.");
        UsbDevice dev = null;
        for (UsbDevice d : um.getDeviceList().values()) if (usbIdOf(d).equals(id)) dev = d;
        if (dev == null) {
            closeUsb();
            throw new Exception("The USB printer is not plugged in. Connect it with the OTG cable.");
        }
        if (!um.hasPermission(dev) && !askUsb(um, dev)) throw new Exception("Allow Mahadev Desk to use the USB printer (tap OK when Android asks), then print again.");
        if (usbConn == null || !id.equals(usbId)) {
            closeUsb();
            Object[] io = findOut(dev);
            if (io == null) throw new Exception("This USB device has no printer channel.");
            UsbDeviceConnection c = um.openDevice(dev);
            if (c == null) throw new Exception("Could not open the USB printer.");
            if (!c.claimInterface((UsbInterface) io[0], true)) {
                c.close();
                throw new Exception("The USB printer is busy.");
            }
            usbConn = c;
            usbIface = (UsbInterface) io[0];
            usbOut = (UsbEndpoint) io[1];
            usbId = id;
        }
        int at = 0;
        while (at < bytes.length) {
            int n = Math.min(16384, bytes.length - at);
            int w = usbConn.bulkTransfer(usbOut, bytes, at, n, 8000);
            if (w < 0) {
                closeUsb();
                throw new Exception("The USB printer stopped taking data. Check paper and cable.");
            }
            at += w;
        }
    }

    private boolean askUsb(UsbManager um, UsbDevice dev) throws InterruptedException {
        final CountDownLatch done = new CountDownLatch(1);
        final boolean[] ok = { false };
        BroadcastReceiver r = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                if (USB_PERMISSION.equals(i.getAction())) {
                    ok[0] = i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                    done.countDown();
                }
            }
        };
        ContextCompat.registerReceiver(getContext(), r, new IntentFilter(USB_PERMISSION), ContextCompat.RECEIVER_NOT_EXPORTED);
        try {
            Intent i = new Intent(USB_PERMISSION).setPackage(getContext().getPackageName());
            int flags = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
            um.requestPermission(dev, PendingIntent.getBroadcast(getContext(), 77, i, flags));
            done.await(45, TimeUnit.SECONDS);
        } finally {
            try { getContext().unregisterReceiver(r); } catch (Exception ignored) {}
        }
        return ok[0] || um.hasPermission(dev);
    }

    private void closeUsb() {
        try {
            if (usbConn != null) {
                if (usbIface != null) usbConn.releaseInterface(usbIface);
                usbConn.close();
            }
        } catch (Exception ignored) {}
        usbConn = null;
        usbIface = null;
        usbOut = null;
        usbId = null;
    }
}
