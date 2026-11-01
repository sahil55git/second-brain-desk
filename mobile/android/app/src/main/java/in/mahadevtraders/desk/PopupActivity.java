package in.mahadevtraders.desk;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.net.URLEncoder;
import java.util.ArrayList;

/**
 * A small glass window over the home screen, opened by tapping a widget: quick entries, the
 * widget's figures and the chat (with voice), without opening the whole app. It shows pages of
 * the same site, signed in with the app's own login (the cookies are shared inside the app).
 */
public class PopupActivity extends Activity {
    public static final String EXTRA_VOICE = "in.mahadevtraders.desk.VOICE";
    private static final int VOICE = 7;
    private WebView web;
    private String path = "/pop";

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window w = getWindow();
        w.setBackgroundDrawableResource(android.R.color.transparent);
        w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        w.setDimAmount(0.35f);
        if (Build.VERSION.SDK_INT >= 31) {
            w.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND);
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.setBlurBehindRadius(48);
            w.setAttributes(lp);
        }

        int h = Math.round(getResources().getDisplayMetrics().heightPixels * 0.78f);
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#E6141A2E"));
        bg.setCornerRadius(dp(26));
        bg.setStroke(dp(1), Color.parseColor("#40FFFFFF"));
        card.setBackground(bg);
        card.setClipToOutline(true);
        card.setPadding(dp(4), dp(4), dp(4), dp(4));

        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(14), dp(8), dp(6), dp(4));
        TextView title = new TextView(this);
        title.setText("Mahadev · quick window");
        title.setTextColor(Color.parseColor("#E6FFFFFF"));
        title.setTextSize(13);
        title.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView full = button("⤢ App");
        full.setOnClickListener(v -> {
            Intent i = new Intent(this, MainActivity.class);
            i.putExtra(WidgetData.EXTRA_PATH, currentPath());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
            finish();
        });
        TextView close = button("✕");
        close.setOnClickListener(v -> finish());
        bar.addView(title);
        bar.addView(full);
        bar.addView(close);
        card.addView(bar);

        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        CookieManager.getInstance().setAcceptCookie(true);
        final String host = Uri.parse(WidgetData.baseUrl(this)).getHost();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (host != null && host.equalsIgnoreCase(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });
        card.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, h));

        FrameLayout root = new FrameLayout(this);
        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        clp.setMargins(dp(8), dp(8), dp(8), dp(12));
        root.addView(card, clp);
        root.setOnClickListener(v -> finish()); // tap outside the card closes
        card.setOnClickListener(v -> { });
        setContentView(root);
        w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);

        String p = getIntent().getStringExtra(WidgetData.EXTRA_PATH);
        if (p != null && p.startsWith("/")) path = p;
        if (getIntent().getBooleanExtra(EXTRA_VOICE, false)) listen();
        else load(path);
    }

    private TextView button(String t) {
        TextView v = new TextView(this);
        v.setText(t);
        v.setTextColor(Color.WHITE);
        v.setTextSize(15);
        v.setPadding(dp(12), dp(6), dp(12), dp(6));
        v.setGravity(Gravity.CENTER);
        return v;
    }

    private String currentPath() {
        String u = web != null ? web.getUrl() : null;
        if (u == null) return path;
        Uri x = Uri.parse(u);
        String q = x.getEncodedQuery();
        return x.getEncodedPath() + (q != null ? "?" + q : "");
    }

    private void load(String p) {
        web.loadUrl(WidgetData.baseUrl(this) + p);
    }

    private void listen() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN");
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Say it… e.g. sale 500 UPI Suresh, udhaar Ramesh, today");
        try {
            startActivityForResult(i, VOICE);
        } catch (Exception e) {
            load(path);
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != VOICE) return;
        String said = null;
        if (res == RESULT_OK && data != null) {
            ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (r != null && !r.isEmpty()) said = r.get(0);
        }
        if (said == null || said.trim().isEmpty()) { load(path); return; }
        try {
            load(path + (path.contains("?") ? "&" : "?") + "say=" + URLEncoder.encode(said, "UTF-8"));
        } catch (Exception e) {
            load(path);
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        // an entry was probably made: bring the widgets up to date
        if (WidgetData.isOn(this)) RefreshWorker.now(this);
    }
}
