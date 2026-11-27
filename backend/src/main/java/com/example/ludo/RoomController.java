package com.example.ludo;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rooms")
@CrossOrigin(origins="*")
public class RoomController {
 private final Map<String, Room> rooms = new ConcurrentHashMap<>();
 private final SimpMessagingTemplate bus;
 private final RoomStore store;
 public RoomController(SimpMessagingTemplate bus, RoomStore store) { this.bus=bus; this.store=store; }
 Room find(String code) {
  Room r=rooms.computeIfAbsent(code.toUpperCase(), c -> store.load(c).orElse(null));
  // rooms saved before the lobby existed have no 'started' flag: treat games already in play as started
  if(r!=null&&!r.started&&(r.dice!=0||r.finished||Arrays.stream(r.tokens).flatMapToInt(Arrays::stream).anyMatch(v->v>=0)))r.started=true;
  return r;
 }
 public record JoinRequest(String playerId, String name) {}
 public record MoveRequest(String playerId, int token) {}
 public static class Player {
  public String id, name; public int seat;
  public Player() {}
  Player(String id,String name,int seat){this.id=id;this.name=name;this.seat=seat;}
 }
 public static class Room {
  public String code; public List<Player> players=new ArrayList<>();
  public int[][] tokens=new int[4][4]; public int turn=0,dice=0,rolls=0;
  public boolean rolled=false, finished=false; public String winner=null;
  /** false while players wait in the lobby; the host (seat 0, the creator) starts the game */
  public boolean started=false;
  /** player ids in finishing order: gold, silver, bronze...; the last one appended when the game ends lost */
  public List<String> ranking=new ArrayList<>();
  public Room() {}
  Room(String code){this.code=code;for(int[] row:tokens)Arrays.fill(row,-1);}
 }
 @PostMapping
 public Room create(@RequestBody JoinRequest req) {
  String code;
  do { code=UUID.randomUUID().toString().substring(0,6).toUpperCase(); } while(rooms.containsKey(code)||store.exists(code));
  Room room=new Room(code); rooms.put(code,room);
  addPlayer(room,req); publish(room); return room;
 }
 @PostMapping("/{code}/join")
 public ResponseEntity<?> join(@PathVariable String code,@RequestBody JoinRequest req) {
  Room room=find(code);
  if(room==null)return ResponseEntity.notFound().build();
  synchronized(room) {
   Optional<Player> existing=room.players.stream().filter(p->p.id.equals(req.playerId())).findFirst();
   if(existing.isEmpty() && room.started)return ResponseEntity.status(409).body(Map.of("error","This game has already started"));
   if(existing.isEmpty() && room.players.size()>=4)return ResponseEntity.status(409).body(Map.of("error","Room is full"));
   if(existing.isEmpty())addPlayer(room,req);
   publish(room);return ResponseEntity.ok(room);
  }
 }
 private void addPlayer(Room r,JoinRequest q) {
  if(q.playerId()==null||q.playerId().isBlank()||q.name()==null||q.name().isBlank())throw new IllegalArgumentException("Player ID and name are required");
  if(r.players.size()>=4)throw new IllegalStateException("Room full");
  r.players.add(new Player(q.playerId(),q.name().trim().substring(0,Math.min(24,q.name().trim().length())),r.players.size()));
 }
 @GetMapping("/{code}")
 public ResponseEntity<?> get(@PathVariable String code) {
  Room r=find(code);return r==null?ResponseEntity.notFound().build():ResponseEntity.ok(r);
 }
 @PostMapping("/{code}/roll")
 public ResponseEntity<?> roll(@PathVariable String code,@RequestBody JoinRequest req) {
  return roll(code,req.playerId(),0);
 }
 /** value 1-6 sets the dice (host voice command, server side only); 0 rolls at random */
 ResponseEntity<?> roll(String code,String playerId,int value) {
  Room r=find(code);if(r==null)return ResponseEntity.notFound().build();
  synchronized(r){
   int seat=seat(r,playerId); if(seat<0||!r.started||seat!=r.turn||r.rolled||r.finished)return ResponseEntity.badRequest().body(Map.of("error","Not your turn"));
   r.dice=value>=1&&value<=6?value:1+(int)(Math.random()*6);r.rolled=true;r.rolls++;
   boolean any=false;for(int t=0;t<4;t++)if(legal(r,seat,t)){any=true;break;}
   if(!any){r.rolled=false;nextTurn(r);}
   publish(r);return ResponseEntity.ok(r);
  }
 }
 @PostMapping("/{code}/move")
 public ResponseEntity<?> move(@PathVariable String code,@RequestBody MoveRequest req) {
  Room r=find(code);if(r==null)return ResponseEntity.notFound().build();
  synchronized(r){
   int p=seat(r,req.playerId());int t=req.token();
   if(p<0||!r.started||p!=r.turn||!r.rolled||t<0||t>3||!legal(r,p,t))return ResponseEntity.badRequest().body(Map.of("error","Invalid move"));
   int old=r.tokens[p][t];r.tokens[p][t]=old<0?0:old+r.dice;
   boolean captured=false;int v=r.tokens[p][t];
   if(v<=51){int sq=(start(p)+v)%52;if(!Set.of(0,8,13,21,26,34,39,47).contains(sq)){
    for(int q=0;q<r.players.size();q++)if(q!=p)for(int z=0;z<4;z++)if(r.tokens[q][z]>=0&&r.tokens[q][z]<=51&&(start(q)+r.tokens[q][z])%52==sq){r.tokens[q][z]=-1;captured=true;}
   }}
   boolean done=false;
   if(Arrays.stream(r.tokens[p]).allMatch(x->x==57)&&!r.ranking.contains(req.playerId())){
    done=true;r.ranking.add(req.playerId());
    if(r.ranking.size()==1)r.winner=req.playerId();
    // game ends when only one player is left; that player is last (lost)
    if(r.ranking.size()>=r.players.size()-1){
     for(Player pl:r.players)if(!r.ranking.contains(pl.id))r.ranking.add(pl.id);
     r.finished=true;
    }
   }
   boolean again=r.dice==6||captured;r.rolled=false;
   if((!again||done)&&!r.finished)nextTurn(r);
   publish(r);return ResponseEntity.ok(r);
  }
 }
/** the host (the player who created the room) starts the game once at least 2 players are in */
 @PostMapping("/{code}/start")
 public ResponseEntity<?> start(@PathVariable String code,@RequestBody JoinRequest req) {
  Room r=find(code);if(r==null)return ResponseEntity.notFound().build();
  synchronized(r){
   if(seat(r,req.playerId())!=0)return ResponseEntity.status(403).body(Map.of("error","Only the host can start the game"));
   if(r.started)return ResponseEntity.ok(r);
   if(r.players.size()<2)return ResponseEntity.badRequest().body(Map.of("error","Wait for at least one more player to join"));
   r.started=true;r.turn=0;
   publish(r);return ResponseEntity.ok(r);
  }
 }
/** advance to the next player who has not finished yet */
 private void nextTurn(Room r){
  for(int i=0;i<r.players.size();i++){
   r.turn=(r.turn+1)%r.players.size();
   if(!r.ranking.contains(r.players.get(r.turn).id))return;
  }
 }
 /** start a new game with the same players (any player can ask once the game is over) */
 @PostMapping("/{code}/restart")
 public ResponseEntity<?> restart(@PathVariable String code,@RequestBody JoinRequest req) {
  Room r=find(code);if(r==null)return ResponseEntity.notFound().build();
  synchronized(r){
   if(seat(r,req.playerId())<0||!r.finished)return ResponseEntity.badRequest().body(Map.of("error","Game is not over yet"));
   for(int[] row:r.tokens)Arrays.fill(row,-1);
   r.turn=0;r.dice=0;r.rolled=false;r.finished=false;r.winner=null;r.ranking.clear();
   publish(r);return ResponseEntity.ok(r);
  }
 }
 int seat(Room r,String id){for(Player p:r.players)if(p.id.equals(id))return p.seat;return -1;}
 private int start(int p){return new int[]{0,13,26,39}[p];}
 private boolean legal(Room r,int p,int t){int v=r.tokens[p][t];return v!=57&&(v<0?r.dice==6:v+r.dice<=57);}
 private void publish(Room r){store.save(r);bus.convertAndSend("/topic/rooms/"+r.code,r);}
}
