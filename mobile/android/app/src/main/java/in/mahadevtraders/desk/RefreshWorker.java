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

/** Fetches the widget summary in the background (about every 30 minutes), redraws widgets, posts alerts. */
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
        if (!WidgetData.isOn(c)) return;
        PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(RefreshWorker.class, 30, TimeUnit.MINUTES).setConstraints(net()).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, r);
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
