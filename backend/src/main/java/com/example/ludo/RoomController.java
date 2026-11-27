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
 public RoomController(SimpMessagingTemplate bus) { this.bus=bus; }
 public record JoinRequest(String playerId, String name) {}
 public record MoveRequest(String playerId, int token) {}
 public static class Player {
  public String id, name; public int seat;
  Player(String id,String name,int seat){this.id=id;this.name=name;this.seat=seat;}
 }
 public static class Room {
  public String code; public List<Player> players=new ArrayList<>();
  public int[][] tokens=new int[4][4]; public int turn=0,dice=0;
  public boolean rolled=false, finished=false; public String winner=null;
  Room(String code){this.code=code;for(int[] row:tokens)Arrays.fill(row,-1);}
 }
 @PostMapping
 public Room create(@RequestBody JoinRequest req) {
  String code;
  do { code=UUID.randomUUID().toString().substring(0,6).toUpperCase(); } while(rooms.containsKey(code));
  Room room=new Room(code); rooms.put(code,room);
  addPlayer(room,req); publish(room); return room;
 }
 @PostMapping("/{code}/join")
 public ResponseEntity<?> join(@PathVariable String code,@RequestBody JoinRequest req) {
  Room room=rooms.get(code.toUpperCase());
  if(room==null)return ResponseEntity.notFound().build();
  synchronized(room) {
   Optional<Player> existing=room.players.stream().filter(p->p.id.equals(req.playerId())).findFirst();
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
  Room r=rooms.get(code.toUpperCase());return r==null?ResponseEntity.notFound().build():ResponseEntity.ok(r);
 }
 @PostMapping("/{code}/roll")
 public ResponseEntity<?> roll(@PathVariable String code,@RequestBody JoinRequest req) {
  Room r=rooms.get(code.toUpperCase());if(r==null)return ResponseEntity.notFound().build();
  synchronized(r){
   int seat=seat(r,req.playerId()); if(seat<0||seat!=r.turn||r.rolled||r.finished)return ResponseEntity.badRequest().body(Map.of("error","Not your turn"));
   r.dice=1+(int)(Math.random()*6);r.rolled=true;
   boolean any=false;for(int t=0;t<4;t++)if(legal(r,seat,t)){any=true;break;}
   if(!any){r.rolled=false;r.turn=(r.turn+1)%r.players.size();}
   publish(r);return ResponseEntity.ok(r);
  }
 }
 @PostMapping("/{code}/move")
 public ResponseEntity<?> move(@PathVariable String code,@RequestBody MoveRequest req) {
  Room r=rooms.get(code.toUpperCase());if(r==null)return ResponseEntity.notFound().build();
  synchronized(r){
   int p=seat(r,req.playerId());int t=req.token();
   if(p<0||p!=r.turn||!r.rolled||t<0||t>3||!legal(r,p,t))return ResponseEntity.badRequest().body(Map.of("error","Invalid move"));
   int old=r.tokens[p][t];r.tokens[p][t]=old<0?0:old+r.dice;
   boolean captured=false;int v=r.tokens[p][t];
   if(v<=51){int sq=(start(p)+v)%52;if(!Set.of(0,8,13,21,26,34,39,47).contains(sq)){
    for(int q=0;q<r.players.size();q++)if(q!=p)for(int z=0;z<4;z++)if(r.tokens[q][z]>=0&&r.tokens[q][z]<=51&&(start(q)+r.tokens[q][z])%52==sq){r.tokens[q][z]=-1;captured=true;}
   }}
   if(Arrays.stream(r.tokens[p]).allMatch(x->x==57)){r.finished=true;r.winner=req.playerId();}
   boolean again=r.dice==6||captured;r.rolled=false;
   if(!again&&!r.finished)r.turn=(r.turn+1)%r.players.size();
   publish(r);return ResponseEntity.ok(r);
  }
 }
 private int seat(Room r,String id){for(Player p:r.players)if(p.id.equals(id))return p.seat;return -1;}
 private int start(int p){return new int[]{0,13,26,39}[p];}
 private boolean legal(Room r,int p,int t){int v=r.tokens[p][t];return v!=57&&(v<0?r.dice==6:v+r.dice<=57);}
 private void publish(Room r){bus.convertAndSend("/topic/rooms/"+r.code,r);}
}
