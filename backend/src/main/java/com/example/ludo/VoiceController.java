package com.example.ludo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Voice control: the browser records a short clip, Gemini works out what the
 * player asked for, and if it was "roll the dice" the roll is made for them.
 * The Gemini key stays on the server (GEMINI_API_KEY); it is never sent to browsers.
 */
@RestController
@RequestMapping("/api/rooms")
@CrossOrigin(origins = "*")
public class VoiceController {
 private static final Logger log = LoggerFactory.getLogger(VoiceController.class);
 private static final int MAX_AUDIO_B64 = 1_500_000;   // ~1.1 MB of audio, far more than a few seconds of 16 kHz WAV
 private static final long COOLDOWN_MS = 1500;           // per player, so the key cannot be spammed
 private static final String PROMPT = """
  You are the voice control of an online Ludo game. Listen to the audio clip.
  The player may speak any language (for example English, Telugu, Hindi, Tamil).
  Decide if they are asking to roll / throw / play the dice (for example "roll", "roll the dice",
  "throw", "dice", "go", "my turn", "paasa veyyi", "dice phenko").
  Reply with "heard": a short transcript of what was said (empty if silence or noise), and
  "action": "roll" if they asked to roll the dice, otherwise "none".
  """;

 private final RoomController rooms;
 private final ObjectMapper json;
 private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
 private final String apiKey = System.getenv("GEMINI_API_KEY");
 private final String model = envOr("GEMINI_MODEL", "gemini-3.1-flash-lite");
 private final Map<String, Long> lastCall = new ConcurrentHashMap<>();

 public VoiceController(RoomController rooms, ObjectMapper json) {
  this.rooms = rooms; this.json = json;
  if (enabled()) log.info("Voice control enabled (Gemini model {})", model);
  else log.warn("GEMINI_API_KEY not set: voice control is off");
 }

 public record VoiceRequest(String playerId, String audio, String mimeType) {}

 private boolean enabled() { return apiKey != null && !apiKey.isBlank(); }
 private static String envOr(String k, String d) { String v = System.getenv(k); return v == null || v.isBlank() ? d : v; }
 private static ResponseEntity<?> err(int status, String msg) { return ResponseEntity.status(status).body(Map.of("error", msg)); }

 /** lets the frontend hide the mic button when no key is configured */
 @GetMapping("/voice/status")
 public Map<String, Object> status() { return Map.of("enabled", enabled()); }

 @PostMapping("/{code}/voice")
 public ResponseEntity<?> voice(@PathVariable String code, @RequestBody VoiceRequest req) {
  if (!enabled()) return err(503, "Voice control is not set up on the server");
  RoomController.Room r = rooms.find(code);
  if (r == null) return err(404, "Room not found");
  if (req.playerId() == null || req.audio() == null || req.audio().isBlank()) return err(400, "No audio received");
  if (req.audio().length() > MAX_AUDIO_B64) return err(413, "Voice clip is too long");
  // only ask Gemini when the speaker could actually roll right now
  int seat;
  synchronized (r) { seat = rooms.seat(r, req.playerId()); }
  if (seat < 0) return err(403, "You are not in this room");
  if (!r.started || r.finished || r.turn != seat || r.rolled) return err(409, "It's not your turn to roll");
  long now = System.currentTimeMillis();
  Long prev = lastCall.put(req.playerId(), now);
  if (prev != null && now - prev < COOLDOWN_MS) return err(429, "Slow down, try again in a moment");

  JsonNode intent;
  try { intent = ask(req.audio(), req.mimeType() == null ? "audio/wav" : req.mimeType()); }
  catch (Exception e) { log.error("Gemini voice request failed", e); return err(502, "Couldn't understand the voice service, try again"); }

  String heard = intent.path("heard").asText("");
  String action = intent.path("action").asText("none");
  if (!"roll".equals(action)) return ResponseEntity.ok(Map.of("heard", heard, "action", "none"));
  ResponseEntity<?> rolled = rooms.roll(code, new RoomController.JoinRequest(req.playerId(), null));
  if (!rolled.getStatusCode().is2xxSuccessful()) return rolled;
  return ResponseEntity.ok(Map.of("heard", heard, "action", "roll", "room", rolled.getBody()));
 }

 /** sends the clip to Gemini and returns its {heard, action} JSON answer */
 private JsonNode ask(String audioB64, String mime) throws Exception {
  Map<String, Object> body = Map.of(
   "contents", List.of(Map.of("parts", List.of(
    Map.of("text", PROMPT),
    Map.of("inlineData", Map.of("mimeType", mime, "data", audioB64))))),
   "generationConfig", Map.of(
    "temperature", 0,
    "responseMimeType", "application/json",
    "responseSchema", Map.of("type", "OBJECT",
     "properties", Map.of(
      "heard", Map.of("type", "STRING"),
      "action", Map.of("type", "STRING", "enum", List.of("roll", "none"))),
     "required", List.of("heard", "action"))));
  HttpRequest httpReq = HttpRequest.newBuilder(URI.create(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent"))
   .timeout(Duration.ofSeconds(15))
   .header("Content-Type", "application/json")
   .header("x-goog-api-key", apiKey)
   .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
   .build();
  HttpResponse<String> res = http.send(httpReq, HttpResponse.BodyHandlers.ofString());
  if (res.statusCode() != 200) throw new IllegalStateException("Gemini HTTP " + res.statusCode() + ": " + res.body());
  // take the first real text part (skip any "thought" parts some models add)
  for (JsonNode part : json.readTree(res.body()).path("candidates").path(0).path("content").path("parts"))
   if (part.has("text") && !part.path("thought").asBoolean(false)) return json.readTree(part.get("text").asText());
  throw new IllegalStateException("Gemini returned no text: " + res.body());
 }
}
