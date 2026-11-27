# Online Ludo (4 players)

A starter online multiplayer Ludo project:
- React + Vite frontend
- Java Spring Boot backend
- WebSocket/STOMP room updates
- PostgreSQL schema included
- Create room, share invite URL/code, join from another device

## Requirements
- Node.js 20+
- Java 21+
- Maven 3.9+
- PostgreSQL 15+

## 1. Start PostgreSQL
Create a database and user, or use Docker:
```bash
docker compose up -d db
```

## 2. Start backend
```bash
cd backend
mvn spring-boot:run
```
Backend: http://localhost:8080

## 3. Start frontend
In another terminal:
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

## 4. Play with friends on different devices
For local-network testing, set `VITE_API_URL` and `VITE_WS_URL` in `frontend/.env` to your computer's LAN IP, for example:
```
VITE_API_URL=http://192.168.1.10:8080
VITE_WS_URL=http://192.168.1.10:8080/ws
```
Ensure port 8080 is reachable on your network. For internet play, deploy the frontend and backend to public hosting and configure the frontend URLs to the public backend URL. Use HTTPS/WSS in production.

Create a room, copy the invite link, and send it to friends. Everyone must open the same deployed website. The link includes the room code.

## Important implementation notes
This is a runnable multiplayer starter, not a production-certified Ludo King clone. It synchronizes room membership, dice rolls, token moves and winner state through the server. The server is authoritative for turns and legal moves. Room state is currently held in memory; PostgreSQL schema is supplied for persistence work, but persistence/recovery is not wired in yet. Rooms disappear if the backend restarts. Add authentication, rate limits, reconnect recovery, durable room storage and deployment secrets before public launch.
