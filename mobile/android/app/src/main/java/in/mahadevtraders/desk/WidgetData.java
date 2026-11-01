package in.mahadevtraders.desk;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.util.TypedValue;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Everything the home-screen widgets and the alerts need: the saved settings (site address,
 * widget key, look), fetching /api/device/summary, drawing the three widgets and posting alerts.
 */
public final class WidgetData {
    private WidgetData() {}

    public static final String PREFS = "mahadev_widgets";
    public static final String K_BASE = "baseUrl";
    public static final String K_TOKEN = "token";
    public static final String K_ROLE = "role";
    public static final String K_NAME = "name";
    public static final String K_JSON = "summary";
    public static final String K_LAST_OK = "lastOk";
    public static final String K_LAST_ERR = "lastError";
    public static final String K_STYLE = "style";
    public static final String K_OPACITY = "opacity";
    public static final String K_TEXT = "textSize";
    public static final String K_ALERTS = "alerts";
    public static final String K_SEEN = "seenAlerts";
    public static final String K_AWAKE = "keepAwake";
    public static final String EXTRA_PATH = "in.mahadevtraders.desk.PATH";
    public static final String ACTION_REFRESH = "in.mahadevtraders.desk.REFRESH";
    public static final String CHANNEL_ALERTS = "alerts";

    public static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String baseUrl(Context c) {
        String b = prefs(c).getString(K_BASE, null);
        if (b == null || b.isEmpty()) b = c.getString(R.string.app_base_url);
        while (b.endsWith("/")) b = b.substring(0, b.length() - 1);
        return b;
    }

    public static boolean isOn(Context c) {
        String t = prefs(c).getString(K_TOKEN, null);
        return t != null && !t.isEmpty();
    }

    private static int piFlags() {
        return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    /** Tapping opens this page of the site in the app. */
    public static PendingIntent open(Context c, String path, int requestCode) {
        Intent i = new Intent(c, MainActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setData(Uri.parse(baseUrl(c) + path));
        i.putExtra(EXTRA_PATH, path);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, requestCode, i, piFlags());
    }

    private static PendingIntent refresh(Context c, Class<?> provider) {
        Intent i = new Intent(c, provider);
        i.setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(c, 900 + provider.getSimpleName().length(), i, piFlags());
    }

    // ------------------------------------------------------------------ fetching
    /** Fetch the summary now (call off the main thread). Returns null on success, else the problem. */
    public static String fetch(Context c) {
        SharedPreferences p = prefs(c);
        String token = p.getString(K_TOKEN, null);
        if (token == null || token.isEmpty()) return "Widgets are off";
        HttpURLConnection conn = null;
        try {
            URL url = new URL(baseUrl(c) + "/api/device/summary");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Accept", "application/json");
            int code = conn.getResponseCode();
            BufferedReader r = new BufferedReader(new InputStreamReader(code >= 400 ? conn.getErrorStream() : conn.getInputStream(), "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            if (code == 401) {
                p.edit().putString(K_LAST_ERR, "This phone's widget key was switched off").apply();
                return "key switched off";
            }
            if (code >= 400) {
                String msg = "Server said " + code;
                try { msg = new JSONObject(sb.toString()).optString("error", msg); } catch (Exception ignored) {}
                p.edit().putString(K_LAST_ERR, msg).apply();
                return msg;
            }
            JSONObject j = new JSONObject(sb.toString());
            p.edit().putString(K_JSON, j.toString()).putLong(K_LAST_OK, System.currentTimeMillis()).remove(K_LAST_ERR).apply();
            if (p.getBoolean(K_ALERTS, true)) postAlerts(c, j.optJSONArray("alerts"));
            return null;
        } catch (Exception e) {
            String msg = "No internet or the site did not answer";
            p.edit().putString(K_LAST_ERR, msg).apply();
            return msg;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // ------------------------------------------------------------------ alerts
    public static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ALERTS) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ALERTS, "Shop alerts", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Barrels waiting, cash not counted, low stock, job-work overdue");
        nm.createNotificationChannel(ch);
    }

    private static void postAlerts(Context c, JSONArray alerts) {
        if (alerts == null || alerts.length() == 0) return;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
        SharedPreferences p = prefs(c);
        JSONArray seen;
        try { seen = new JSONArray(p.getString(K_SEEN, "[]")); } catch (Exception e) { seen = new JSONArray(); }
        ensureChannel(c);
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        for (int i = 0; i < alerts.length(); i++) {
            JSONObject a = alerts.optJSONObject(i);
            if (a == null) continue;
            String id = a.optString("id");
            if (id.isEmpty() || contains(seen, id)) continue;
            seen.put(id);
            NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL_ALERTS)
                    .setSmallIcon(R.drawable.ic_stat_notify)
                    .setContentTitle(a.optString("title"))
                    .setContentText(a.optString("text"))
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(a.optString("text")))
                    .setAutoCancel(true)
                    .setContentIntent(open(c, a.optString("url", "/"), 1000 + Math.abs(id.hashCode() % 5000)));
            try { nm.notify(Math.abs(id.hashCode()), b.build()); } catch (SecurityException ignored) {}
        }
        // keep the newest 60 ids
        JSONArray keep = new JSONArray();
        for (int i = Math.max(0, seen.length() - 60); i < seen.length(); i++) keep.put(seen.opt(i));
        p.edit().putString(K_SEEN, keep.toString()).apply();
    }

    private static boolean contains(JSONArray a, String v) {
        for (int i = 0; i < a.length(); i++) if (v.equals(a.optString(i))) return true;
        return false;
    }

    // ------------------------------------------------------------------ drawing
    private static final class Look {
        int bg; int text; int soft; int alpha; float scale;
    }

    private static Look look(Context c) {
        SharedPreferences p = prefs(c);
        String style = p.getString(K_STYLE, "dark");
        Look l = new Look();
        if ("light".equals(style)) { l.bg = R.drawable.widget_bg_light; l.text = Color.parseColor("#1d2422"); l.soft = Color.parseColor("#5f6b66"); }
        else if ("glass".equals(style)) { l.bg = R.drawable.widget_bg_glass; l.text = Color.WHITE; l.soft = Color.parseColor("#e6ffffff"); }
        else { l.bg = R.drawable.widget_bg_dark; l.text = Color.parseColor("#f5ead7"); l.soft = Color.parseColor("#c9bda6"); }
        int op = p.getInt(K_OPACITY, 90);
        l.alpha = Math.max(30, Math.min(255, Math.round(op * 2.55f)));
        String ts = p.getString(K_TEXT, "m");
        l.scale = "s".equals(ts) ? 0.86f : "l".equals(ts) ? 1.2f : 1f;
        return l;
    }

    private static void paint(RemoteViews v, Look l) {
        v.setImageViewResource(R.id.bg, l.bg);
        v.setInt(R.id.bg, "setImageAlpha", l.alpha);
    }

    private static void text(RemoteViews v, int id, CharSequence s, int color, float sp, Look l) {
        v.setTextViewText(id, s);
        v.setTextColor(id, color);
        v.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, sp * l.scale);
    }

    private static String rupees(double n) {
        NumberFormat f = NumberFormat.getIntegerInstance(new Locale("en", "IN"));
        return "₹" + f.format(Math.round(n));
    }

    private static String clock(long t) {
        SimpleDateFormat f = new SimpleDateFormat("h:mm a", Locale.ENGLISH);
        f.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
        return f.format(new Date(t));
    }

    private static JSONObject summary(Context c) {
        try { return new JSONObject(prefs(c).getString(K_JSON, "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    public static RemoteViews summaryViews(Context c) {
        Look l = look(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_summary);
        paint(v, l);
        JSONObject j = summary(c);
        JSONObject m = j.optJSONObject("money");
        JSONObject b = j.optJSONObject("barrels");
        long ok = prefs(c).getLong(K_LAST_OK, 0);
        text(v, R.id.title, m != null ? "Mahadev · Today" : "Mahadev · Barrels", l.soft, 12, l);
        text(v, R.id.time, ok > 0 ? clock(ok) : "", l.soft, 11, l);
        if (!isOn(c)) {
            text(v, R.id.big, "Open the app", l.text, 20, l);
            text(v, R.id.line1, "☰ → Android app → Turn on widgets", l.soft, 12, l);
            text(v, R.id.line2, "", l.soft, 12, l);
            text(v, R.id.line3, "", l.soft, 12, l);
        } else if (m != null) {
            text(v, R.id.big, rupees(m.optDouble("sold")) + " sold", l.text, 24, l);
            text(v, R.id.line1, "Cash " + rupees(m.optDouble("cashIn")) + "  ·  UPI " + rupees(m.optDouble("upiIn")), l.text, 13, l);
            text(v, R.id.line2, "Spent " + rupees(m.optDouble("spent")) + "  ·  Udhaar " + rupees(m.optDouble("udhaar")), l.soft, 12, l);
            text(v, R.id.line3, barrelLine(b) + "  ·  Job-work " + m.optInt("jobWorkWaiting"), l.soft, 12, l);
        } else {
            text(v, R.id.big, b != null ? b.optInt("waitingEmpty") + " waiting to empty" : "…", l.text, 20, l);
            text(v, R.id.line1, b != null ? b.optInt("toWeighFull") + " to weigh full" : "Tap ⟳ to update", l.text, 13, l);
            text(v, R.id.line2, b != null && b.optInt("oldestDays") > 0 ? "Oldest " + b.optInt("oldestDays") + " day(s)" : "", l.soft, 12, l);
            text(v, R.id.line3, "", l.soft, 12, l);
        }
        String err = prefs(c).getString(K_LAST_ERR, null);
        if (err != null && isOn(c)) text(v, R.id.line3, "⚠ " + err, Color.parseColor("#ff8a7a"), 11, l);
        v.setTextColor(R.id.refresh, l.text);
        v.setOnClickPendingIntent(R.id.body, open(c, m != null ? "/" : "/barrels", 11));
        v.setOnClickPendingIntent(R.id.refresh, refresh(c, SummaryWidget.class));
        return v;
    }

    private static String barrelLine(JSONObject b) {
        if (b == null) return "Barrels –";
        return "🛢 " + b.optInt("toWeighFull") + " to weigh · " + b.optInt("waitingEmpty") + " waiting";
    }

    public static RemoteViews barrelViews(Context c) {
        Look l = look(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_barrels);
        paint(v, l);
        JSONObject b = summary(c).optJSONObject("barrels");
        text(v, R.id.title, "🛢 Barrels", l.soft, 12, l);
        text(v, R.id.full_n, b != null ? String.valueOf(b.optInt("toWeighFull")) : "–", l.text, 26, l);
        text(v, R.id.full_l, "to weigh full", l.soft, 11, l);
        text(v, R.id.empty_n, b != null ? String.valueOf(b.optInt("waitingEmpty")) : "–", l.text, 26, l);
        text(v, R.id.empty_l, b != null && b.optInt("waitingLong") > 0 ? b.optInt("waitingLong") + " waiting 7+ days" : "waiting to empty", b != null && b.optInt("waitingLong") > 0 ? Color.parseColor("#ff8a7a") : l.soft, 11, l);
        text(v, R.id.btn_full, "⚖ Weigh full", l.text, 13, l);
        text(v, R.id.btn_empty, "🛢 Weigh empty", l.text, 13, l);
        v.setTextColor(R.id.refresh, l.text);
        v.setOnClickPendingIntent(R.id.btn_full, open(c, "/barrels?weigh=full", 21));
        v.setOnClickPendingIntent(R.id.btn_empty, open(c, "/barrels?weigh=empty", 22));
        v.setOnClickPendingIntent(R.id.counts, open(c, "/barrels?simple=1", 23));
        v.setOnClickPendingIntent(R.id.refresh, refresh(c, BarrelsWidget.class));
        return v;
    }

    private static final int[] ACT_IDS = { R.id.a1, R.id.a2, R.id.a3, R.id.a4, R.id.a5, R.id.a6 };
    private static final String[][] ACTS = {
            { "💰\nSale", "/register?open=sale" },
            { "🧾\nExpense", "/register?open=expense" },
            { "🙌\nUdhaar in", "/register?open=udhaar" },
            { "⚖\nWeigh full", "/barrels?weigh=full" },
            { "💵\nCash", "/cash" },
            { "📱\nQuick card", "/quick" },
    };

    public static RemoteViews actionViews(Context c) {
        Look l = look(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_actions);
        paint(v, l);
        for (int i = 0; i < ACT_IDS.length; i++) {
            text(v, ACT_IDS[i], ACTS[i][0], l.text, 13, l);
            v.setOnClickPendingIntent(ACT_IDS[i], open(c, ACTS[i][1], 31 + i));
        }
        return v;
    }

    /** Redraw every widget of every kind. */
    public static void renderAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] s = m.getAppWidgetIds(new ComponentName(c, SummaryWidget.class));
        if (s.length > 0) m.updateAppWidget(s, summaryViews(c));
        int[] b = m.getAppWidgetIds(new ComponentName(c, BarrelsWidget.class));
        if (b.length > 0) m.updateAppWidget(b, barrelViews(c));
        int[] a = m.getAppWidgetIds(new ComponentName(c, ActionsWidget.class));
        if (a.length > 0) m.updateAppWidget(a, actionViews(c));
    }
}
