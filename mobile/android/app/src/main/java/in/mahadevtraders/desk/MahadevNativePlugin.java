package in.mahadevtraders.desk;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.activity.result.ActivityResult;
import android.app.Activity;
import android.speech.RecognizerIntent;
import java.util.ArrayList;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** Phone things the web pages ask for: widgets, Android printing, files, sharing, screen on. */
@CapacitorPlugin(name = "MahadevNative")
public class MahadevNativePlugin extends Plugin {

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("version", pi.versionName);
            r.put("build", Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode);
        } catch (Exception e) {
            r.put("version", "?");
            r.put("build", 0);
        }
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("model", (Build.MANUFACTURER + " " + Build.MODEL).trim());
        r.put("widgets", true);
        call.resolve(r);
    }

    @PluginMethod
    public void setDevice(PluginCall call) {
        String base = call.getString("baseUrl", "");
        String token = call.getString("token", "");
        if (token == null || !token.startsWith("mdt_") || base == null || !base.startsWith("https://")) {
            call.reject("Bad widget settings");
            return;
        }
        WidgetData.prefs(getContext()).edit()
                .putString(WidgetData.K_BASE, base)
                .putString(WidgetData.K_TOKEN, token)
                .putString(WidgetData.K_ROLE, call.getString("role", "STAFF"))
                .putString(WidgetData.K_NAME, call.getString("name", ""))
                .remove(WidgetData.K_JSON)
                .remove(WidgetData.K_LAST_ERR)
                .apply();
        RefreshWorker.schedule(getContext());
        RefreshWorker.now(getContext());
        WidgetData.renderAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearDevice(PluginCall call) {
        WidgetData.prefs(getContext()).edit()
                .remove(WidgetData.K_TOKEN).remove(WidgetData.K_JSON).remove(WidgetData.K_LAST_OK).remove(WidgetData.K_LAST_ERR)
                .apply();
        RefreshWorker.cancel(getContext());
        WidgetData.renderAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void deviceStatus(PluginCall call) {
        SharedPreferences p = WidgetData.prefs(getContext());
        JSObject r = new JSObject();
        r.put("on", WidgetData.isOn(getContext()));
        r.put("baseUrl", WidgetData.baseUrl(getContext()));
        r.put("name", p.getString(WidgetData.K_NAME, ""));
        long ok = p.getLong(WidgetData.K_LAST_OK, 0);
        if (ok > 0) r.put("lastOk", ok);
        String err = p.getString(WidgetData.K_LAST_ERR, null);
        if (err != null) r.put("lastError", err);
        call.resolve(r);
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        RefreshWorker.now(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setWidgetStyle(PluginCall call) {
        String style = call.getString("style", "dark");
        Integer op = call.getInt("opacity", 90);
        String ts = call.getString("textSize", "m");
        WidgetData.prefs(getContext()).edit()
                .putString(WidgetData.K_STYLE, style)
                .putInt(WidgetData.K_OPACITY, op == null ? 90 : Math.max(20, Math.min(100, op)))
                .putString(WidgetData.K_TEXT, ts)
                .apply();
        WidgetData.renderAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setAlerts(PluginCall call) {
        Boolean on = call.getBoolean("on", true);
        WidgetData.prefs(getContext()).edit().putBoolean(WidgetData.K_ALERTS, on == null || on).apply();
        WidgetData.ensureChannel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void pinWidget(PluginCall call) {
        JSObject r = new JSObject();
        if (Build.VERSION.SDK_INT < 26) {
            r.put("ok", false);
            call.resolve(r);
            return;
        }
        String kind = call.getString("kind", "summary");
        Class<?> k = Widgets.KINDS.get(kind);
        if (k == null) k = SummaryWidget.class;
        AppWidgetManager m = AppWidgetManager.getInstance(getContext());
        boolean ok = m.isRequestPinAppWidgetSupported() && m.requestPinAppWidget(new ComponentName(getContext(), k), null, null);
        r.put("ok", ok);
        call.resolve(r);
    }

    /** Speech to text with Android's own recogniser (Google voice typing): returns what was said. */
    @PluginMethod
    public void listen(PluginCall call) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        String lang = call.getString("lang", "en-IN");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Say it… e.g. sale 500 UPI Suresh");
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        if (i.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("No speech recogniser on this phone (install or enable Google voice typing).");
            return;
        }
        startActivityForResult(call, i, "listenResult");
    }

    @ActivityCallback
    private void listenResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        ArrayList<String> said = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        JSObject r = new JSObject();
        r.put("text", said == null || said.isEmpty() ? "" : said.get(0));
        call.resolve(r);
    }

    /** The sticky-note widget's text and colour. */
    @PluginMethod
    public void setNote(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null) text = "";
        if (text.length() > 400) text = text.substring(0, 400);
        WidgetData.prefs(getContext()).edit()
                .putString(Widgets.K_NOTE, text)
                .putString(Widgets.K_NOTE_COLOR, call.getString("color", "yellow"))
                .apply();
        Widgets.renderAll(getContext());
        call.resolve();
    }

    /** The Quick buttons widget: up to six {label, path}; an empty list brings back the default six. */
    @PluginMethod
    public void setActions(PluginCall call) {
        org.json.JSONArray out = new org.json.JSONArray();
        try {
            com.getcapacitor.JSArray a = call.getArray("actions");
            for (int i = 0; a != null && i < a.length() && out.length() < 6; i++) {
                org.json.JSONObject o = a.getJSONObject(i);
                String path = o.optString("path", "");
                String label = o.optString("label", "");
                if (!path.startsWith("/") || label.isEmpty()) continue;
                out.put(new org.json.JSONObject().put("label", label.length() > 24 ? label.substring(0, 24) : label).put("path", path));
            }
        } catch (Exception e) {
            call.reject("Bad buttons");
            return;
        }
        WidgetData.prefs(getContext()).edit().putString(Widgets.K_ACTIONS, out.toString()).apply();
        Widgets.renderAll(getContext());
        call.resolve();
    }

    /** How often the widgets fetch new figures in the background: 15, 30 or 60 minutes. */
    @PluginMethod
    public void setRefresh(PluginCall call) {
        Integer m = call.getInt("minutes", 30);
        int v = m == null ? 30 : m <= 15 ? 15 : m >= 60 ? 60 : 30;
        WidgetData.prefs(getContext()).edit().putInt(Widgets.K_EVERY, v).apply();
        RefreshWorker.reschedule(getContext());
        call.resolve();
    }

    /** Keep today's figures in the status bar as a quiet notification. */
    @PluginMethod
    public void setLive(PluginCall call) {
        Boolean on = call.getBoolean("on", false);
        WidgetData.prefs(getContext()).edit().putBoolean(Widgets.K_LIVE, on != null && on).apply();
        Widgets.postLive(getContext());
        if (on != null && on) RefreshWorker.now(getContext());
        call.resolve();
    }

    /** What the widget settings are now (for the app page). */
    @PluginMethod
    public void widgetPrefs(PluginCall call) {
        SharedPreferences p = WidgetData.prefs(getContext());
        JSObject r = new JSObject();
        r.put("note", p.getString(Widgets.K_NOTE, ""));
        r.put("noteColor", p.getString(Widgets.K_NOTE_COLOR, "yellow"));
        r.put("live", p.getBoolean(Widgets.K_LIVE, false));
        r.put("minutes", p.getInt(Widgets.K_EVERY, 30));
        r.put("actions", p.getString(Widgets.K_ACTIONS, "[]"));
        com.getcapacitor.JSArray placed = new com.getcapacitor.JSArray();
        AppWidgetManager m = AppWidgetManager.getInstance(getContext());
        for (java.util.Map.Entry<String, Class<?>> e : Widgets.KINDS.entrySet()) {
            if (m.getAppWidgetIds(new ComponentName(getContext(), e.getValue())).length > 0) placed.put(e.getKey());
        }
        r.put("placed", placed);
        call.resolve(r);
    }

    /** Android's own printing (Wi-Fi printers, print apps, Save as PDF) of the page on screen. */
    @PluginMethod
    public void print(final PluginCall call) {
        final String name = call.getString("name", "Mahadev");
        getActivity().runOnUiThread(() -> {
            try {
                WebView web = getBridge().getWebView();
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter a = web.createPrintDocumentAdapter(name);
                pm.print(name, a, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject("Printing is not available: " + e.getMessage());
            }
        });
    }

    /** A file from the page: kept in Downloads (Android 10+) and offered to share. */
    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = safeName(call.getString("name", "file"));
        String mime = call.getString("mime", "application/octet-stream");
        String b64 = call.getString("base64", "");
        Boolean share = call.getBoolean("share", true);
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            File dir = new File(getContext().getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("no space");
            File f = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
            String where = "app";
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    ContentResolver cr = getContext().getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    Uri u = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u != null) {
                        try (OutputStream o = cr.openOutputStream(u)) { if (o != null) o.write(bytes); }
                        where = "Downloads";
                    }
                } catch (Exception ignored) {}
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            if (share == null || share) {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_SUBJECT, name);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, "Share " + name);
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(chooser);
            }
            JSObject r = new JSObject();
            r.put("uri", uri.toString());
            r.put("where", where);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not save the file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        String text = call.getString("text", "");
        String title = call.getString("title", "Share");
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, text);
        if (title != null) send.putExtra(Intent.EXTRA_SUBJECT, title);
        Intent chooser = Intent.createChooser(send, title);
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(chooser);
        call.resolve();
    }

    @PluginMethod
    public void keepAwake(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        WidgetData.prefs(getContext()).edit().putBoolean(WidgetData.K_AWAKE, on).apply();
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No app can open that.");
        }
    }

    private static String safeName(String n) {
        String s = n == null ? "file" : n.replaceAll("[^A-Za-z0-9._\\- ]", "-").trim();
        if (s.isEmpty()) s = "file";
        return s.length() > 80 ? s.substring(s.length() - 80) : s;
    }
}
