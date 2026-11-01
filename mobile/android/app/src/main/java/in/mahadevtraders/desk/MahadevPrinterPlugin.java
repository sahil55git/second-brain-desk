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

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
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

    private BluetoothSocket btSocket;
    private String btAddr;
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
                        if (major == BluetoothClass.Device.Major.AUDIO_VIDEO || major == BluetoothClass.Device.Major.PHONE || major == BluetoothClass.Device.Major.COMPUTER
                                || major == BluetoothClass.Device.Major.WEARABLE || major == BluetoothClass.Device.Major.HEALTH || major == BluetoothClass.Device.Major.TOY) continue;
                        JSObject o = new JSObject();
                        o.put("id", "nbt:" + d.getAddress());
                        o.put("name", name);
                        o.put("kind", "bluetooth");
                        o.put("printer", major == BluetoothClass.Device.Major.IMAGING || PRINTERISH.matcher(name).find());
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
        closeBt();
        closeUsb();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        closeBt();
        closeUsb();
    }

    // ---------------------------------------------------------------- Bluetooth (classic serial)
    private synchronized void writeBt(String addr, byte[] bytes) throws Exception {
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                if (btSocket == null || !btSocket.isConnected() || !addr.equalsIgnoreCase(btAddr)) openBt(addr);
                OutputStream out = btSocket.getOutputStream();
                out.write(bytes);
                out.flush();
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
        if (a == null) throw new Exception("This phone has no Bluetooth.");
        if (!a.isEnabled()) throw new Exception("Bluetooth is off. Turn it on and try again.");
        BluetoothDevice d = a.getRemoteDevice(addr);
        try { a.cancelDiscovery(); } catch (SecurityException ignored) {}
        BluetoothSocket s;
        try {
            s = d.createRfcommSocketToServiceRecord(SPP);
            s.connect();
        } catch (Exception first) {
            try {
                s = d.createInsecureRfcommSocketToServiceRecord(SPP);
                s.connect();
            } catch (Exception second) {
                // some cheap printers only answer on channel 1
                Method m = d.getClass().getMethod("createRfcommSocket", int.class);
                s = (BluetoothSocket) m.invoke(d, 1);
                s.connect();
            }
        }
        btSocket = s;
        btAddr = addr;
    }

    private void closeBt() {
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
