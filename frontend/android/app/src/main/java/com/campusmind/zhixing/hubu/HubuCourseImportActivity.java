package com.campusmind.zhixing.hubu;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class HubuCourseImportActivity extends AppCompatActivity {
    public static final String EXTRA_START_URL = "start_url";
    public static final String EXTRA_CAPTURE_FILE = "capture_file";
    public static final String EXTRA_FILENAME = "filename";
    public static final String EXTRA_SOURCE_URL = "source_url";
    public static final String EXTRA_PAGE_TITLE = "page_title";
    public static final String CACHE_DIRECTORY = "hubu-course-import";

    private static final int COLOR_BACKGROUND = Color.rgb(248, 249, 244);
    private static final int COLOR_INK = Color.rgb(38, 57, 44);
    private static final int COLOR_MUTED = Color.rgb(91, 108, 96);
    private static final int COLOR_GREEN = Color.rgb(77, 119, 87);
    private static final int COLOR_GREEN_SOFT = Color.rgb(229, 241, 226);

    private WebView webView;
    private ProgressBar progressBar;
    private TextView addressView;
    private TextView instructionView;
    private Button importButton;
    private String extractorScript;
    private boolean importing = false;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(Activity.RESULT_CANCELED);
        getWindow().setStatusBarColor(COLOR_BACKGROUND);
        getWindow().setNavigationBarColor(COLOR_BACKGROUND);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );

        try {
            extractorScript = readAsset("hubu_course_extractor.js");
        } catch (IOException error) {
            Toast.makeText(this, "导入组件初始化失败", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        buildInterface();
        configureWebView();

        String requestedUrl = getIntent().getStringExtra(EXTRA_START_URL);
        String startUrl = HubuImportPolicy.isAllowedUrl(requestedUrl)
            ? requestedUrl
            : HubuImportPolicy.START_URL;
        webView.loadUrl(startUrl);
    }

    private void buildInterface() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(COLOR_BACKGROUND);
        root.setFitsSystemWindows(true);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(10), dp(8), dp(12), dp(7));
        toolbar.setBackgroundColor(Color.WHITE);
        toolbar.setElevation(dp(3));

        Button backButton = new Button(this);
        backButton.setText("‹");
        backButton.setTextSize(30);
        backButton.setTextColor(COLOR_INK);
        backButton.setGravity(Gravity.CENTER);
        backButton.setContentDescription("返回上一页");
        backButton.setAllCaps(false);
        backButton.setMinWidth(0);
        backButton.setMinimumWidth(0);
        backButton.setPadding(0, 0, 0, dp(3));
        backButton.setBackground(roundedBackground(Color.TRANSPARENT, 22));
        backButton.setOnClickListener(view -> navigateBack());
        toolbar.addView(backButton, new LinearLayout.LayoutParams(dp(44), dp(44)));

        LinearLayout titleGroup = new LinearLayout(this);
        titleGroup.setOrientation(LinearLayout.VERTICAL);
        titleGroup.setPadding(dp(7), 0, dp(8), 0);

        TextView titleView = new TextView(this);
        titleView.setText("湖北大学教务系统");
        titleView.setTextColor(COLOR_INK);
        titleView.setTextSize(17);
        titleView.setTypeface(titleView.getTypeface(), android.graphics.Typeface.BOLD);
        titleGroup.addView(titleView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        addressView = new TextView(this);
        addressView.setText("jwxt.hubu.edu.cn");
        addressView.setTextColor(COLOR_MUTED);
        addressView.setTextSize(11);
        addressView.setSingleLine(true);
        addressView.setEllipsize(TextUtils.TruncateAt.END);
        titleGroup.addView(addressView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        toolbar.addView(titleGroup, new LinearLayout.LayoutParams(0, dp(48), 1));

        Button closeButton = new Button(this);
        closeButton.setText("关闭");
        closeButton.setTextSize(12);
        closeButton.setTextColor(COLOR_MUTED);
        closeButton.setAllCaps(false);
        closeButton.setMinWidth(0);
        closeButton.setMinimumWidth(0);
        closeButton.setPadding(dp(8), 0, dp(8), 0);
        closeButton.setBackground(roundedBackground(COLOR_GREEN_SOFT, 18));
        closeButton.setOnClickListener(view -> finish());
        toolbar.addView(closeButton, new LinearLayout.LayoutParams(dp(58), dp(38)));
        root.addView(toolbar, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(62)
        ));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgressTintList(android.content.res.ColorStateList.valueOf(COLOR_GREEN));
        progressBar.setProgressBackgroundTintList(
            android.content.res.ColorStateList.valueOf(Color.rgb(231, 235, 229))
        );
        root.addView(progressBar, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3)
        ));

        FrameLayout browserFrame = new FrameLayout(this);
        webView = new WebView(this);
        browserFrame.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        instructionView = new TextView(this);
        instructionView.setText("进入“学期理论课表”后，点击右下角导入");
        instructionView.setTextColor(COLOR_MUTED);
        instructionView.setTextSize(11);
        instructionView.setGravity(Gravity.CENTER);
        instructionView.setPadding(dp(12), dp(8), dp(12), dp(8));
        instructionView.setBackground(roundedBackground(
            Color.argb(238, 255, 255, 255),
            18
        ));
        instructionView.setElevation(dp(4));
        FrameLayout.LayoutParams instructionParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.CENTER_HORIZONTAL
        );
        instructionParams.topMargin = dp(12);
        instructionParams.leftMargin = dp(16);
        instructionParams.rightMargin = dp(16);
        browserFrame.addView(instructionView, instructionParams);

        importButton = new Button(this);
        importButton.setText("导入课表");
        importButton.setTextColor(Color.WHITE);
        importButton.setTextSize(14);
        importButton.setAllCaps(false);
        importButton.setTypeface(importButton.getTypeface(), android.graphics.Typeface.BOLD);
        importButton.setPadding(dp(18), 0, dp(18), 0);
        importButton.setMinWidth(0);
        importButton.setMinimumWidth(0);
        importButton.setContentDescription("读取当前湖北大学课表并返回智行");
        importButton.setBackground(roundedBackground(COLOR_GREEN, 24));
        importButton.setElevation(dp(8));
        importButton.setOnClickListener(view -> captureCurrentTimetable());
        FrameLayout.LayoutParams importParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            dp(52),
            Gravity.BOTTOM | Gravity.END
        );
        importParams.rightMargin = dp(18);
        importParams.bottomMargin = dp(20);
        browserFrame.addView(importButton, importParams);

        root.addView(browserFrame, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1
        ));
        setContentView(root);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSaveFormData(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        settings.setUserAgentString(
            settings.getUserAgentString() + " CampusMind-HubuImport/1.0"
        );

        WebView.setWebContentsDebuggingEnabled(false);
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.INVISIBLE : View.VISIBLE);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) {
                    return false;
                }
                String destination = request.getUrl().toString();
                if (HubuImportPolicy.isAllowedUrl(destination)) {
                    return false;
                }
                Toast.makeText(
                    HubuCourseImportActivity.this,
                    "为保护账号安全，只允许访问湖北大学官方页面",
                    Toast.LENGTH_LONG
                ).show();
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!HubuImportPolicy.isAllowedUrl(url)) {
                    view.stopLoading();
                    Toast.makeText(
                        HubuCourseImportActivity.this,
                        "已拦截非湖北大学官方页面",
                        Toast.LENGTH_LONG
                    ).show();
                    if (view.canGoBack()) {
                        view.goBack();
                    } else {
                        finish();
                    }
                    return;
                }
                updateAddress(url);
                instructionView.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                updateAddress(url);
                CookieManager.getInstance().flush();
            }

            @Override
            public void onReceivedSslError(
                WebView view,
                SslErrorHandler handler,
                SslError error
            ) {
                handler.cancel();
                Toast.makeText(
                    HubuCourseImportActivity.this,
                    "教务系统证书校验失败，已停止访问",
                    Toast.LENGTH_LONG
                ).show();
            }

            @Override
            public void onReceivedHttpError(
                WebView view,
                WebResourceRequest request,
                WebResourceResponse errorResponse
            ) {
                if (request.isForMainFrame()) {
                    Toast.makeText(
                        HubuCourseImportActivity.this,
                        "教务系统暂时无法访问（" + errorResponse.getStatusCode() + "）",
                        Toast.LENGTH_LONG
                    ).show();
                }
            }
        });
    }

    private void captureCurrentTimetable() {
        if (importing) {
            return;
        }
        String currentUrl = webView.getUrl();
        if (!HubuImportPolicy.isAllowedUrl(currentUrl)) {
            Toast.makeText(this, "当前不是湖北大学官方页面", Toast.LENGTH_SHORT).show();
            return;
        }

        importing = true;
        importButton.setEnabled(false);
        importButton.setText("正在读取…");
        instructionView.setText("正在核对星期、节次和完整地点");
        webView.evaluateJavascript(extractorScript, this::handleExtractionResult);
    }

    private void handleExtractionResult(String rawResult) {
        try {
            Object decoded = new JSONTokener(rawResult).nextValue();
            String payload = decoded instanceof String ? (String) decoded : rawResult;
            JSONObject result = new JSONObject(payload);
            if (!result.optBoolean("ok")) {
                showCaptureError(result.optString(
                    "message",
                    "当前页面没有找到完整课表，请先进入“学期理论课表”"
                ));
                return;
            }

            String timetableText = result.optString("text");
            String html = result.optString("html");
            String sourceUrl = HubuImportPolicy.sanitizeSourceUrl(
                result.optString("sourceUrl", webView.getUrl())
            );
            String pageTitle = result.optString("pageTitle", "湖北大学教务系统课表");
            if (
                !HubuImportPolicy.looksLikeTimetable(timetableText) ||
                !HubuImportPolicy.isAllowedUrl(sourceUrl) ||
                html.trim().isEmpty()
            ) {
                showCaptureError("当前内容不像完整课表，请确认已打开“学期理论课表”");
                return;
            }

            byte[] htmlBytes = html.getBytes(StandardCharsets.UTF_8);
            if (htmlBytes.length > HubuImportPolicy.MAX_CAPTURE_BYTES) {
                showCaptureError("课表页面超过 5MB，请改用文件导入");
                return;
            }

            File captureFile = writeCapture(htmlBytes);
            String filename = "湖北大学教务系统课表-" +
                new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.CHINA).format(new Date()) +
                ".html";
            Intent response = new Intent();
            response.putExtra(EXTRA_CAPTURE_FILE, captureFile.getAbsolutePath());
            response.putExtra(EXTRA_FILENAME, filename);
            response.putExtra(EXTRA_SOURCE_URL, sourceUrl);
            response.putExtra(EXTRA_PAGE_TITLE, pageTitle);
            setResult(Activity.RESULT_OK, response);
            finish();
        } catch (JSONException | IOException error) {
            showCaptureError("读取课表失败，请等待页面加载完成后重试");
        }
    }

    private File writeCapture(byte[] content) throws IOException {
        File directory = new File(getCacheDir(), CACHE_DIRECTORY);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Unable to create capture directory");
        }
        File capture = File.createTempFile("hubu-timetable-", ".html", directory);
        try (FileOutputStream output = new FileOutputStream(capture)) {
            output.write(content);
            output.flush();
        }
        return capture;
    }

    private void showCaptureError(String message) {
        importing = false;
        importButton.setEnabled(true);
        importButton.setText("导入课表");
        instructionView.setText("进入“学期理论课表”后，点击右下角导入");
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private void updateAddress(String url) {
        if (url == null || url.trim().isEmpty()) {
            return;
        }
        try {
            Uri uri = Uri.parse(url);
            String path = uri.getPath();
            addressView.setText(uri.getHost() + (path == null ? "" : path));
        } catch (RuntimeException error) {
            addressView.setText("湖北大学官方页面");
        }
    }

    private void navigateBack() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    @Override
    public void onBackPressed() {
        navigateBack();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            android.view.ViewParent parent = webView.getParent();
            if (parent instanceof ViewGroup) {
                ((ViewGroup) parent).removeView(webView);
            }
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.clearFormData();
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private String readAsset(String filename) throws IOException {
        StringBuilder result = new StringBuilder();
        try (
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(getAssets().open(filename), StandardCharsets.UTF_8)
            )
        ) {
            String line;
            while ((line = reader.readLine()) != null) {
                result.append(line).append('\n');
            }
        }
        return result.toString();
    }

    private GradientDrawable roundedBackground(int color, int radiusDp) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setCornerRadius(dp(radiusDp));
        return background;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
