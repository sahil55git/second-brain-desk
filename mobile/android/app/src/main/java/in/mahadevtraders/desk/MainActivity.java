package in.mahadevtraders.desk;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * The app window: the live Mahadev Desk site in a WebView (Capacitor), plus our own plugins.
 * Widgets, shortcuts, notifications and links to the site open a page of the site here.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MahadevNativePlugin.class);
        registerPlugin(MahadevPrinterPlugin.class);
        registerPlugin(MahadevScalePlugin.class);
        registerPlugin(MahadevUpiPlugin.class);
        super.onCreate(savedInstanceState);
        openFromIntent(getIntent(), 600);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openFromIntent(intent, 0);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (WidgetData.prefs(this).getBoolean(WidgetData.K_AWAKE, false)) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // an entry was probably just made: bring the widgets up to date when leaving the app
        if (WidgetData.isOn(this)) RefreshWorker.now(this);
    }

    /** A widget button, shortcut, notification or link: load that page of the site. */
    private void openFromIntent(Intent intent, long delayMs) {
        if (intent == null) return;
        String url = null;
        Uri data = intent.getData();
        if (data != null && ("https".equals(data.getScheme()) || "http".equals(data.getScheme()))) {
            Uri base = Uri.parse(WidgetData.baseUrl(this));
            if (base.getHost() != null && base.getHost().equalsIgnoreCase(data.getHost())) url = data.toString();
        }
        String path = intent.getStringExtra(WidgetData.EXTRA_PATH);
        if (url == null && path != null && path.startsWith("/")) url = WidgetData.baseUrl(this) + path;
        if (url == null && intent.getComponent() != null) {
            // the second / third home-screen icons open straight on the counter / cashier desk
            String cls = intent.getComponent().getClassName();
            if (cls.endsWith(".CounterLauncher")) url = WidgetData.baseUrl(this) + "/register/counter";
            else if (cls.endsWith(".CashierLauncher")) url = WidgetData.baseUrl(this) + "/register/cashier";
            else if (cls.endsWith(".MillLauncher")) url = WidgetData.baseUrl(this) + "/mill";
        }
        if (url == null) return;
        final String target = url;
        if (getBridge() == null) return;
        final WebView web = getBridge().getWebView();
        web.postDelayed(() -> web.loadUrl(target), delayMs);
        // The app's own start page (/go) loads at the same moment on a cold start and can land after
        // our page, leaving the person on Quick links instead of the tapped widget's screen. So look
        // again twice; if the app is still sitting on the start page, open the tapped page again.
        final String wanted = Uri.parse(target).getPath();
        for (final long again : new long[] { delayMs + 1800, delayMs + 4500 }) {
            web.postDelayed(() -> {
                String now = web.getUrl();
                if (now == null || wanted == null) return;
                String path = Uri.parse(now).getPath();
                boolean onStart = path == null || path.isEmpty() || path.equals("/") || path.equals("/go") || now.contains("offline.html");
                if (onStart && !wanted.equals(path) && !wanted.equals("/go")) web.loadUrl(target);
            }, again);
        }
    }
}
