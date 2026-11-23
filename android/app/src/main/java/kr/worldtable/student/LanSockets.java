package kr.worldtable.student;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The connections of 와이파이 여럿이 inside the app: the host's small TCP server (on {@link #PORT} when it is free,
 * else on any port) and each guest's connection to it. A message is one line of UTF-8; the page's messages are JSON,
 * which never holds a raw line break. Only devices of the local network (private, link-local or loopback addresses)
 * are let in, and the server listens on IPv4 only. Each connection reads on a thread of its own and writes through a
 * single-thread queue, so that the page's calls never wait on the network.
 */
final class LanSockets {
    /** The port tried first, so that a typed address may leave it out (the page's `LAN_PORT`). */
    static final int PORT = 47297;
    /** The longest line taken: a whole game's resync is well under a megabyte. */
    private static final int MOST_LINE = 4 << 20;
    private static final int CONNECT_MS = 6000;

    /** What the connections tell the page. */
    interface Events {
        void incoming(String peer, String from);
        void opened(String peer);
        void failed(String peer, String text);
        void message(String peer, String text);
        void closed(String peer);
    }

    private final Events events;
    private final Map<String, Peer> peers = new ConcurrentHashMap<>();
    private final AtomicInteger next = new AtomicInteger();
    private volatile ServerSocket server;

    LanSockets(Events events) {
        this.events = events;
    }

    /** One connection: its socket, its writer queue, and whether my server took it (closed with the server). */
    private final class Peer {
        final String id;
        final boolean accepted;
        volatile Socket socket;
        final ExecutorService writer = Executors.newSingleThreadExecutor();
        private boolean ended;

        Peer(String id, boolean accepted) {
            this.id = id;
            this.accepted = accepted;
        }

        /** Reads lines until the connection ends; each line goes to the page. */
        void read() {
            try {
                InputStream in = new BufferedInputStream(socket.getInputStream());
                ByteArrayOutputStream line = new ByteArrayOutputStream();
                int b;
                while ((b = in.read()) >= 0) {
                    if (b == '\n') {
                        if (line.size() > 0) events.message(id, line.toString(StandardCharsets.UTF_8.name()));
                        line.reset();
                    } else if (line.size() >= MOST_LINE) {
                        break;
                    } else {
                        line.write(b);
                    }
                }
            } catch (IOException e) {
                // The connection ended.
            }
            end();
        }

        void write(String text) {
            final byte[] bytes = (text.replace('\n', ' ') + "\n").getBytes(StandardCharsets.UTF_8);
            try {
                writer.execute(() -> {
                    try {
                        OutputStream out = socket.getOutputStream();
                        out.write(bytes);
                        out.flush();
                    } catch (IOException e) {
                        end();
                    }
                });
            } catch (RuntimeException e) {
                // The queue was shut with the connection.
            }
        }

        /** Closes the connection; the page hears of it once. */
        void end() {
            synchronized (this) {
                if (ended) return;
                ended = true;
            }
            peers.remove(id);
            writer.shutdownNow();
            try {
                if (socket != null) socket.close();
            } catch (IOException e) {
                // Already closed.
            }
            events.closed(id);
        }
    }

    /** Opens the server (or keeps the one open): its port. */
    synchronized int listen() throws IOException {
        if (server != null && !server.isClosed()) return server.getLocalPort();
        ServerSocket socket = new ServerSocket();
        socket.setReuseAddress(true);
        InetAddress any = InetAddress.getByName("0.0.0.0");
        try {
            socket.bind(new InetSocketAddress(any, PORT), 16);
        } catch (IOException busy) {
            socket.close();
            socket = new ServerSocket();
            socket.setReuseAddress(true);
            socket.bind(new InetSocketAddress(any, 0), 16);
        }
        server = socket;
        final ServerSocket listening = socket;
        Thread acceptor = new Thread(() -> accept(listening), "wtg-lan-accept");
        acceptor.setDaemon(true);
        acceptor.start();
        return socket.getLocalPort();
    }

    private void accept(ServerSocket listening) {
        while (!listening.isClosed()) {
            Socket socket;
            try {
                socket = listening.accept();
            } catch (IOException e) {
                return;
            }
            InetAddress from = socket.getInetAddress();
            if (from == null || !(from.isSiteLocalAddress() || from.isLinkLocalAddress() || from.isLoopbackAddress())) {
                try {
                    socket.close();
                } catch (IOException e) {
                    // Gone.
                }
                continue;
            }
            Peer peer = new Peer("h" + next.incrementAndGet(), true);
            peer.socket = socket;
            try {
                socket.setTcpNoDelay(true);
                socket.setKeepAlive(true);
            } catch (IOException e) {
                // Defaults are fine.
            }
            peers.put(peer.id, peer);
            events.incoming(peer.id, from.getHostAddress());
            Thread reader = new Thread(peer::read, "wtg-lan-" + peer.id);
            reader.setDaemon(true);
            reader.start();
        }
    }

    /** Closes the server and every connection it took. */
    synchronized void stopListening() {
        if (server != null) {
            try {
                server.close();
            } catch (IOException e) {
                // Already closed.
            }
            server = null;
        }
        for (Peer peer : peers.values()) if (peer.accepted) peer.end();
    }

    boolean listening() {
        return server != null && !server.isClosed();
    }

    /** Connects to a host's `address:port`: the new peer's id at once, `opened` or `failed` once it is known. */
    String connect(String address) {
        final String id = "c" + next.incrementAndGet();
        int colon = address.lastIndexOf(':');
        final String host = colon > 0 ? address.substring(0, colon) : address;
        int port;
        try {
            port = colon > 0 ? Integer.parseInt(address.substring(colon + 1)) : PORT;
        } catch (NumberFormatException e) {
            port = -1;
        }
        final int to = port;
        final Peer peer = new Peer(id, false);
        Thread dial = new Thread(() -> {
            if (to < 1 || to > 65535) {
                events.failed(id, "주소가 맞지 않습니다");
                return;
            }
            Socket socket = new Socket();
            try {
                socket.setTcpNoDelay(true);
                socket.setKeepAlive(true);
                socket.connect(new InetSocketAddress(host, to), CONNECT_MS);
            } catch (IOException | IllegalArgumentException e) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                    // Gone.
                }
                events.failed(id, e instanceof java.net.SocketTimeoutException ? "대답이 없습니다" : "그 주소에 열린 방이 없습니다");
                return;
            }
            peer.socket = socket;
            peers.put(id, peer);
            events.opened(id);
            peer.read();
        }, "wtg-lan-" + id);
        dial.setDaemon(true);
        dial.start();
        return id;
    }

    boolean send(String peer, String text) {
        Peer p = peers.get(peer);
        if (p == null || p.socket == null) return false;
        p.write(text);
        return true;
    }

    void close(String peer) {
        Peer p = peers.get(peer);
        if (p != null) p.end();
    }

    /** Closes everything: the server and every connection. */
    synchronized void closeAll() {
        stopListening();
        for (Peer peer : peers.values()) peer.end();
    }

    /** This device's IPv4 address on the Wi-Fi (or its own hotspot), for the address a guest may type; null if none. */
    static String wifiAddress() {
        String fallback = null;
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                String name = nif.getName();
                for (InetAddress a : Collections.list(nif.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    if (name.startsWith("wlan") || name.startsWith("swlan") || name.startsWith("ap")) return a.getHostAddress();
                    if (fallback == null && !name.startsWith("rmnet") && !name.startsWith("ccmni")) fallback = a.getHostAddress();
                }
            }
        } catch (Exception e) {
            // No interfaces readable.
        }
        return fallback;
    }
}
