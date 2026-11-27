package com.example.ludo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Saves rooms to Postgres when DATABASE_URL is set (Render's
 * postgresql://user:pass@host:port/db connection string). Without it,
 * every method is a no-op and rooms live only in memory.
 */
@Component
public class RoomStore {
 private static final Logger log = LoggerFactory.getLogger(RoomStore.class);
 private final ObjectMapper json;
 private final JdbcTemplate db;

 public RoomStore(ObjectMapper json) {
  this.json = json;
  String url = System.getenv("DATABASE_URL");
  if (url == null || url.isBlank()) {
   log.warn("DATABASE_URL not set: rooms are kept in memory only");
   this.db = null;
   return;
  }
  this.db = new JdbcTemplate(dataSource(url));
  db.execute("CREATE TABLE IF NOT EXISTS room_state ("
   + "room_code VARCHAR(8) PRIMARY KEY, state TEXT NOT NULL, "
   + "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  log.info("Room persistence enabled (Postgres)");
 }

 private static HikariDataSource dataSource(String url) {
  HikariConfig c = new HikariConfig();
  if (url.startsWith("jdbc:")) {
   c.setJdbcUrl(url);
   c.setUsername(System.getenv("DATABASE_USER"));
   c.setPassword(System.getenv("DATABASE_PASSWORD"));
  } else {
   URI u = URI.create(url);
   String[] cred = u.getUserInfo().split(":", 2);
   int port = u.getPort() < 0 ? 5432 : u.getPort();
   c.setJdbcUrl("jdbc:postgresql://" + u.getHost() + ":" + port + u.getPath());
   c.setUsername(cred[0]);
   c.setPassword(cred.length > 1 ? cred[1] : "");
  }
  c.setMaximumPoolSize(3);
  return new HikariDataSource(c);
 }

 public void save(RoomController.Room room) {
  if (db == null) return;
  try {
   db.update("INSERT INTO room_state (room_code, state, updated_at) VALUES (?, ?, NOW()) "
    + "ON CONFLICT (room_code) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()",
    room.code, json.writeValueAsString(room));
  } catch (Exception e) {
   log.error("Failed to save room {}", room.code, e);
  }
 }

 public Optional<RoomController.Room> load(String code) {
  if (db == null) return Optional.empty();
  try {
   return db.query("SELECT state FROM room_state WHERE room_code = ?",
     rs -> rs.next() ? Optional.of(rs.getString(1)) : Optional.<String>empty(), code)
    .map(s -> {
     try { return json.readValue(s, RoomController.Room.class); }
     catch (Exception e) { throw new RuntimeException(e); }
    });
  } catch (Exception e) {
   log.error("Failed to load room {}", code, e);
   return Optional.empty();
  }
 }

 public boolean exists(String code) {
  if (db == null) return false;
  Integer n = db.queryForObject("SELECT COUNT(*) FROM room_state WHERE room_code = ?", Integer.class, code);
  return n != null && n > 0;
 }
}
