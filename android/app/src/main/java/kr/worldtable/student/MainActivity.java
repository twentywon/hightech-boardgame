package kr.worldtable.student;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The whole app: one full-screen WebView showing the student edition's single HTML file from the app's assets.
 * The page needs nothing from the network; links that lead out of it are not followed. For 와이파이 여럿이 the page
 * connects to other devices on the same Wi-Fi by WebRTC (no server) and may read a pairing QR code with the camera,
 * which is granted to the page only after the person allows it here. Inside the app the page needs no QR code:
 * {@link LanBridge} (`window.wtgNet`) hosts a room on a small server announced on the Wi-Fi and finds the rooms of
 * the others; the host's window also shows the room's address as a QR code that a guest's QR 찍기 reads with the
 * same camera permission, to join at once. The same code is packed as the student edition and as the full edition (Gradle flavors).
 */
public class MainActivity extends Activity {
    private static final int CAMERA_REQUEST = 7;
    private WebView web;
    /** The page's request for the camera while Android asks the person. */
    private PermissionRequest pendingCamera;
    /** Lets the Wi-Fi hand multicast to the app while it is on screen: mDNS names of the other devices need it. */
    private WifiManager.MulticastLock multicast;
    /** The Wi-Fi rooms of 와이파이 여럿이 (hosting, finding, connections). */
    private LanBridge lan;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0xEE, 0xE6, 0xD4));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // The page is opened from file:// (the export works there: its Workers start from blob URLs).
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        web.setWebChromeClient(new WebChromeClient() {
            /** The camera, and only the camera, for the page inside the app: granted once the person allows it. */
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean video = false;
                    for (String resource : request.getResources())
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) video = true;
                    if (!video || !"file".equals(request.getOrigin().getScheme())) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                    } else {
                        if (pendingCamera != null) pendingCamera.deny();
                        pendingCamera = request;
                        requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_REQUEST);
                    }
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingCamera == request) pendingCamera = null;
            }
        });
        lan = new LanBridge(this, web);
        web.addJavascriptInterface(lan, "wtgNet");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"file".equals(request.getUrl().getScheme());
            }

            /** A page opened anew owns none of the old page's rooms or connections. */
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                lan.reset();
            }
        });
        setContentView(web);
        hideBars();
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/index.html");
    }

    /** The person's answer to the camera: the page's waiting request is granted or denied with it. */
    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != CAMERA_REQUEST || pendingCamera == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
            pendingCamera.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
        else pendingCamera.deny();
        pendingCamera = null;
    }

    /** Full screen: the system bars come back with a swipe from the edge and go again by themselves. */
    private void hideBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) hideBars();
    }

    /** The window asking whether to leave, while it is up. */
    private AlertDialog leaving;

    /**
     * The phone's back key does what the browser's does: a table goes back to the collection (the page's own history).
     * At the collection it asks before the app closes (the user asked), instead of closing at once.
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        if (leaving != null && leaving.isShowing()) return;
        leaving = new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
                .setTitle("앱 종료")
                .setMessage("앱을 종료할까요?")
                .setPositiveButton("종료", (dialog, which) -> finish())
                .setNegativeButton("취소", null)
                .create();
        leaving.show();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /** Music and the tables' clocks rest while the app is not on screen. */
    @Override
    protected void onPause() {
        if (multicast != null && multicast.isHeld()) multicast.release();
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        try {
            if (multicast == null) {
                WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                if (wifi != null) {
                    multicast = wifi.createMulticastLock("wtg-mdns");
                    multicast.setReferenceCounted(false);
                }
            }
            if (multicast != null) multicast.acquire();
        } catch (RuntimeException e) {
            // Without it only devices that give their address plainly can be reached; the rest of the app is unchanged.
        }
        web.resumeTimers();
        web.onResume();
    }

    @Override
    protected void onStart() {
        super.onStart();
        lan.onStart();
    }

    /** Off screen: the Wi-Fi room stays open for a while, then closes until the app comes back (`LanBridge`). */
    @Override
    protected void onStop() {
        lan.onStop();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        lan.destroy();
        web.destroy();
        super.onDestroy();
    }
}
