import com.sun.net.httpserver.HttpServer;
import io.github.lagilava.pingpong.AssetServer;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.file.*;

/**
 * JVM stand-in for the APK: serves a folder (the repo root, so game/ is
 * game/) through the real AssetServer class, so a desktop browser exercises
 * the same path mapping, MIME types and Range handling the app uses.
 * Usage: java ServeGame <repoRoot> <port>
 */
public class ServeGame {
    public static void main(String[] a) throws Exception {
        Path root = Paths.get(a[0]).toAbsolutePath().normalize();
        AssetServer srv = new AssetServer(path -> {
            Path f = root.resolve(path).normalize();
            if (!f.startsWith(root) || !Files.isRegularFile(f)) return null;
            return new AssetServer.Blob(new BufferedInputStream(Files.newInputStream(f)), Files.size(f));
        });
        HttpServer http = HttpServer.create(new InetSocketAddress("127.0.0.1", Integer.parseInt(a[1])), 0);
        http.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(8));
        http.createContext("/", ex -> {
            AssetServer.Response r = srv.serve(ex.getRequestURI().getPath(), ex.getRequestHeaders().getFirst("Range"));
            ex.getResponseHeaders().add("Content-Type", r.mime);
            r.headers.forEach((k, v) -> { if (!k.equals("Content-Length")) ex.getResponseHeaders().add(k, v); });
            long len = r.headers.containsKey("Content-Length") ? Long.parseLong(r.headers.get("Content-Length")) : -1;
            ex.sendResponseHeaders(r.status, len == 0 ? -1 : len);
            if (len != 0) try (OutputStream o = ex.getResponseBody(); InputStream in = r.body) { in.transferTo(o); } catch (IOException ignored) { }
            ex.close();
        });
        http.start();
        System.out.println("listening " + a[1]);
    }
}
