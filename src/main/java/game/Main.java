package game;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

public final class Main {
    private static final Path WEB_ROOT = Path.of("public").toAbsolutePath().normalize();
    private static final List<Score> SCORES = new ArrayList<>();

    private Main() {}

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.createContext("/", Main::handleRequest);
        server.start();
        System.out.println("Ridgeline is running at http://localhost:" + port);
    }

    private static void handleRequest(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/api/leaderboard")) {
            if (!exchange.getRequestMethod().equals("GET")) {
                respond(exchange, 405, "application/json", "{\"error\":\"Method not allowed\"}");
                return;
            }
            respond(exchange, 200, "application/json", leaderboardJson());
            return;
        }
        if (path.equals("/api/score")) {
            if (!exchange.getRequestMethod().equals("POST")) {
                respond(exchange, 405, "application/json", "{\"error\":\"Method not allowed\"}");
                return;
            }
            saveScore(exchange);
            return;
        }

        Path file = WEB_ROOT.resolve(path.equals("/") ? "index.html" : path.substring(1)).normalize();
        if (!file.startsWith(WEB_ROOT) || !Files.isRegularFile(file)) {
            respond(exchange, 404, "text/plain; charset=utf-8", "Not found");
            return;
        }
        String contentType = switch (extension(file)) {
            case "html" -> "text/html; charset=utf-8";
            case "css" -> "text/css; charset=utf-8";
            case "js" -> "text/javascript; charset=utf-8";
            case "svg" -> "image/svg+xml";
            default -> "application/octet-stream";
        };
        byte[] content = Files.readAllBytes(file);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(200, content.length);
        try (var output = exchange.getResponseBody()) {
            output.write(content);
        }
    }

    private static synchronized void saveScore(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        Map<String, String> values = parseForm(body);
        String name = values.getOrDefault("name", "").replaceAll("[^A-Za-z0-9 _-]", "").trim();
        if (name.isBlank()) name = "Rider";
        if (name.length() > 14) name = name.substring(0, 14);
        int distance = parsePositiveInt(values.get("distance"));
        int coins = parsePositiveInt(values.get("coins"));
        SCORES.add(new Score(name, distance, coins));
        SCORES.sort(Comparator.comparingInt(Score::distance).reversed());
        if (SCORES.size() > 8) SCORES.remove(SCORES.size() - 1);
        respond(exchange, 201, "application/json", leaderboardJson());
    }

    private static Map<String, String> parseForm(String body) {
        java.util.HashMap<String, String> values = new java.util.HashMap<>();
        for (String part : body.split("&")) {
            String[] pair = part.split("=", 2);
            String key = URLDecoder.decode(pair[0], StandardCharsets.UTF_8);
            String value = pair.length > 1 ? URLDecoder.decode(pair[1], StandardCharsets.UTF_8) : "";
            values.put(key, value);
        }
        return values;
    }

    private static int parsePositiveInt(String value) {
        try {
            return Math.max(0, Math.min(1_000_000, Integer.parseInt(value)));
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private static synchronized String leaderboardJson() {
        StringBuilder json = new StringBuilder("{\"scores\":[");
        for (int i = 0; i < SCORES.size(); i++) {
            Score score = SCORES.get(i);
            if (i > 0) json.append(',');
            json.append("{\"name\":\"").append(jsonEscape(score.name()))
                    .append("\",\"distance\":").append(score.distance())
                    .append(",\"coins\":").append(score.coins()).append('}');
        }
        return json.append("]}").toString();
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String extension(Path file) {
        String name = file.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase();
    }

    private static void respond(HttpExchange exchange, int status, String type, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private record Score(String name, int distance, int coins) {}
}