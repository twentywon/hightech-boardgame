package kr.worldtable.student;

import android.app.Activity;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * The page's way to the Wi-Fi rooms of the app, as `window.wtgNet` (see `src/net/lan.ts`): host a room (a server of
 * {@link LanSockets} announced by {@link LanAds}), find the rooms of the others, connect, and send lines. Events go
 * back to the page as JSON through `window.wtgNetEvent`, on the UI thread, in the order they happened.
 *
 * The page's calls come on the WebView's bridge thread and are handed to one worker thread of their own, so the
 * page never waits on the network or on NsdManager. The app off screen for more than {@link #AWAY_MS} closes the
 * room's server, its announcement, the search and every connection (a phone left in a pocket should not keep a
 * server open); on return the room is opened and announced again on its own and the search taken up again, and the
 * guests rejoin their seats from the list. A page opened anew ({@link #reset}) and the app's end close everything.
 */
final class LanBridge {
    /** How long the app may stay off screen before its room and connections close. */
    static final long AWAY_MS = 60_000;

    private final Activity activity;
    private final WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final HandlerThread thread = new HandlerThread("wtg-lan");
    private final Handler work;
    private final LanSockets sockets;
    private final LanAds ads;

    /** What the page asked for, kept so that a return to the screen takes it up again. */
    private String roomId;
    private Map<String, String> roomAttrs;
    private boolean finding;
    /** The room and the search were closed while the app was off screen. */
    private boolean asleep;
    private int port;

    LanBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        thread.start();
        work = new Handler(thread.getLooper());
        sockets = new LanSockets(new LanSockets.Events() {
            @Override
            public void incoming(String peer, String from) {
                emit(event("incoming").put2("peer", peer).put2("from", from));
            }

            @Override
            public void opened(String peer) {
                emit(event("open").put2("peer", peer));
            }

            @Override
            public void failed(String peer, String text) {
                emit(event("fail").put2("peer", peer).put2("text", text));
            }

            @Override
            public void message(String peer, String text) {
                emit(event("message").put2("peer", peer).put2("text", text));
            }

            @Override
            public void closed(String peer) {
                emit(event("close").put2("peer", peer));
            }
        });
        ads = new LanAds(activity, work, new LanAds.Events() {
            @Override
            public void found(String name, String host, int port, Map<String, String> attrs) {
                emit(event("found").put2("name", name).put2("address", host).put2("port", port).put2("attrs", new JSONObject(attrs)));
            }

            @Override
            public void lost(String name) {
                emit(event("lost").put2("name", name));
            }

            @Override
            public void error(String what, String text) {
                emit(event("error").put2("what", what).put2("text", text));
            }
        });
    }

    /** A JSONObject whose put returns itself without a checked exception (the keys are never null). */
    private static final class Event extends JSONObject {
        Event put2(String key, Object value) {
            try {
                put(key, value);
            } catch (JSONException e) {
                // Never for a plain key and value.
            }
            return this;
        }
    }

    private static Event event(String type) {
        return new Event().put2("e", type);
    }

    /** An event for the page, in order, on the UI thread. */
    private void emit(JSONObject event) {
        final String script = "window.wtgNetEvent&&window.wtgNetEvent(" + event + ")";
        ui.post(() -> {
            if (!activity.isDestroyed()) web.evaluateJavascript(script, null);
        });
    }

    private static Map<String, String> textMap(JSONObject json) {
        Map<String, String> out = new HashMap<>();
        if (json == null) return out;
        for (Iterator<String> keys = json.keys(); keys.hasNext(); ) {
            String key = keys.next();
            if (key.matches("[a-z]{1,9}")) out.put(key, json.optString(key, ""));
        }
        return out;
    }

    // ---- The page's calls (window.wtgNet).

    @JavascriptInterface
    public boolean available() {
        return ads.available();
    }

    /** Opens the room's server and announces it: `{ id, attrs }`. */
    @JavascriptInterface
    public void host(String info) {
        final JSONObject json;
        try {
            json = new JSONObject(info);
        } catch (JSONException e) {
            return;
        }
        work.post(() -> {
            roomId = json.optString("id", "room").replaceAll("[^A-Za-z0-9]", "");
            roomAttrs = textMap(json.optJSONObject("attrs"));
            openRoom();
        });
    }

    @JavascriptInterface
    public void update(String attrs) {
        final JSONObject json;
        try {
            json = new JSONObject(attrs);
        } catch (JSONException e) {
            return;
        }
        work.post(() -> {
            if (roomId == null) return;
            roomAttrs = textMap(json);
            if (!asleep && sockets.listening()) announce();
        });
    }

    @JavascriptInterface
    public void stopHost() {
        work.post(() -> {
            roomId = null;
            roomAttrs = null;
            ads.withdraw();
            sockets.stopListening();
        });
    }

    @JavascriptInterface
    public void discover() {
        work.post(() -> {
            finding = true;
            if (!asleep) ads.discover();
        });
    }

    @JavascriptInterface
    public void stopDiscover() {
        work.post(() -> {
            finding = false;
            ads.stopDiscovery();
        });
    }

    @JavascriptInterface
    public String connect(String address) {
        return sockets.connect(address == null ? "" : address.trim());
    }

    @JavascriptInterface
    public boolean send(String peer, String text) {
        return peer != null && text != null && sockets.send(peer, text);
    }

    @JavascriptInterface
    public void close(String peer) {
        if (peer != null) sockets.close(peer);
    }

    // ---- On the worker thread.

    private void openRoom() {
        try {
            port = sockets.listen();
        } catch (IOException e) {
            emit(event("error").put2("what", "host").put2("text", "방을 열지 못했습니다. 와이파이를 확인하고 다시 해 보세요."));
            return;
        }
        String address = LanSockets.wifiAddress();
        emit(event("hosting").put2("address", address == null ? "" : address).put2("port", port));
        announce();
    }

    private void announce() {
        Map<String, String> attrs = new HashMap<>(roomAttrs);
        String address = LanSockets.wifiAddress();
        if (address != null) attrs.put("a", address + ":" + port);
        ads.announce("wtg-" + roomId, port, attrs);
    }

    // ---- The activity's life.

    private final Runnable sleep = this::fallAsleep;

    private void fallAsleep() {
        asleep = true;
        ads.reset();
        sockets.closeAll();
        if (roomId != null) emit(event("stopped").put2("text", "앱이 한동안 화면 밖에 있어 방을 잠시 닫았습니다. 곧 다시 엽니다."));
    }

    /** The app went off screen: after a while its room, search and connections close. */
    void onStop() {
        work.postDelayed(sleep, AWAY_MS);
    }

    /** The app is on screen again: what closed meanwhile is opened again. */
    void onStart() {
        work.post(() -> {
            work.removeCallbacks(sleep);
            if (!asleep) return;
            asleep = false;
            if (roomId != null) openRoom();
            if (finding) ads.discover();
        });
    }

    /** The page was opened anew: nothing of the old page stays open. */
    void reset() {
        work.post(() -> {
            work.removeCallbacks(sleep);
            roomId = null;
            roomAttrs = null;
            finding = false;
            asleep = false;
            ads.reset();
            sockets.closeAll();
        });
    }

    void destroy() {
        reset();
        work.post(thread::quitSafely);
    }
}
