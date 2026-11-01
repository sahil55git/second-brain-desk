package in.mahadevtraders.desk;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/** Home-screen widget: barrels to weigh full / waiting to be emptied, with Weigh buttons. */
public class BarrelsWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, WidgetData.barrelViews(c));
        RefreshWorker.schedule(c);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (WidgetData.ACTION_REFRESH.equals(intent.getAction())) RefreshWorker.now(c);
    }
}
