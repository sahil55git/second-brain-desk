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
        if (url == null) return;
        final String target = url;
        if (getBridge() == null) return;
        final WebView web = getBridge().getWebView();
        web.postDelayed(() -> web.loadUrl(target), delayMs);
    }
}
