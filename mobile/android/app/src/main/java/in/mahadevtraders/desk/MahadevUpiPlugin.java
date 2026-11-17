package in.mahadevtraders.desk;

import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/** Lets the page read the UPI payment notifications this device has seen (see UpiNotificationService). */
@CapacitorPlugin(name = "MahadevUpi")
public class MahadevUpiPlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        boolean on = false;
        try {
            on = NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
        } catch (Exception ignored) {
            // treated as not allowed
        }
        JSObject r = new JSObject();
        r.put("enabled", on);
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent i = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Open Android Settings → Notifications → Device & app notifications → Notification access, and allow Mahadev Desk.");
        }
    }

    @PluginMethod
    public void events(PluginCall call) {
        Long s = call.getLong("since", 0L);
        long since = s == null ? 0L : s;
        JSArray list = new JSArray();
        try {
            String raw = getContext().getSharedPreferences(UpiNotificationService.PREFS, Context.MODE_PRIVATE).getString(UpiNotificationService.KEY, "[]");
            JSONArray all = new JSONArray(raw);
            for (int i = 0; i < all.length(); i++) {
                JSONObject o = all.getJSONObject(i);
                if (o.optLong("at", 0) > since) {
                    JSObject e = new JSObject();
                    e.put("id", o.optString("id"));
                    e.put("pkg", o.optString("pkg"));
                    e.put("title", o.optString("title"));
                    e.put("text", o.optString("text"));
                    e.put("at", o.optLong("at", 0));
                    list.put(e);
                }
            }
        } catch (Exception ignored) {
            // nothing to report
        }
        JSObject r = new JSObject();
        r.put("events", list);
        call.resolve(r);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        getContext().getSharedPreferences(UpiNotificationService.PREFS, Context.MODE_PRIVATE).edit().remove(UpiNotificationService.KEY).apply();
        call.resolve();
    }
}
