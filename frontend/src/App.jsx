import React,{useEffect,useMemo,useState} from 'react';
import {Client} from '@stomp/stompjs';
const API=import.meta.env.VITE_API_URL||'http://localhost:8080';
const WS=import.meta.env.VITE_WS_URL||'http://localhost:8080/ws';
const COLORS=['#df3939','#229d55','#e7bb28','#3284dc'];
const NAMES=['Red','Green','Yellow','Blue'];
const PATH=[[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
const LANES=[[[7,1],[7,2],[7,3],[7,4],[7,5]],[[1,7],[2,7],[3,7],[4,7],[5,7]],[[7,13],[7,12],[7,11],[7,10],[7,9]],[[13,7],[12,7],[11,7],[10,7],[9,7]]];
const BASE=[[[1.5,1.5],[4.5,1.5],[1.5,4.5],[4.5,4.5]],[[1.5,10.5],[4.5,10.5],[1.5,13.5],[4.5,13.5]],[[10.5,10.5],[13.5,10.5],[10.5,13.5],[13.5,13.5]],[[10.5,1.5],[13.5,1.5],[10.5,4.5],[13.5,4.5]]];
const safe=[0,8,13,21,26,34,39,47];
function App(){
 const inviteCode=new URLSearchParams(location.search).get('room')||'';
 const [name,setName]=useState(()=>localStorage.getItem('ludo-name')||'');const [roomCode,setRoomCode]=useState(inviteCode);
 const [room,setRoom]=useState(null);const [playerId]=useState(()=>sessionStorage.getItem('ludo-player')||crypto.randomUUID());
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 // sessionStorage: each tab/device is its own player, but a refresh keeps the same seat
 useEffect(()=>sessionStorage.setItem('ludo-player',playerId),[playerId]);
 useEffect(()=>{if(name.trim())localStorage.setItem('ludo-name',name.trim())},[name]);
 useEffect(()=>{if(!room?.code)return;const client=new Client({brokerURL:WS,reconnectDelay:3000,onConnect:()=>client.subscribe(`/topic/rooms/${room.code}`,m=>setRoom(JSON.parse(m.body))),onStompError:f=>setError(f.headers.message||'Connection error')});client.activate();return()=>client.deactivate()},[room?.code]);
 async function request(path,body){setBusy(true);setError('');try{let r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');setRoom(data);return data}catch(e){setError(e.message);return null}finally{setBusy(false)}}
 async function create(){let r=await request('/api/rooms',{playerId,name});if(r){setRoomCode(r.code);history.replaceState({},'',`?room=${r.code}`)}}
 async function join(){let r=await request(`/api/rooms/${roomCode.toUpperCase()}/join`,{playerId,name});if(r){setRoomCode(r.code);history.replaceState({},'',`?room=${r.code}`)}}
 const me=room?.players.find(p=>p.id===playerId);const myTurn=!!me&&room.turn===me.seat;
 async function act(action,token){await request(`/api/rooms/${room.code}/${action}`,action==='move'?{playerId,token}:{playerId,name})}
 function pos(p,t){let v=room.tokens[p][t];if(v<0){let [r,c]=BASE[p][t];return[c*40+20,r*40+20]}if(v<=51){let [r,c]=PATH[(p*13+v)%52];return[c*40+20,r*40+20]}if(v<=56){let [r,c]=LANES[p][v-52];return[c*40+20,r*40+20]}return[300,300]}
 function valid(t){let v=room.tokens[me.seat][t];return room.rolled&&(v<0?room.dice===6:v!==57&&v+room.dice<=57)}
 function board(){let s=[];s.push(<rect key="bg" width="600" height="600" fill="white"/>);[[0,0],[0,9],[9,9],[9,0]].forEach(([r,c],p)=>{s.push(<rect key={'a'+p} x={c*40} y={r*40} width="240" height="240" fill={COLORS[p]} stroke="#333" strokeWidth="2"/>);s.push(<rect key={'b'+p} x={c*40+40} y={r*40+40} width="160" height="160" rx="8" fill="white" stroke={COLORS[p]} strokeWidth="3"/>);BASE[p].forEach(([rr,cc],t)=>s.push(<circle key={`base${p}${t}`} cx={cc*40+20} cy={rr*40+20} r="23" fill="#f4f4f4" stroke={COLORS[p]} strokeWidth="3"/>))});
 PATH.forEach(([r,c],i)=>{let p=[0,13,26,39].indexOf(i);s.push(<rect key={'p'+i} x={c*40} y={r*40} width="40" height="40" fill={p>=0?COLORS[p]:'#fff'} stroke="#777"/>);if(safe.includes(i))s.push(<text key={'s'+i} x={c*40+20} y={r*40+27} textAnchor="middle" fontSize="22" fill="#c99b20">★</text>)});
 LANES.forEach((lane,p)=>lane.forEach(([r,c],i)=>s.push(<rect key={`l${p}${i}`} x={c*40} y={r*40} width="40" height="40" fill={COLORS[p]} stroke="#777"/>)));
 s.push(<path key="c1" d="M240 240H360L300 300Z" fill={COLORS[3]}/>,<path key="c2" d="M360 240V360L300 300Z" fill={COLORS[2]}/>,<path key="c3" d="M360 360H240L300 300Z" fill={COLORS[1]}/>,<path key="c4" d="M240 360V240L300 300Z" fill={COLORS[0]}/>);
 if(room)room.tokens.forEach((row,p)=>row.forEach((v,t)=>{let [x,y]=pos(p,t);s.push(<g key={`t${p}${t}`} onClick={()=>p===me?.seat&&valid(t)&&act('move',t)} style={{cursor:p===me?.seat&&valid(t)?'pointer':'default'}}><circle cx={x} cy={y} r="12" fill={COLORS[p]} stroke={p===me?.seat&&valid(t)?'#111':'white'} strokeWidth={p===me?.seat&&valid(t)?4:2}/><text x={x} y={y+4} textAnchor="middle" fontSize="10" fill={p===2?'#333':'white'}>{t+1}</text></g>)}));
 return s}
 const nameInput=<label>Your player name<input value={name} maxLength="24" autoFocus placeholder="Enter your name" onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&name.trim()&&!busy&&(inviteCode?join():create())}/></label>;
 if(!room&&inviteCode)return <main className="shell"><h1>🎲 Online Ludo</h1><p>You've been invited to room <b>{inviteCode.toUpperCase()}</b>. Enter your name to join.</p>{nameInput}<button disabled={busy||!name.trim()} onClick={join}>Join room {inviteCode.toUpperCase()}</button>{!name.trim()&&<p className="muted">Please enter your name first.</p>}{error&&<p className="error">{error}</p>}<hr/><button className="secondary" onClick={()=>{history.replaceState({},'',location.pathname);location.reload()}}>Create my own room instead</button></main>;
 if(!room)return <main className="shell"><h1>🎲 Online Ludo</h1><p>Play classic Ludo with up to four friends on different phones.</p>{nameInput}<button disabled={busy||!name.trim()} onClick={create}>Create a room</button><hr/><label>Room code<input value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} placeholder="Enter invite code"/></label><button disabled={busy||!roomCode.trim()||!name.trim()} onClick={join}>Join room</button>{error&&<p className="error">{error}</p>}</main>;
 const invite=`${location.origin}${location.pathname}?room=${room.code}`;
 return <main className="shell"><header><h1>🎲 Online Ludo</h1><div className="code">Room: <b>{room.code}</b> <button className="small" onClick={()=>navigator.clipboard.writeText(invite)}>Copy invite link</button></div></header>
 <div className="players">{room.players.map(p=><div className={room.turn===p.seat?'player active':'player'} key={p.id}><span style={{color:COLORS[p.seat]}}>●</span> {p.name}{p.id===playerId?' (You)':''}</div>)}</div>
 <svg viewBox="0 0 600 600" className="board">{board()}</svg>
 <section className="controls"><div><div className="dice">{room.dice?['','⚀','⚁','⚂','⚃','⚄','⚅'][room.dice]:'🎲'}</div><b>{room.finished?`${room.players.find(p=>p.id===room.winner)?.name||'Player'} wins!`:room.players[room.turn]?.name+"'s turn"}</b><p>{room.players.length}/4 players joined</p></div><button disabled={!myTurn||room.rolled||room.finished||busy} onClick={()=>act('roll')}>Roll dice</button></section>
 <p className="muted">{!me?'You are not a member of this room.':myTurn?(room.rolled?'Tap one of your highlighted tokens to move.':'Roll the dice to play.'):'Waiting for your turn…'}</p>
 {error&&<p className="error">{error}</p>}<button className="secondary" onClick={()=>navigator.clipboard.writeText(invite)}>Share invite link</button></main>;
}
export default App;
