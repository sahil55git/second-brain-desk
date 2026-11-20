package in.mahadevtraders.desk;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Shared rules for the classic-Bluetooth (serial port) links of the scale and the label printer.
 *
 * Why this exists: on cheap Android phones two Bluetooth connects at the same moment (the scale
 * reconnecting while the printer connects) make BOTH fail ("read failed, socket might closed or
 * timeout"), and a print sent while the scale is paging is slow. So:
 *   - only ONE connect runs at a time, phone-wide (the GATE, fair: first come, first served);
 *   - a print job holds the gate for the whole job, so the scale never pages in the middle of it;
 *   - every connect has a hard time limit (a switched-off device cannot hang "Connecting…");
 *   - the way that worked for a device (secure / insecure / channel 1) is remembered and tried first,
 *     so a reconnect is one quick try instead of three slow ones.
 */
final class BtLinks {
    static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    /** One Bluetooth connect (or one print job) at a time, across the whole app. */
    static final ReentrantLock GATE = new ReentrantLock(true);

    /** address → the way (0, 1, 2) that connected last time */
    private static final Map<String, Integer> WAY = new ConcurrentHashMap<>();

    private BtLinks() {}

    /** Takes the gate, waiting at most `ms`. False = someone else is busy for too long. */
    static boolean enter(long ms) {
        try {
            return GATE.tryLock(ms, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    static void leave() {
        if (GATE.isHeldByCurrentThread()) GATE.unlock();
    }

    /** Someone (a print job) is waiting for the gate: a background reconnect should step aside. */
    static boolean othersWaiting() {
        return GATE.hasQueuedThreads();
    }

    /**
     * Opens a serial-port link to `d`. The caller must hold the GATE. Tries the way that worked last
     * time first; `quick` = only that one way (for background reconnects of a known device).
     */
    static BluetoothSocket open(BluetoothAdapter a, BluetoothDevice d, long firstMs, long otherMs, boolean quick) throws Exception {
        try { a.cancelDiscovery(); } catch (SecurityException ignored) {} // a running scan slows every connect
        String key = d.getAddress().toUpperCase(Locale.ROOT);
        Integer known = WAY.get(key);
        int[] order = known == null ? new int[] { 0, 1, 2 } : known == 0 ? new int[] { 0, 1, 2 } : known == 1 ? new int[] { 1, 0, 2 } : new int[] { 2, 0, 1 };
        int tries = quick && known != null ? 1 : 3;
        Exception last = null;
        for (int i = 0; i < tries; i++) {
            int way = order[i];
            BluetoothSocket s = null;
            try {
                if (way == 0) s = d.createRfcommSocketToServiceRecord(SPP);
                else if (way == 1) s = d.createInsecureRfcommSocketToServiceRecord(SPP);
                else {
                    Method m = d.getClass().getMethod("createRfcommSocket", int.class);
                    s = (BluetoothSocket) m.invoke(d, 1);
                }
                connectWithin(s, i == 0 ? firstMs : otherMs);
                WAY.put(key, way);
                return s;
            } catch (SecurityException se) {
                throw se;
            } catch (Exception e) {
                last = e;
                try { if (s != null) s.close(); } catch (Exception ignored) {}
                try { Thread.sleep(200); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
            }
        }
        throw last != null ? last : new IOException("no answer");
    }

    /** BluetoothSocket.connect() can block for half a minute on a sleeping device: give it a limit. */
    static void connectWithin(final BluetoothSocket s, long ms) throws Exception {
        final Exception[] err = { null };
        Thread t = new Thread(() -> {
            try {
                s.connect();
            } catch (Exception e) {
                err[0] = e;
            }
        }, "mahadev-bt-connect");
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
}
