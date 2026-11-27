CREATE TABLE IF NOT EXISTS game_room (
  room_code VARCHAR(8) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'WAITING'
);
CREATE TABLE IF NOT EXISTS room_player (
  id BIGSERIAL PRIMARY KEY,
  room_code VARCHAR(8) NOT NULL REFERENCES game_room(room_code) ON DELETE CASCADE,
  player_id VARCHAR(80) NOT NULL,
  display_name VARCHAR(24) NOT NULL,
  seat INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 3),
  UNIQUE(room_code, player_id),
  UNIQUE(room_code, seat)
);
