package kr.worldtable.student;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Build;
import android.os.Handler;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

/**
 * Rooms announced and found on the Wi-Fi by DNS-SD through Android's own NsdManager (no library), as services of
 * type {@link #TYPE} whose TXT attributes tell the room (version, edition, game, host's name, people and seats; see
 * `src/net/lan.ts`). NsdManager cannot change a registered service's attributes, so a change re-registers it, no
 * more often than every {@link #SETTLE_MS}; finders see the room lost and found again with the new attributes.
 * Found services are resolved one at a time (older Androids refuse a second resolve while one runs).
 *
 * Every method runs on the `work` handler's thread, and every NsdManager callback is posted back there.
 */
final class LanAds {
    static final String TYPE = "_wtgroom._tcp";
    private static final long SETTLE_MS = 1500, RETRY_MS = 3000;

    interface Events {
        void found(String name, String host, int port, Map<String, String> attrs);
        void lost(String name);
        void error(String what, String text);
    }

    private final NsdManager nsd;
    private final Handler work;
    private final Events events;

    LanAds(Context context, Handler work, Events events) {
        this.nsd = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        this.work = work;
        this.events = events;
    }

    boolean available() {
        return nsd != null;
    }

    // ---- The room this device announces.

    /** What should be announced (null: nothing), and what is. */
    private Map<String, String> wanted, current;
    private String wantedName;
    private int wantedPort;
    private NsdManager.RegistrationListener registration;
    /** Waiting for NsdManager to finish a registration or an unregistration. */
    private boolean busy;
    private long registeredAt;
    private int failures;

    /** Announces a room (or its new attributes) on `port`. */
    void announce(String name, int port, Map<String, String> attrs) {
        wanted = new HashMap<>(attrs);
        wantedName = name;
        wantedPort = port;
        failures = 0;
        sync();
    }

    /** Stops announcing. */
    void withdraw() {
        wanted = null;
        sync();
    }

    private final Runnable later = this::sync;

    private void sync() {
        work.removeCallbacks(later);
        if (busy || nsd == null) return;
        if (registration != null) {
            if (wanted != null && wanted.equals(current) && wantedPort == currentPort) return;
            long wait = registeredAt + SETTLE_MS - System.currentTimeMillis();
            if (wanted != null && wait > 0) {
                work.postDelayed(later, wait);
                return;
            }
            busy = true;
            try {
                nsd.unregisterService(registration);
            } catch (RuntimeException e) {
                busy = false;
                registration = null;
                current = null;
                sync();
            }
            return;
        }
        if (wanted == null) return;
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName(wantedName);
        info.setServiceType(TYPE);
        info.setPort(wantedPort);
        for (Map.Entry<String, String> a : wanted.entrySet()) {
            try {
                info.setAttribute(a.getKey(), a.getValue());
            } catch (IllegalArgumentException e) {
                // An attribute too long for a TXT record is left out (the page keeps them short).
            }
        }
        final Map<String, String> sent = wanted;
        final int port = wantedPort;
        final NsdManager.RegistrationListener listener = new NsdManager.RegistrationListener() {
            @Override
            public void onServiceRegistered(NsdServiceInfo info) {
                work.post(() -> {
                    busy = false;
                    registeredAt = System.currentTimeMillis();
                    current = sent;
                    currentPort = port;
                    sync();
                });
            }

            @Override
            public void onRegistrationFailed(NsdServiceInfo info, int code) {
                work.post(() -> {
                    busy = false;
                    registration = null;
                    current = null;
                    if (++failures <= 3) work.postDelayed(later, RETRY_MS);
                    else events.error("host", "이 기기에서는 방을 와이파이에 알릴 수 없습니다. 주소 입력이나 QR로 연결하세요.");
                });
            }

            @Override
            public void onServiceUnregistered(NsdServiceInfo info) {
                work.post(() -> {
                    busy = false;
                    registration = null;
                    current = null;
                    sync();
                });
            }

            @Override
            public void onUnregistrationFailed(NsdServiceInfo info, int code) {
                onServiceUnregistered(info);
            }
        };
        registration = listener;
        busy = true;
        try {
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener);
        } catch (RuntimeException e) {
            busy = false;
            registration = null;
            events.error("host", "방을 와이파이에 알리지 못했습니다. 주소 입력이나 QR로 연결하세요.");
        }
    }

    private int currentPort;

    // ---- The rooms this device looks for.

    private NsdManager.DiscoveryListener discovery;
    private final ArrayDeque<NsdServiceInfo> queue = new ArrayDeque<>();
    private boolean resolving;
    private final Map<String, Integer> tries = new HashMap<>();

    /** Looks for rooms until `stopDiscovery`: each found one is resolved and told with its attributes. */
    void discover() {
        if (nsd == null) {
            events.error("discover", "이 기기에서는 방을 찾을 수 없습니다. 주소 입력이나 QR로 연결하세요.");
            return;
        }
        stopDiscovery();
        final NsdManager.DiscoveryListener listener = new NsdManager.DiscoveryListener() {
            @Override
            public void onDiscoveryStarted(String type) {
            }

            @Override
            public void onDiscoveryStopped(String type) {
            }

            @Override
            public void onStartDiscoveryFailed(String type, int code) {
                work.post(() -> {
                    if (discovery == this) discovery = null;
                    events.error("discover", "방을 찾지 못했습니다. 와이파이를 확인하고 다시 찾기를 누르세요.");
                });
            }

            @Override
            public void onStopDiscoveryFailed(String type, int code) {
            }

            @Override
            public void onServiceFound(NsdServiceInfo info) {
                work.post(() -> {
                    if (discovery != this || !TYPE.equals(trimType(info.getServiceType()))) return;
                    for (NsdServiceInfo q : queue) if (q.getServiceName().equals(info.getServiceName())) return;
                    tries.remove(info.getServiceName());
                    queue.add(info);
                    resolveNext();
                });
            }

            @Override
            public void onServiceLost(NsdServiceInfo info) {
                work.post(() -> {
                    if (discovery != this) return;
                    queue.removeIf(q -> q.getServiceName().equals(info.getServiceName()));
                    events.lost(info.getServiceName());
                });
            }
        };
        discovery = listener;
        try {
            nsd.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, listener);
        } catch (RuntimeException e) {
            discovery = null;
            events.error("discover", "방을 찾지 못했습니다. 와이파이를 확인하고 다시 찾기를 누르세요.");
        }
    }

    void stopDiscovery() {
        queue.clear();
        tries.clear();
        if (discovery == null) return;
        NsdManager.DiscoveryListener listener = discovery;
        discovery = null;
        try {
            nsd.stopServiceDiscovery(listener);
        } catch (RuntimeException e) {
            // It had not started.
        }
    }

    boolean discovering() {
        return discovery != null;
    }

    /** "._wtgroom._tcp." or "_wtgroom._tcp" as found, without the dots around it. */
    private static String trimType(String type) {
        if (type == null) return "";
        String t = type;
        while (t.startsWith(".")) t = t.substring(1);
        while (t.endsWith(".")) t = t.substring(0, t.length() - 1);
        if (t.endsWith(".local")) t = t.substring(0, t.length() - 6);
        return t;
    }

    @SuppressWarnings("deprecation")
    private void resolveNext() {
        if (resolving || discovery == null || queue.isEmpty()) return;
        final NsdServiceInfo info = queue.poll();
        final NsdManager.DiscoveryListener during = discovery;
        resolving = true;
        try {
            nsd.resolveService(info, new NsdManager.ResolveListener() {
                @Override
                public void onResolveFailed(NsdServiceInfo failed, int code) {
                    work.post(() -> {
                        resolving = false;
                        String name = info.getServiceName();
                        int n = tries.containsKey(name) ? tries.get(name) : 0;
                        // Another resolve was running (older Androids allow one), or the room did not answer yet.
                        if (discovery == during && n < 3) {
                            tries.put(name, n + 1);
                            work.postDelayed(() -> {
                                if (discovery == during) {
                                    queue.add(info);
                                    resolveNext();
                                }
                            }, code == NsdManager.FAILURE_ALREADY_ACTIVE ? 300 : 1000);
                        }
                        resolveNext();
                    });
                }

                @Override
                public void onServiceResolved(NsdServiceInfo found) {
                    work.post(() -> {
                        resolving = false;
                        if (discovery == during) events.found(found.getServiceName(), hostOf(found), found.getPort(), attributes(found));
                        resolveNext();
                    });
                }
            });
        } catch (RuntimeException e) {
            resolving = false;
            work.postDelayed(this::resolveNext, 500);
        }
    }

    /** The service's IPv4 address where there is one (the room's server listens on IPv4). */
    @SuppressWarnings("deprecation")
    private static String hostOf(NsdServiceInfo info) {
        InetAddress first = null;
        if (Build.VERSION.SDK_INT >= 34) {
            for (InetAddress a : info.getHostAddresses()) {
                if (a instanceof Inet4Address) return a.getHostAddress();
                if (first == null) first = a;
            }
        }
        InetAddress host = info.getHost();
        if (host instanceof Inet4Address) return host.getHostAddress();
        if (host != null) first = host;
        return first == null ? "" : first.getHostAddress();
    }

    private static Map<String, String> attributes(NsdServiceInfo info) {
        Map<String, String> out = new HashMap<>();
        Map<String, byte[]> attrs = info.getAttributes();
        if (attrs == null) return out;
        for (Map.Entry<String, byte[]> a : attrs.entrySet())
            out.put(a.getKey(), a.getValue() == null ? "" : new String(a.getValue(), StandardCharsets.UTF_8));
        return out;
    }

    /** Everything off (the page was opened anew, or the app goes). */
    void reset() {
        stopDiscovery();
        withdraw();
    }
}
