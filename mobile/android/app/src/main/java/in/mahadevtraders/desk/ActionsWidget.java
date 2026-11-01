package in.mahadevtraders.desk;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Home-screen widget: six one-tap buttons that open an entry form. Works without widget data. */
public class ActionsWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, WidgetData.actionViews(c));
    }
}
