package in.mahadevtraders.desk;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/** A home-screen widget of one kind: draws itself, ⟳ fetches new figures, the dashboard's Today / Week / Month switch. */
public abstract class BaseWidget extends AppWidgetProvider {
    protected abstract String kind();

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, Widgets.views(c, kind()));
        RefreshWorker.schedule(c);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        String a = intent.getAction();
        if (WidgetData.ACTION_REFRESH.equals(a)) {
            RefreshWorker.now(c);
        } else if (Widgets.ACTION_RANGE.equals(a)) {
            String r = intent.getStringExtra(Widgets.EXTRA_RANGE);
            WidgetData.prefs(c).edit().putString(Widgets.K_RANGE, r == null ? "today" : r).apply();
            Widgets.renderAll(c);
        }
    }
}
