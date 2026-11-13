package in.mahadevtraders.desk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * All home-screen widgets: which kinds exist, how each is drawn, the customisable quick buttons,
 * the sticky note and the "live" notification that stays in the status bar.
 */
public final class Widgets {
    private Widgets() {}

    public static final String ACTION_RANGE = "in.mahadevtraders.desk.RANGE";
    public static final String EXTRA_RANGE = "range";
    static final String K_RANGE = "dashRange";
    static final String K_ACTIONS = "actions";
    static final String K_NOTE = "note";
    static final String K_NOTE_COLOR = "noteColor";
    static final String K_LIVE = "live";
    static final String K_EVERY = "everyMinutes";
    static final String CHANNEL_LIVE = "live";
    static final int LIVE_ID = 4711;

    /** kind → provider class, in the order the app lists them. */
    public static final Map<String, Class<?>> KINDS = new LinkedHashMap<>();
    static {
        KINDS.put("dashboard", DashboardWidget.class);
        KINDS.put("summary", SummaryWidget.class);
        KINDS.put("actions", ActionsWidget.class);
        KINDS.put("barrels", BarrelsWidget.class);
        KINDS.put("cash", CashWidget.class);
        KINDS.put("udhaar", UdhaarWidget.class);
        KINDS.put("jobwork", JobWorkWidget.class);
        KINDS.put("stock", StockWidget.class);
        KINDS.put("alerts", AlertsWidget.class);
        KINDS.put("note", NoteWidget.class);
        KINDS.put("chat", ChatWidget.class);
        KINDS.put("tips", TipsWidget.class);
        KINDS.put("tasks", TasksWidget.class);
        KINDS.put("keypad", KeypadWidget.class);
        KINDS.put("me", MeWidget.class);
        KINDS.put("approvals", ApprovalsWidget.class);
    }

    public static RemoteViews views(Context c, String kind) {
        switch (kind) {
            case "dashboard": return dashboard(c);
            case "summary": return WidgetData.summaryViews(c);
            case "barrels": return WidgetData.barrelViews(c);
            case "actions": return actionViews(c);
            case "cash": return cash(c);
            case "note": return note(c);
            case "chat": return chat(c);
            case "keypad": return keypad(c);
            case "me": return me(c);
            default: return list(c, kind);
        }
    }

    public static void renderAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Map.Entry<String, Class<?>> e : KINDS.entrySet()) {
            int[] ids = m.getAppWidgetIds(new ComponentName(c, e.getValue()));
            for (int id : ids) render(c, m, id, e.getKey());
        }
        postLive(c);
    }

    /** Draw one widget, with text sized to how big it is on the home screen (bigger on tablets). */
    public static void render(Context c, AppWidgetManager m, int id, String kind) {
        WidgetData.boost = sizeBoost(c, m, id);
        try { m.updateAppWidget(id, views(c, kind)); } finally { WidgetData.boost = 1f; }
    }

    static float sizeBoost(Context c, AppWidgetManager m, int id) {
        android.os.Bundle o = m.getAppWidgetOptions(id);
        int w = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        float b = 1f;
        if (w > 0) b = Math.min(w / 260f, h > 0 ? h / 170f : 9f);
        if (c.getResources().getConfiguration().smallestScreenWidthDp >= 600) b = Math.max(b, 1.15f);
        return Math.max(0.9f, Math.min(1.6f, b));
    }

    // ------------------------------------------------------------------ keypad: type an amount, tap a kind
    public static final String ACTION_KEY = "in.mahadevtraders.desk.KEY";
    public static final String EXTRA_KEY = "key";
    static final String K_PAD = "padAmount";
    private static final int[] PAD_IDS = { R.id.d0, R.id.d1, R.id.d2, R.id.d3, R.id.d4, R.id.d5, R.id.d6, R.id.d7, R.id.d8, R.id.d9 };
    private static final String[][] PAD_ACTS = {
            { "💰 Cash sale", "sale %s cash" },
            { "📱 UPI sale", "sale %s upi" },
            { "🧾 Expense", "expense %s" },
            { "🙌 Udhaar in", "udhaar received %s" },
    };

    private static PendingIntent key(Context c, String k, int code) {
        Intent i = new Intent(c, KeypadWidget.class);
        i.setAction(ACTION_KEY);
        i.putExtra(EXTRA_KEY, k);
        return PendingIntent.getBroadcast(c, 500 + code, i, WidgetData.piFlags());
    }

    /** A keypad press: digits build the amount (max 8 digits), ⌫ removes one, C clears. */
    public static void key(Context c, String k) {
        if (k == null) return;
        SharedPreferences p = WidgetData.prefs(c);
        String a = p.getString(K_PAD, "");
        if ("C".equals(k)) a = "";
        else if ("<".equals(k)) a = a.isEmpty() ? "" : a.substring(0, a.length() - 1);
        else if (k.matches("\\d+")) { a = (a + k).replaceFirst("^0+", ""); if (a.length() > 8) a = a.substring(0, 8); }
        p.edit().putString(K_PAD, a).apply();
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, KeypadWidget.class))) render(c, m, id, "keypad");
    }

    static RemoteViews keypad(Context c) {
        WidgetData.Look l = WidgetData.look(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_keypad);
        WidgetData.paint(v, l);
        String a = WidgetData.prefs(c).getString(K_PAD, "");
        WidgetData.text(v, R.id.title, "⌨ Quick entry", l.soft, 12, l);
        WidgetData.text(v, R.id.amount, a.isEmpty() ? "₹ 0" : WidgetData.rupees(Double.parseDouble(a)), l.text, 22, l);
        WidgetData.text(v, R.id.back, "⌫", l.text, 18, l);
        v.setOnClickPendingIntent(R.id.back, key(c, "<", 10));
        for (int d = 0; d < 10; d++) {
            WidgetData.text(v, PAD_IDS[d], String.valueOf(d), l.text, 20, l);
            v.setOnClickPendingIntent(PAD_IDS[d], key(c, String.valueOf(d), d));
        }
        WidgetData.text(v, R.id.d00, "00", l.text, 18, l);
        v.setOnClickPendingIntent(R.id.d00, key(c, "00", 11));
        WidgetData.text(v, R.id.dc, "C", l.soft, 18, l);
        v.setOnClickPendingIntent(R.id.dc, key(c, "C", 12));
        int[] xs = { R.id.x1, R.id.x2, R.id.x3, R.id.x4 };
        for (int i = 0; i < xs.length; i++) {
            WidgetData.text(v, xs[i], PAD_ACTS[i][0], l.text, 12, l);
            // Opens the entry form already filled in; the person checks it and presses Save.
            String say = a.isEmpty() ? PAD_ACTS[i][1].replace(" %s", "") : String.format(PAD_ACTS[i][1], a);
            String path = "/register?say=" + android.net.Uri.encode(say) + "&from=keypad";
            v.setOnClickPendingIntent(xs[i], WidgetData.pop(c, path, 540 + i + (a.hashCode() & 0xff) * 4, false));
        }
        return v;
    }

    // ------------------------------------------------------------------ my work (staff)
    private static final int[] ME_BTN = { R.id.b1, R.id.b2, R.id.b3, R.id.b4, R.id.b5, R.id.b6 };
    private static final String[][] ME_ACTS = {
            { "💰\nSale", "/register?open=sale" },
            { "🧾\nExpense", "/register?open=expense" },
            { "🌾\nJob-work in", "/?desk=jobwork" },
            { "⚖\nWeigh barrel", "/barrels?weigh=full" },
            { "🏭\nProduction", "/?desk=mfg" },
            { "🎙\nSpeak entry", "/register?open=sale" },
    };

    static RemoteViews me(Context c) {
        WidgetData.Look l = WidgetData.look(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_me);
        WidgetData.paint(v, l);
        JSONObject j = WidgetData.summary(c);
        JSONObject me = j.optJSONObject("me");
        String name = me == null ? "" : me.optString("name");
        WidgetData.text(v, R.id.title, "👷 " + (name.isEmpty() ? "My work today" : name + " · today"), l.text, 14, l);
        v.setTextColor(R.id.refresh, l.text);
        v.setOnClickPendingIntent(R.id.refresh, WidgetData.refresh(c, MeWidget.class));
        if (me == null) {
            WidgetData.text(v, R.id.v1, "–", l.text, 20, l); WidgetData.text(v, R.id.k1, "my entries", l.soft, 11, l);
            WidgetData.text(v, R.id.v2, "–", l.text, 20, l); WidgetData.text(v, R.id.k2, "waiting OK", l.soft, 11, l);
            WidgetData.text(v, R.id.v3, "–", l.text, 20, l); WidgetData.text(v, R.id.k3, "job-work", l.soft, 11, l);
            WidgetData.text(v, R.id.line, WidgetData.isOn(c) ? "Tap ⟳ to load" : "Open the app and log in", l.soft, 12, l);
        } else {
            int wait = me.optInt("waitingOk");
            WidgetData.text(v, R.id.v1, String.valueOf(me.optInt("entries")), l.text, 20, l);
            WidgetData.text(v, R.id.k1, "my entries", l.soft, 11, l);
            WidgetData.text(v, R.id.v2, String.valueOf(wait), wait > 0 ? Color.parseColor("#ffc46b") : l.text, 20, l);
            WidgetData.text(v, R.id.k2, "waiting OK", l.soft, 11, l);
            WidgetData.text(v, R.id.v3, me.optInt("jobWorkLots") + "", l.text, 20, l);
            WidgetData.text(v, R.id.k3, Math.round(me.optDouble("jobWorkKg")) + " kg job-work", l.soft, 11, l);
            String last = me.optString("last");
            WidgetData.text(v, R.id.line, last.isEmpty() ? "Nothing entered yet today" : "Last: " + last, l.soft, 12, l);
        }
        v.setOnClickPendingIntent(R.id.body, WidgetData.pop(c, "/register", 87, false));
        for (int i = 0; i < ME_BTN.length; i++) {
            WidgetData.text(v, ME_BTN[i], ME_ACTS[i][0], l.text, 12, l);
            v.setOnClickPendingIntent(ME_BTN[i], WidgetData.pop(c, ME_ACTS[i][1], 560 + i, i == 5));
        }
        return v;
    }

    private static PendingIntent range(Context c, String r, int code) {
        Intent i = new Intent(c, DashboardWidget.class);
        i.setAction(ACTION_RANGE);
        i.putExtra(EXTRA_RANGE, r);
        return PendingIntent.getBroadcast(c, code, i, WidgetData.piFlags());
    }

    private static String pct(JSONObject o) {
        if (o == null || o.isNull("changePct")) return "";
        double p = o.optDouble("changePct");
        return (p >= 0 ? "▲ " : "▼ ") + Math.abs(Math.round(p * 10) / 10.0) + "%";
    }

    // ------------------------------------------------------------------ dashboard (big, interactive)
    static RemoteViews dashboard(Context c) {
        WidgetData.Look l = WidgetData.look(c);
        SharedPreferences p = WidgetData.prefs(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_dashboard);
        WidgetData.paint(v, l);
        JSONObject j = WidgetData.summary(c);
        JSONObject m = j.optJSONObject("money");
        JSONObject b = j.optJSONObject("barrels");
        String r = p.getString(K_RANGE, "today");
        JSONObject cur = "week".equals(r) ? j.optJSONObject("week") : "month".equals(r) ? j.optJSONObject("month") : m;
        long ok = p.getLong(WidgetData.K_LAST_OK, 0);
        WidgetData.text(v, R.id.title, "Mahadev" + (ok > 0 ? " · " + WidgetData.clock(ok) : ""), l.soft, 12, l);
        int on = Color.parseColor("#e0a526");
        WidgetData.text(v, R.id.rt, "Today", "today".equals(r) ? on : l.soft, 12, l);
        WidgetData.text(v, R.id.rw, "Week", "week".equals(r) ? on : l.soft, 12, l);
        WidgetData.text(v, R.id.rm, "Month", "month".equals(r) ? on : l.soft, 12, l);
        v.setOnClickPendingIntent(R.id.rt, range(c, "today", 61));
        v.setOnClickPendingIntent(R.id.rw, range(c, "week", 62));
        v.setOnClickPendingIntent(R.id.rm, range(c, "month", 63));
        v.setTextColor(R.id.refresh, l.text);
        v.setOnClickPendingIntent(R.id.refresh, WidgetData.refresh(c, DashboardWidget.class));
        if (!WidgetData.isOn(c) || m == null) {
            WidgetData.text(v, R.id.big, WidgetData.isOn(c) ? "Owner figures only" : "Open the app once", l.text, 20, l);
            WidgetData.text(v, R.id.sub, WidgetData.isOn(c) ? "Barrels: " + (b == null ? "–" : b.optInt("toWeighFull") + " to weigh · " + b.optInt("waitingEmpty") + " waiting") : "Sign in and the widgets switch on", l.soft, 12, l);
            for (int id : new int[] { R.id.v1, R.id.v2, R.id.v3, R.id.v4, R.id.v5, R.id.v6, R.id.k1, R.id.k2, R.id.k3, R.id.k4, R.id.k5, R.id.k6, R.id.alert }) WidgetData.text(v, id, "", l.soft, 11, l);
            v.setViewVisibility(R.id.chart, View.GONE);
            v.setOnClickPendingIntent(R.id.big, WidgetData.pop(c, "/pop?w=dashboard", 64, false));
            return v;
        }
        v.setViewVisibility(R.id.chart, View.VISIBLE);
        WidgetData.text(v, R.id.big, WidgetData.rupees(cur == null ? 0 : cur.optDouble("sold")), l.text, 26, l);
        String label = "week".equals(r) ? "sold in 7 days" : "month".equals(r) ? "sold this month" : "sold today";
        WidgetData.text(v, R.id.sub, label + "  " + pct(cur), l.soft, 12, l);
        cell(v, l, R.id.v1, R.id.k1, WidgetData.rupees(cur == null ? 0 : cur.optDouble("cashIn")), "Cash in");
        cell(v, l, R.id.v2, R.id.k2, WidgetData.rupees(cur == null ? 0 : cur.optDouble("upiIn")), "UPI");
        cell(v, l, R.id.v3, R.id.k3, WidgetData.rupees(cur == null ? 0 : cur.optDouble("spent")), "Spent");
        cell(v, l, R.id.v4, R.id.k4, WidgetData.rupees(m.optDouble("udhaar")), "Udhaar out");
        cell(v, l, R.id.v5, R.id.k5, String.valueOf(m.optInt("jobWorkWaiting")), "Job-work");
        cell(v, l, R.id.v6, R.id.k6, b == null ? "–" : b.optInt("toWeighFull") + "/" + b.optInt("waitingEmpty"), "Barrels");
        v.setImageViewBitmap(R.id.chart, chart(j.optJSONArray("days7"), l));
        JSONArray al = j.optJSONArray("alerts");
        JSONObject first = al != null && al.length() > 0 ? al.optJSONObject(0) : null;
        WidgetData.text(v, R.id.alert, first != null ? "⚠ " + first.optString("text") : "✓ Nothing needs attention", first != null ? Color.parseColor("#ff9d8a") : l.soft, 11, l);
        v.setOnClickPendingIntent(R.id.big, WidgetData.pop(c, "/pop?w=dashboard", 65, false));
        v.setOnClickPendingIntent(R.id.cells1, WidgetData.pop(c, "/pop?w=cash", 66, false));
        v.setOnClickPendingIntent(R.id.cells2, WidgetData.pop(c, "/pop?w=udhaar", 67, false));
        v.setOnClickPendingIntent(R.id.chart, WidgetData.open(c, "/reports", 68));
        v.setOnClickPendingIntent(R.id.alert, WidgetData.open(c, first != null ? first.optString("url", "/") : "/", 69));
        return v;
    }

    private static void cell(RemoteViews v, WidgetData.Look l, int valueId, int labelId, String value, String label) {
        WidgetData.text(v, valueId, value, l.text, 15, l);
        WidgetData.text(v, labelId, label, l.soft, 10, l);
    }

    /** Last 7 days of sales as small bars (today highlighted). */
    static Bitmap chart(JSONArray days, WidgetData.Look l) {
        int w = 640, h = 150;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        int n = days == null ? 0 : days.length();
        if (n == 0) return bmp;
        double max = 1;
        for (int i = 0; i < n; i++) max = Math.max(max, days.optJSONObject(i).optDouble("total"));
        Paint bar = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint txt = new Paint(Paint.ANTI_ALIAS_FLAG);
        txt.setTextSize(24);
        txt.setTextAlign(Paint.Align.CENTER);
        txt.setColor(l.soft);
        float slot = (float) w / n;
        for (int i = 0; i < n; i++) {
            JSONObject d = days.optJSONObject(i);
            float bh = (float) ((h - 40) * d.optDouble("total") / max);
            float x0 = i * slot + slot * 0.18f, x1 = (i + 1) * slot - slot * 0.18f;
            bar.setColor(i == n - 1 ? Color.parseColor("#e0a526") : Color.argb(140, Color.red(l.text), Color.green(l.text), Color.blue(l.text)));
            cv.drawRoundRect(new RectF(x0, h - 30 - Math.max(4, bh), x1, h - 30), 8, 8, bar);
            cv.drawText(d.optString("label").length() > 0 ? d.optString("label").substring(0, 1) : "", (x0 + x1) / 2, h - 4, txt);
        }
        return bmp;
    }

    // ------------------------------------------------------------------ cash counter
    static RemoteViews cash(Context c) {
        WidgetData.Look l = WidgetData.look(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_cash);
        WidgetData.paint(v, l);
        JSONObject m = WidgetData.summary(c).optJSONObject("money");
        WidgetData.text(v, R.id.title, "💵 Cash today", l.soft, 12, l);
        v.setTextColor(R.id.refresh, l.text);
        v.setOnClickPendingIntent(R.id.refresh, WidgetData.refresh(c, CashWidget.class));
        if (m == null) {
            WidgetData.text(v, R.id.big, WidgetData.isOn(c) ? "Owner only" : "Open the app", l.text, 18, l);
            WidgetData.text(v, R.id.line1, "", l.soft, 12, l);
            WidgetData.text(v, R.id.line2, "", l.soft, 12, l);
        } else {
            double net = m.optDouble("cashIn") - m.optDouble("cashOut");
            WidgetData.text(v, R.id.big, WidgetData.rupees(net), l.text, 26, l);
            WidgetData.text(v, R.id.line1, "In " + WidgetData.rupees(m.optDouble("cashIn")) + " · Out " + WidgetData.rupees(m.optDouble("cashOut")) + " · UPI " + WidgetData.rupees(m.optDouble("upiIn")), l.soft, 12, l);
            JSONObject lc = m.optJSONObject("lastCount");
            String count = lc == null ? "Not counted yet today" : (lc.optBoolean("mismatch") ? "⚠ Count off by " + WidgetData.rupees(Math.abs(lc.optDouble("diff"))) : "✓ Counted, matches");
            WidgetData.text(v, R.id.line2, count, lc != null && lc.optBoolean("mismatch") ? Color.parseColor("#ff9d8a") : l.soft, 12, l);
        }
        v.setOnClickPendingIntent(R.id.body, WidgetData.pop(c, "/pop?w=cash", 71, false));
        return v;
    }

    // ------------------------------------------------------------------ list widgets: udhaar, job-work, stock, alerts
    private static final int[] N = { R.id.n1, R.id.n2, R.id.n3, R.id.n4, R.id.n5 };
    private static final int[] V = { R.id.v1, R.id.v2, R.id.v3, R.id.v4, R.id.v5 };
    private static final int[] ROW = { R.id.row1, R.id.row2, R.id.row3, R.id.row4, R.id.row5 };

    static RemoteViews list(Context c, String kind) {
        WidgetData.Look l = WidgetData.look(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_list);
        WidgetData.paint(v, l);
        JSONObject j = WidgetData.summary(c);
        boolean owner = j.optJSONObject("money") != null;
        String title, big, path;
        String[][] rows = new String[0][];
        int bigColor = l.text;
        switch (kind) {
            case "udhaar": {
                title = "🙌 Udhaar to collect";
                path = "/?desk=ledger";
                JSONObject m = j.optJSONObject("money");
                big = m == null ? "Owner only" : WidgetData.rupees(m.optDouble("udhaar")) + " · " + m.optInt("udhaarCustomers") + " people";
                JSONArray a = j.optJSONArray("udhaarTop");
                if (a != null) {
                    rows = new String[Math.min(5, a.length())][];
                    for (int i = 0; i < rows.length; i++) {
                        JSONObject o = a.optJSONObject(i);
                        rows[i] = new String[] { o.optString("name"), WidgetData.rupees(o.optDouble("balance")) + (o.optInt("days") > 0 ? " · " + o.optInt("days") + "d" : "") };
                    }
                }
                break;
            }
            case "jobwork": {
                title = "🌾 Job-work waiting";
                path = "/?desk=jobwork";
                JSONObject w = j.optJSONObject("jobWork");
                big = w == null ? "Owner only" : w.optInt("waiting") + " lots · " + Math.round(w.optDouble("waitingKg")) + " kg";
                if (w != null && w.optInt("overdue") > 0) bigColor = Color.parseColor("#ff9d8a");
                JSONArray a = w == null ? null : w.optJSONArray("list");
                if (a != null) {
                    rows = new String[Math.min(5, a.length())][];
                    for (int i = 0; i < rows.length; i++) {
                        JSONObject o = a.optJSONObject(i);
                        rows[i] = new String[] { o.optString("customer"), Math.round(o.optDouble("seedKg")) + " kg · " + o.optInt("ageDays") + "d" };
                    }
                }
                break;
            }
            case "stock": {
                title = "📦 Stock · days left";
                path = "/insights#stock";
                JSONArray a = j.optJSONArray("runout");
                big = !owner ? "Owner only" : a == null || a.length() == 0 ? "Do a stock count" : "";
                if (a != null) {
                    rows = new String[Math.min(5, a.length())][];
                    for (int i = 0; i < rows.length; i++) {
                        JSONObject o = a.optJSONObject(i);
                        String lv = o.optString("level");
                        String d = o.isNull("days") ? (o.isNull("kg") ? "–" : Math.round(o.optDouble("kg")) + " kg") : o.optInt("days") + " days";
                        rows[i] = new String[] { ("out".equals(lv) ? "⛔ " : "low".equals(lv) ? "⚠ " : "") + o.optString("name"), d };
                    }
                }
                break;
            }
            case "tips": {
                title = "✨ Do next";
                path = "/insights";
                JSONArray a = j.optJSONArray("tips");
                int n = a == null ? 0 : a.length();
                big = !WidgetData.isOn(c) ? "Open the app" : n == 0 ? "✓ All good" : "";
                rows = new String[Math.min(5, n)][];
                for (int i = 0; i < rows.length; i++) { JSONObject o = a.optJSONObject(i); rows[i] = new String[] { o.optString("icon") + " " + o.optString("text"), "" }; }
                break;
            }
            case "approvals": {
                title = "✅ Waiting for my OK";
                path = "/register";
                JSONArray a = j.optJSONArray("approvals");
                int n = a == null ? 0 : a.length();
                big = !owner ? "Owner only" : n == 0 ? "✓ Nothing waiting" : n + " waiting";
                if (n > 0) bigColor = Color.parseColor("#ffc46b");
                rows = new String[Math.min(5, n)][];
                for (int i = 0; i < rows.length; i++) {
                    JSONObject o = a.optJSONObject(i);
                    String who = o.optString("party");
                    rows[i] = new String[] { o.optString("kind") + (who.isEmpty() ? "" : " · " + who) + " (" + o.optString("by") + ")", WidgetData.rupees(o.optDouble("amount")) };
                }
                break;
            }
            case "tasks": {
                title = "📌 Tasks";
                path = "/chat";
                JSONArray a = j.optJSONArray("tasks");
                int n = a == null ? 0 : a.length();
                big = !WidgetData.isOn(c) ? "Open the app" : n == 0 ? "No tasks · say ‘remind me…’" : "";
                rows = new String[Math.min(5, n)][];
                for (int i = 0; i < rows.length; i++) { JSONObject o = a.optJSONObject(i); rows[i] = new String[] { (o.optBoolean("late") ? "⚠ " : "") + o.optString("text"), o.optString("when") }; }
                break;
            }
            default: {
                title = "🔔 Needs attention";
                JSONArray a = j.optJSONArray("alerts");
                int n = a == null ? 0 : a.length();
                big = !WidgetData.isOn(c) ? "Open the app" : n == 0 ? "✓ All good" : n + " thing" + (n == 1 ? "" : "s");
                if (n > 0) bigColor = Color.parseColor("#ff9d8a");
                path = n > 0 ? a.optJSONObject(0).optString("url", "/") : "/";
                rows = new String[Math.min(5, n)][];
                for (int i = 0; i < rows.length; i++) rows[i] = new String[] { a.optJSONObject(i).optString("text"), "" };
            }
        }
        WidgetData.text(v, R.id.title, title, l.soft, 12, l);
        WidgetData.text(v, R.id.big, big, bigColor, 18, l);
        v.setViewVisibility(R.id.big, big.isEmpty() ? View.GONE : View.VISIBLE);
        for (int i = 0; i < ROW.length; i++) {
            if (i < rows.length) {
                v.setViewVisibility(ROW[i], View.VISIBLE);
                WidgetData.text(v, N[i], rows[i][0], l.text, 13, l);
                WidgetData.text(v, V[i], rows[i][1], l.soft, 12, l);
            } else {
                v.setViewVisibility(ROW[i], View.GONE);
            }
        }
        v.setTextColor(R.id.refresh, l.text);
        v.setOnClickPendingIntent(R.id.refresh, WidgetData.refresh(c, KINDS.get(kind) == null ? AlertsWidget.class : KINDS.get(kind)));
        v.setOnClickPendingIntent(R.id.body, WidgetData.pop(c, "approvals".equals(kind) ? path : "/pop?w=" + kind, "udhaar".equals(kind) ? 81 : "jobwork".equals(kind) ? 82 : "stock".equals(kind) ? 83 : "tips".equals(kind) ? 85 : "tasks".equals(kind) ? 86 : "approvals".equals(kind) ? 88 : 84, false));
        return v;
    }


    // ------------------------------------------------------------------ chat: ask, speak, chips
    static RemoteViews chat(Context c) {
        WidgetData.Look l = WidgetData.look(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_chat);
        WidgetData.paint(v, l);
        WidgetData.text(v, R.id.title, "💬 Ask Mahadev", l.soft, 12, l);
        WidgetData.text(v, R.id.ask, "Type or say… today · udhaar ramesh · sale 500 upi", l.soft, 13, l);
        WidgetData.text(v, R.id.mic, "🎤", l.text, 20, l);
        String[][] chips = { { "📊 Today", "today" }, { "🙌 Udhaar", "udhaar" }, { "📌 Tasks", "tasks" }, { "🔔 Alerts", "alerts" } };
        int[] ids = { R.id.c1, R.id.c2, R.id.c3, R.id.c4 };
        for (int i = 0; i < ids.length; i++) {
            WidgetData.text(v, ids[i], chips[i][0], l.text, 12, l);
            v.setOnClickPendingIntent(ids[i], WidgetData.pop(c, "/pop?w=chat&say=" + chips[i][1], 120 + i, false));
        }
        v.setOnClickPendingIntent(R.id.ask, WidgetData.pop(c, "/pop?w=chat", 118, false));
        v.setOnClickPendingIntent(R.id.mic, WidgetData.pop(c, "/pop?w=chat", 119, true));
        return v;
    }

    // ------------------------------------------------------------------ sticky note
    static RemoteViews note(Context c) {
        SharedPreferences p = WidgetData.prefs(c);
        WidgetData.Look l = WidgetData.look(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_note);
        String color = p.getString(K_NOTE_COLOR, "yellow");
        int bg = "pink".equals(color) ? R.drawable.note_pink : "green".equals(color) ? R.drawable.note_green : "blue".equals(color) ? R.drawable.note_blue : "dark".equals(color) ? R.drawable.widget_bg_dark : R.drawable.note_yellow;
        v.setImageViewResource(R.id.bg, bg);
        v.setInt(R.id.bg, "setImageAlpha", l.alpha);
        int ink = "dark".equals(color) ? Color.parseColor("#f5ead7") : Color.parseColor("#2a2414");
        String text = p.getString(K_NOTE, "");
        WidgetData.text(v, R.id.note, text.isEmpty() ? "Tap to write a note for the shop…" : text, ink, 16, l);
        WidgetData.text(v, R.id.foot, "📌 Mahadev note", ink, 10, l);
        v.setOnClickPendingIntent(R.id.body, WidgetData.open(c, "/app#note", 91));
        return v;
    }

    // ------------------------------------------------------------------ quick buttons (chosen in the app)
    private static final int[] ACT_IDS = { R.id.a1, R.id.a2, R.id.a3, R.id.a4, R.id.a5, R.id.a6 };
    private static final String[][] DEFAULT_ACTS = {
            { "💰\nSale", "/register?open=sale" },
            { "🧾\nExpense", "/register?open=expense" },
            { "🙌\nUdhaar in", "/register?open=udhaar" },
            { "⚖\nWeigh full", "/barrels?weigh=full" },
            { "💵\nCash", "/cash" },
            { "📱\nQuick card", "/quick" },
    };

    public static RemoteViews actionViews(Context c) {
        WidgetData.Look l = WidgetData.look(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_actions);
        WidgetData.paint(v, l);
        String[][] acts = DEFAULT_ACTS;
        try {
            JSONArray a = new JSONArray(WidgetData.prefs(c).getString(K_ACTIONS, "[]"));
            if (a.length() > 0) {
                acts = new String[Math.min(6, a.length())][];
                for (int i = 0; i < acts.length; i++) {
                    JSONObject o = a.getJSONObject(i);
                    acts[i] = new String[] { o.optString("label"), o.optString("path", "/") };
                }
            }
        } catch (Exception ignored) {}
        for (int i = 0; i < ACT_IDS.length; i++) {
            if (i < acts.length && acts[i][1].startsWith("/")) {
                v.setViewVisibility(ACT_IDS[i], View.VISIBLE);
                WidgetData.text(v, ACT_IDS[i], acts[i][0], l.text, 13, l);
                v.setOnClickPendingIntent(ACT_IDS[i], WidgetData.pop(c, acts[i][1], 31 + i, false));
            } else {
                v.setViewVisibility(ACT_IDS[i], View.INVISIBLE);
            }
        }
        return v;
    }

    // ------------------------------------------------------------------ live notification (stays in the status bar)
    public static void postLive(Context c) {
        SharedPreferences p = WidgetData.prefs(c);
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!p.getBoolean(K_LIVE, false) || !WidgetData.isOn(c)) {
            nm.cancel(LIVE_ID);
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager sys = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (sys != null && sys.getNotificationChannel(CHANNEL_LIVE) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL_LIVE, "Live figures", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Today's figures kept in the status bar");
                ch.setShowBadge(false);
                sys.createNotificationChannel(ch);
            }
        }
        JSONObject j = WidgetData.summary(c);
        JSONObject m = j.optJSONObject("money");
        JSONObject b = j.optJSONObject("barrels");
        String barrels = b == null ? "" : "🛢 " + b.optInt("toWeighFull") + " to weigh · " + b.optInt("waitingEmpty") + " waiting";
        String title = m != null ? WidgetData.rupees(m.optDouble("sold")) + " sold · Cash " + WidgetData.rupees(m.optDouble("cashIn")) + " · UPI " + WidgetData.rupees(m.optDouble("upiIn")) : "Mahadev · Barrels";
        String text = m != null ? barrels + "  ·  Udhaar " + WidgetData.rupees(m.optDouble("udhaar")) : barrels;
        long ok = p.getLong(WidgetData.K_LAST_OK, 0);
        NotificationCompat.Builder nb = new NotificationCompat.Builder(c, CHANNEL_LIVE)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(title)
                .setContentText(text)
                .setSubText(ok > 0 ? WidgetData.clock(ok) : null)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setContentIntent(WidgetData.open(c, "/", 95))
                .addAction(0, "⟳ Update", WidgetData.refresh(c, SummaryWidget.class))
                .addAction(0, "➕ Sale", WidgetData.open(c, "/register?open=sale", 96))
                .addAction(0, "⚖ Weigh", WidgetData.open(c, "/barrels?weigh=full", 97));
        Notification n = nb.build();
        try { nm.notify(LIVE_ID, n); } catch (SecurityException ignored) {}
    }
}
