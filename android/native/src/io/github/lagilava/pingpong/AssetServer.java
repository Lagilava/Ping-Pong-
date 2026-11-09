package io.github.lagilava.pingpong;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Maps https://appassets.androidplatform.net/... requests onto the bundled
 * copy of game/ and answers like a static web server, including HTTP Range
 * (music streams and seeks). Pure Java with no Android imports so the exact
 * same code can be tested on a JVM (see test/ServeGame.java).
 */
public final class AssetServer {
    public static final String HOST = "appassets.androidplatform.net";
    public static final String START_URL = "https://" + HOST + "/game/index.html";

    /** One bundled file: a stream positioned at byte 0 and its total length. */
    public static final class Blob {
        public final InputStream stream;
        public final long length;
        public Blob(InputStream stream, long length) { this.stream = stream; this.length = length; }
    }

    /** Where the bytes come from (APK assets on a device, a folder in tests). */
    public interface Source {
        /** Returns null when the file does not exist. Path is relative, e.g. "game/js/core/boot.js". */
        Blob open(String path) throws IOException;
    }

    public static final class Response {
        public final int status;
        public final String reason;
        public final String mime;
        public final Map<String, String> headers;
        public final InputStream body;
        Response(int status, String reason, String mime, Map<String, String> headers, InputStream body) {
            this.status = status; this.reason = reason; this.mime = mime; this.headers = headers; this.body = body;
        }
    }

    private final Source source;

    public AssetServer(Source source) { this.source = source; }

    public static boolean isOurHost(String host) { return HOST.equalsIgnoreCase(host); }

    /** Request path (no query or fragment) to an asset path, or null when it escapes game/. */
    static String assetPath(String urlPath) {
        String p = urlPath == null ? "/" : urlPath;
        if (p.isEmpty() || p.equals("/") || p.equals("/game") || p.equals("/game/")) p = "/game/index.html";
        if (!p.startsWith("/game/")) return null;
        if (p.contains("..") || p.contains("\\") || p.contains("//")) return null;
        return p.substring(1);
    }

    public Response serve(String urlPath, String rangeHeader) {
        String path = assetPath(urlPath);
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Accept-Ranges", "bytes");
        h.put("Cache-Control", "no-cache");
        if (path == null) return notFound(h);
        Blob blob;
        try { blob = source.open(path); } catch (IOException e) { blob = null; }
        if (blob == null) return notFound(h);
        String mime = mimeFor(path);
        long total = blob.length;
        try {
            long[] range = parseRange(rangeHeader, total);
            if (range == null) {
                h.put("Content-Length", Long.toString(total));
                return new Response(200, "OK", mime, h, blob.stream);
            }
            if (range[0] < 0) { // unsatisfiable
                blob.stream.close();
                h.put("Content-Range", "bytes */" + total);
                return new Response(416, "Requested Range Not Satisfiable", mime, h, new ByteArrayInputStream(new byte[0]));
            }
            long start = range[0], end = range[1];
            skipFully(blob.stream, start);
            long len = end - start + 1;
            h.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
            h.put("Content-Length", Long.toString(len));
            return new Response(206, "Partial Content", mime, h, new Bounded(blob.stream, len));
        } catch (IOException e) {
            try { blob.stream.close(); } catch (IOException ignored) { /* nothing */ }
            return notFound(h);
        }
    }

    private static Response notFound(Map<String, String> h) {
        h.put("Content-Length", "0");
        return new Response(404, "Not Found", "text/plain", h, new ByteArrayInputStream(new byte[0]));
    }

    /** null = no/ignored Range header; {-1,-1} = unsatisfiable; else inclusive {start,end}. */
    static long[] parseRange(String header, long total) {
        if (header == null) return null;
        String v = header.trim().toLowerCase(Locale.ROOT);
        if (!v.startsWith("bytes=") || v.indexOf(',') >= 0) return null;
        String spec = v.substring(6).trim();
        int dash = spec.indexOf('-');
        if (dash < 0) return null;
        try {
            String a = spec.substring(0, dash).trim(), b = spec.substring(dash + 1).trim();
            long start, end;
            if (a.isEmpty()) { // suffix: last N bytes
                long n = Long.parseLong(b);
                if (n <= 0) return new long[] {-1, -1};
                start = Math.max(0, total - n);
                end = total - 1;
            } else {
                start = Long.parseLong(a);
                end = b.isEmpty() ? total - 1 : Math.min(Long.parseLong(b), total - 1);
            }
            if (total == 0 || start >= total || start > end) return new long[] {-1, -1};
            return new long[] {start, end};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static void skipFully(InputStream in, long n) throws IOException {
        long left = n;
        while (left > 0) {
            long s = in.skip(left);
            if (s <= 0) {
                if (in.read() < 0) throw new IOException("EOF while skipping");
                s = 1;
            }
            left -= s;
        }
    }

    /** Reads at most {@code limit} bytes and closes the source with itself. */
    private static final class Bounded extends InputStream {
        private final InputStream in;
        private long left;
        Bounded(InputStream in, long limit) { this.in = in; this.left = limit; }
        @Override public int read() throws IOException {
            if (left <= 0) return -1;
            int b = in.read();
            if (b >= 0) left--;
            return b;
        }
        @Override public int read(byte[] buf, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = in.read(buf, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }
        @Override public int available() throws IOException { return (int) Math.min(in.available(), left); }
        @Override public void close() throws IOException { in.close(); }
    }

    public static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.max(32, in.available()));
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }

    public static String mimeFor(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot < 0 ? "" : path.substring(dot + 1).toLowerCase(Locale.ROOT);
        switch (ext) {
            case "html": case "htm": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": case "map": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "svg": return "image/svg+xml";
            case "ico": return "image/x-icon";
            case "mp3": return "audio/mpeg";
            case "ogg": case "oga": return "audio/ogg";
            case "wav": return "audio/wav";
            case "m4a": return "audio/mp4";
            case "mp4": return "video/mp4";
            case "webm": return "video/webm";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "ttf": return "font/ttf";
            case "wasm": return "application/wasm";
            case "glb": return "model/gltf-binary";
            case "txt": return "text/plain";
            default: return "application/octet-stream";
        }
    }
}
