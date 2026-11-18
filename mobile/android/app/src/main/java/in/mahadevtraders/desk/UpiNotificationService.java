package in.mahadevtraders.desk;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * Reads the "payment received" notifications of the UPI apps on this device (PhonePe, Google Pay,
 * Paytm, BharatPe …) once the owner allows Notification access. Only those apps are looked at;
 * every other notification is ignored and never stored. The last few are kept on this device so
 * the page can pick them up when it opens; what they mean is decided by the page (lib/upiNotify.ts).
 */
public class UpiNotificationService extends NotificationListenerService {
    static final String PREFS = "mahadev_upi";
    static final String KEY = "events";
    private static final int MAX = 60;
    private static final long KEEP_MS = 2L * 24 * 60 * 60 * 1000;
    private static final String[] WATCH = { "phonepe", "paisa", "paytm", "bharatpe", "mobikwik", "razorpay", "cred.club", "amazon.mshop", "freecharge", "airtel" };

    static boolean watched(String pkg) {
        String p = pkg.toLowerCase(Locale.ROOT);
        for (String w : WATCH) if (p.contains(w)) return true;
        return false;
    }

    private static String str(CharSequence c) {
        return c == null ? "" : c.toString().trim();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null) return;
            String pkg = sbn.getPackageName();
            if (pkg == null || pkg.equals(getPackageName()) || !watched(pkg)) return;
            Notification n = sbn.getNotification();
            if (n == null || n.extras == null) return;
            Bundle x = n.extras;
            String title = str(x.getCharSequence(Notification.EXTRA_TITLE));
            String text = str(x.getCharSequence(Notification.EXTRA_BIG_TEXT));
            if (text.isEmpty()) text = str(x.getCharSequence(Notification.EXTRA_TEXT));
            if (title.isEmpty() && text.isEmpty()) return;
            add(this, pkg, title, text, sbn.getPostTime());
        } catch (Exception ignored) {
            // a notification we cannot read is simply skipped
        }
    }

    static synchronized void add(Context c, String pkg, String title, String text, long at) throws Exception {
        SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray old = new JSONArray(sp.getString(KEY, "[]"));
        String id = pkg + ":" + at + ":" + (title + text).hashCode();
        long now = System.currentTimeMillis();
        JSONArray out = new JSONArray();
        for (int i = 0; i < old.length(); i++) {
            JSONObject o = old.getJSONObject(i);
            if (id.equals(o.optString("id"))) return; // the same notification again
            if (now - o.optLong("at", 0) <= KEEP_MS) out.put(o);
        }
        JSONObject e = new JSONObject();
        e.put("id", id);
        e.put("pkg", pkg);
        e.put("title", title);
        e.put("text", text);
        e.put("at", at);
        out.put(e);
        JSONArray trimmed = new JSONArray();
        for (int i = Math.max(0, out.length() - MAX); i < out.length(); i++) trimmed.put(out.get(i));
        sp.edit().putString(KEY, trimmed.toString()).apply();
    }
}
