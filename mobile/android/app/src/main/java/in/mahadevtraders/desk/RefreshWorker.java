package in.mahadevtraders.desk;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/** Fetches the widget summary in the background (every 15, 30 or 60 minutes, chosen in the app), redraws widgets, posts alerts. */
public class RefreshWorker extends Worker {
    private static final String PERIODIC = "mahadev-refresh";
    private static final String ONCE = "mahadev-refresh-now";

    public RefreshWorker(@NonNull Context c, @NonNull WorkerParameters p) {
        super(c, p);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        if (!WidgetData.isOn(c)) {
            WidgetData.renderAll(c);
            return Result.success();
        }
        String err = WidgetData.fetch(c);
        WidgetData.renderAll(c);
        return err == null || "key switched off".equals(err) ? Result.success() : Result.retry();
    }

    private static Constraints net() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    public static void schedule(Context c) {
        enqueue(c, ExistingPeriodicWorkPolicy.KEEP);
    }

    /** After the interval was changed in the app. */
    public static void reschedule(Context c) {
        enqueue(c, ExistingPeriodicWorkPolicy.UPDATE);
    }

    private static void enqueue(Context c, ExistingPeriodicWorkPolicy policy) {
        if (!WidgetData.isOn(c)) return;
        int every = WidgetData.prefs(c).getInt(Widgets.K_EVERY, 30);
        PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(RefreshWorker.class, Math.max(15, every), TimeUnit.MINUTES).setConstraints(net()).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(PERIODIC, policy, r);
    }

    public static void now(Context c) {
        OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(RefreshWorker.class).setConstraints(net()).build();
        WorkManager.getInstance(c).enqueueUniqueWork(ONCE, ExistingWorkPolicy.REPLACE, r);
    }

    public static void cancel(Context c) {
        WorkManager.getInstance(c).cancelUniqueWork(PERIODIC);
        WorkManager.getInstance(c).cancelUniqueWork(ONCE);
    }
}
