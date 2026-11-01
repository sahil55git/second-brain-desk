package in.mahadevtraders.desk;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/** Home-screen widget: today's sales, cash, UPI, spent, udhaar and barrels (staff: barrels). */
public class SummaryWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, WidgetData.summaryViews(c));
        RefreshWorker.schedule(c);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (WidgetData.ACTION_REFRESH.equals(intent.getAction())) RefreshWorker.now(c);
    }
}
