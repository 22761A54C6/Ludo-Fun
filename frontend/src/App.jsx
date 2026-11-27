import React,{useEffect,useRef,useState} from 'react';
import {Client} from '@stomp/stompjs';
import {sfx,unlockAudio,isMuted,setMuted,vibrate} from './sfx.js';
const API=import.meta.env.VITE_API_URL||'http://localhost:8080';
const WS=import.meta.env.VITE_WS_URL||'http://localhost:8080/ws';
const COLORS=['#df3939','#229d55','#e7bb28','#3284dc'];
const NAMES=['Red','Green','Yellow','Blue'];
const PATH=[[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
const LANES=[[[7,1],[7,2],[7,3],[7,4],[7,5]],[[1,7],[2,7],[3,7],[4,7],[5,7]],[[7,13],[7,12],[7,11],[7,10],[7,9]],[[13,7],[12,7],[11,7],[10,7],[9,7]]];
const BASE=[[[1.5,1.5],[4.5,1.5],[1.5,4.5],[4.5,4.5]],[[1.5,10.5],[4.5,10.5],[1.5,13.5],[4.5,13.5]],[[10.5,10.5],[13.5,10.5],[10.5,13.5],[13.5,13.5]],[[10.5,1.5],[13.5,1.5],[10.5,4.5],[13.5,4.5]]];
const safe=[0,8,13,21,26,34,39,47];
const STEP_MS=170, DICE_MS=650;
const PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const copy=t=>t.map(r=>[...r]);

// board coordinates (SVG units) of token t of player p at progress v
function cellXY(p,v,t){
 if(v<0){const [r,c]=BASE[p][t];return[c*40+20,r*40+20]}
 if(v<=51){const [r,c]=PATH[(p*13+v)%52];return[c*40+20,r*40+20]}
 if(v<=56){const [r,c]=LANES[p][v-52];return[c*40+20,r*40+20]}
 return[300,300];
}

function Dice({value,rolling,color,ready,onRoll}){
 const [face,setFace]=useState(value||1);
 useEffect(()=>{
  if(!rolling){if(value)setFace(value);return}
  const id=setInterval(()=>setFace(1+Math.floor(Math.random()*6)),70);
  return()=>clearInterval(id);
 },[rolling,value]);
 return <button className={`dice3d${rolling?' rolling':''}${ready?' ready':''}`} style={{'--c':color}} disabled={!ready} onClick={onRoll} aria-label={ready?'Roll dice':`Dice shows ${value||'nothing yet'}`}>
  {Array.from({length:9},(_,i)=><span key={i} className={PIPS[face].includes(i)?'pip on':'pip'}/>)}
 </button>;
}

function Confetti({onDone}){
 const [bits]=useState(()=>Array.from({length:90},(_,i)=>({i,left:Math.random()*100,delay:Math.random()*1.2,dur:2.2+Math.random()*1.8,color:COLORS[i%4],rot:Math.random()*360,w:6+Math.random()*6})));
 useEffect(()=>{const id=setTimeout(onDone,5000);return()=>clearTimeout(id)},[]);
 return <div className="confetti" onClick={onDone}>{bits.map(b=><i key={b.i} style={{left:b.left+'%',animationDelay:b.delay+'s',animationDuration:b.dur+'s',background:b.color,width:b.w,height:b.w*1.6,'--r':b.rot+'deg'}}/>)}</div>;
}

function App(){
 const inviteCode=new URLSearchParams(location.search).get('room')||'';
 const [name,setName]=useState(()=>localStorage.getItem('ludo-name')||'');const [roomCode,setRoomCode]=useState(inviteCode);
 const [room,setRoom]=useState(null);const [playerId]=useState(()=>sessionStorage.getItem('ludo-player')||crypto.randomUUID());
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 // effects / animation state
 const [view,setView]=useState(null);          // token positions currently drawn
 const [hop,setHop]=useState(null);            // {p,t,n} token hopping right now
 const [flying,setFlying]=useState([]);        // captured tokens flying home
 const [bursts,setBursts]=useState([]);        // capture explosions
 const [shake,setShake]=useState(false);
 const [rolling,setRolling]=useState(false);
 const [toast,setToast]=useState(null);
 const [confetti,setConfetti]=useState(false);
 const [muted,setMutedUI]=useState(isMuted());
 const prevRef=useRef(null);const timers=useRef([]);
 const later=(fn,ms)=>{timers.current.push(setTimeout(fn,ms))};
 const say=msg=>{const id=Date.now()+Math.random();setToast({msg,id});later(()=>setToast(t=>t?.id===id?null:t),2000)};

 // sessionStorage: each tab/device is its own player, but a refresh keeps the same seat
 useEffect(()=>sessionStorage.setItem('ludo-player',playerId),[playerId]);
 useEffect(()=>{if(name.trim())localStorage.setItem('ludo-name',name.trim())},[name]);
 useEffect(()=>{const u=()=>unlockAudio();window.addEventListener('pointerdown',u);return()=>{window.removeEventListener('pointerdown',u);timers.current.forEach(clearTimeout)}},[]);
 useEffect(()=>{if(!room?.code)return;const client=new Client({brokerURL:WS,reconnectDelay:3000,onConnect:()=>client.subscribe(`/topic/rooms/${room.code}`,m=>setRoom(JSON.parse(m.body))),onStompError:f=>setError(f.headers.message||'Connection error')});client.activate();return()=>client.deactivate()},[room?.code]);

 // Compare each new room state with the previous one and play the matching effects.
 useEffect(()=>{
  if(!room)return;
  const prev=prevRef.current;prevRef.current=room;
  if(!prev||prev.code!==room.code){setView(copy(room.tokens));return}
  const nameOf=s=>room.players[s]?.name||NAMES[s];
  const mySeat=room.players.find(p=>p.id===playerId)?.seat;
  const tokensChanged=JSON.stringify(room.tokens)!==JSON.stringify(prev.tokens);
  const rolledNow=(room.rolls??0)!==(prev.rolls??0)||(room.rolled&&!prev.rolled);
  let turnDelay=0;

  if(rolledNow){
   sfx.dice();setRolling(true);turnDelay=DICE_MS+150;
   later(()=>{
    setRolling(false);
    if(room.dice===6){sfx.six();say(`${nameOf(prev.turn)} rolled a 6! 🎉`)}
    else if(!room.rolled&&room.turn!==prev.turn)say(`${nameOf(prev.turn)} rolled ${room.dice} — no moves`);
   },DICE_MS);
  }

  if(tokensChanged){
   let mover=null;const caps=[];
   room.tokens.forEach((row,p)=>row.forEach((n,t)=>{const o=prev.tokens[p][t];
    if(n>o)mover={p,t,from:o,to:n};else if(n<0&&o>=0)caps.push({p,t,from:o});}));
   if(!mover){setView(copy(room.tokens))}
   else{
    const start=copy(room.tokens);start[mover.p][mover.t]=mover.from;caps.forEach(c=>start[c.p][c.t]=c.from);setView(start);
    const steps=[];if(mover.from<0)steps.push(0);else for(let v=mover.from+1;v<=mover.to;v++)steps.push(v);
    if(mover.from<0)sfx.out();
    steps.forEach((s,i)=>later(()=>{
     setView(cur=>{const n=copy(cur||room.tokens);n[mover.p][mover.t]=s;return n});
     setHop({p:mover.p,t:mover.t,n:i});
     if(mover.from>=0)sfx.step(i);
    },i*STEP_MS));
    const end=steps.length*STEP_MS;turnDelay=end+(caps.length?500:100);
    later(()=>{
     setHop(null);
     if(caps.length){
      sfx.kill();vibrate([70,40,140]);setShake(true);later(()=>setShake(false),450);
      const [x,y]=cellXY(mover.p,mover.to,mover.t);const id=Date.now();
      setBursts(b=>[...b,{id,x,y,color:COLORS[mover.p]}]);later(()=>setBursts(b=>b.filter(z=>z.id!==id)),900);
      setFlying(caps.map(c=>`${c.p}-${c.t}`));later(()=>setFlying([]),800);
      say(`💥 ${nameOf(mover.p)} captured ${nameOf(caps[0].p)}!`);
     }
     if(mover.to===57){sfx.home();if(!room.finished)say(`🏠 ${nameOf(mover.p)} got a token home!`)}
     setView(copy(room.tokens));
     if(room.finished&&!prev.finished)later(()=>{sfx.win();vibrate([100,60,100,60,200]);setConfetti(true)},450);
    },end);
   }
  }

  if(room.turn!==prev.turn&&room.turn===mySeat&&!room.finished)later(()=>{sfx.turn();vibrate(40);say('Your turn!')},turnDelay);
 },[room]);

 async function request(path,body){setBusy(true);setError('');try{let r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');setRoom(data);return data}catch(e){setError(e.message);return null}finally{setBusy(false)}}
 async function create(){let r=await request('/api/rooms',{playerId,name});if(r){setRoomCode(r.code);history.replaceState({},'',`?room=${r.code}`)}}
 async function join(){let r=await request(`/api/rooms/${roomCode.toUpperCase()}/join`,{playerId,name});if(r){setRoomCode(r.code);history.replaceState({},'',`?room=${r.code}`)}}
 const me=room?.players.find(p=>p.id===playerId);const myTurn=!!me&&room.turn===me.seat;
 const animating=rolling||!!hop;
 async function act(action,token){await request(`/api/rooms/${room.code}/${action}`,action==='move'?{playerId,token}:{playerId,name})}
 function valid(t){let v=room.tokens[me.seat][t];return room.rolled&&(v<0?room.dice===6:v!==57&&v+room.dice<=57)}

 function board(){let s=[];s.push(<rect key="bg" width="600" height="600" fill="white"/>);[[0,0],[0,9],[9,9],[9,0]].forEach(([r,c],p)=>{s.push(<rect key={'a'+p} x={c*40} y={r*40} width="240" height="240" fill={COLORS[p]} stroke="#333" strokeWidth="2"/>);s.push(<rect key={'b'+p} x={c*40+40} y={r*40+40} width="160" height="160" rx="8" fill="white" stroke={COLORS[p]} strokeWidth="3"/>);BASE[p].forEach(([rr,cc],t)=>s.push(<circle key={`base${p}${t}`} cx={cc*40+20} cy={rr*40+20} r="23" fill="#f4f4f4" stroke={COLORS[p]} strokeWidth="3"/>))});
 PATH.forEach(([r,c],i)=>{let p=[0,13,26,39].indexOf(i);s.push(<rect key={'p'+i} x={c*40} y={r*40} width="40" height="40" fill={p>=0?COLORS[p]:'#fff'} stroke="#777"/>);if(safe.includes(i))s.push(<text key={'s'+i} x={c*40+20} y={r*40+27} textAnchor="middle" fontSize="22" fill="#c99b20">★</text>)});
 LANES.forEach((lane,p)=>lane.forEach(([r,c],i)=>s.push(<rect key={`l${p}${i}`} x={c*40} y={r*40} width="40" height="40" fill={COLORS[p]} stroke="#777"/>)));
 s.push(<path key="c1" d="M240 240H360L300 300Z" fill={COLORS[3]}/>,<path key="c2" d="M360 240V360L300 300Z" fill={COLORS[2]}/>,<path key="c3" d="M360 360H240L300 300Z" fill={COLORS[1]}/>,<path key="c4" d="M240 360V240L300 300Z" fill={COLORS[0]}/>);
 return s}

 function tokens(){
  const tk=view||room.tokens;const groups={};
  tk.forEach((row,p)=>row.forEach((v,t)=>{const [x,y]=cellXY(p,v,t);const k=v<0?`b${p}${t}`:`${x},${y}`;(groups[k]=groups[k]||[]).push({p,t,x,y})}));
  const OFF=[[-7,-7],[7,-7],[-7,7],[7,7]];const list=[];
  Object.values(groups).forEach(g=>g.forEach((o,i)=>{const n=g.length;const [dx,dy]=n>1?OFF[i%4]:[0,0];list.push({...o,x:o.x+dx,y:o.y+dy,r:n>1?10:13})}));
  // the hopping token is drawn last so it is on top
  list.sort((a,b)=>(hop&&a.p===hop.p&&a.t===hop.t)-(hop&&b.p===hop.p&&b.t===hop.t));
  return list.map(({p,t,x,y,r})=>{
   const can=!animating&&p===me?.seat&&myTurn&&valid(t);
   const hopping=hop&&hop.p===p&&hop.t===t;const fly=flying.includes(`${p}-${t}`);
   return <g key={`t${p}${t}`} className="tok" onClick={()=>can&&act('move',t)}
    style={{transform:`translate(${x}px,${y}px)`,transition:fly?'transform .7s cubic-bezier(.4,-0.5,.5,1.3)':`transform ${STEP_MS-30}ms ease-out`,cursor:can?'pointer':'default'}}>
    <g key={hopping?'h'+hop.n:'s'} className={hopping?'hop':fly?'spin':''}>
     {can&&<circle r="19" className="ring" fill="none" stroke="#111" strokeWidth="3"/>}
     <ellipse cy={r*.75} rx={r*.85} ry={r*.3} fill="rgba(0,0,0,.28)"/>
     <circle r={r} fill={COLORS[p]} stroke="white" strokeWidth="2.5"/>
     <circle r={r*.45} fill="white" opacity=".85"/>
     <circle cx={-r*.4} cy={-r*.45} r={r*.22} fill="white" opacity=".5"/>
    </g>
   </g>;
  });
 }

 function effects(){
  return bursts.map(b=><g key={b.id} transform={`translate(${b.x} ${b.y})`} pointerEvents="none">
   <circle r="12" className="shock" fill="none" stroke={b.color} strokeWidth="4"/>
   {Array.from({length:14},(_,i)=>{const a=i/14*Math.PI*2,d=34+(i%3)*12;return <circle key={i} r={i%2?3:4.5} className="spark" fill={i%3?b.color:'#ffd23f'} style={{'--dx':`${Math.cos(a)*d}px`,'--dy':`${Math.sin(a)*d}px`}}/>})}
   <text className="pow" y="6" textAnchor="middle" fontSize="22">💥</text>
  </g>);
 }

 const nameInput=<label>Your player name<input value={name} maxLength="24" autoFocus placeholder="Enter your name" onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&name.trim()&&!busy&&(inviteCode?join():create())}/></label>;
 if(!room&&inviteCode)return <main className="shell"><h1>🎲 Online Ludo</h1><p>You've been invited to room <b>{inviteCode.toUpperCase()}</b>. Enter your name to join.</p>{nameInput}<button disabled={busy||!name.trim()} onClick={join}>Join room {inviteCode.toUpperCase()}</button>{!name.trim()&&<p className="muted">Please enter your name first.</p>}{error&&<p className="error">{error}</p>}<hr/><button className="secondary" onClick={()=>{history.replaceState({},'',location.pathname);location.reload()}}>Create my own room instead</button></main>;
 if(!room)return <main className="shell"><h1>🎲 Online Ludo</h1><p>Play classic Ludo with up to four friends on different phones.</p>{nameInput}<button disabled={busy||!name.trim()} onClick={create}>Create a room</button><hr/><label>Room code<input value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} placeholder="Enter invite code"/></label><button disabled={busy||!roomCode.trim()||!name.trim()} onClick={join}>Join room</button>{error&&<p className="error">{error}</p>}</main>;

 const invite=`${location.origin}${location.pathname}?room=${room.code}`;
 const turnColor=COLORS[room.turn]||'#2767b2';
 const winnerName=room.players.find(p=>p.id===room.winner)?.name||'Player';
 return <main className="shell">
  <header><h1>🎲 Online Ludo</h1><div className="code">Room: <b>{room.code}</b> <button className="small" onClick={()=>navigator.clipboard.writeText(invite)}>Copy invite link</button><button className="small" aria-label={muted?'Unmute sounds':'Mute sounds'} onClick={()=>{setMuted(!muted);setMutedUI(!muted)}}>{muted?'🔇':'🔊'}</button></div></header>
  <div className="players">{room.players.map(p=><div className={room.turn===p.seat&&!room.finished?'player active':'player'} style={{'--c':COLORS[p.seat]}} key={p.id}><span style={{color:COLORS[p.seat]}}>●</span> {p.name}{p.id===playerId?' (You)':''}</div>)}</div>
  <div className="boardwrap">
   <svg viewBox="0 0 600 600" className={shake?'board shake':'board'}>{board()}{tokens()}{effects()}</svg>
   {toast&&<div key={toast.id} className="toast">{toast.msg}</div>}
  </div>
  <section className="controls" style={{'--c':turnColor}}>
   <Dice value={room.dice} rolling={rolling} color={turnColor} ready={myTurn&&!room.rolled&&!room.finished&&!busy&&!animating} onRoll={()=>act('roll')}/>
   <div className="status"><b>{room.finished?`🏆 ${winnerName} wins!`:room.players[room.turn]?.name+"'s turn"}</b><p>{room.players.length}/4 players joined</p></div>
   <button disabled={!myTurn||room.rolled||room.finished||busy||animating} onClick={()=>act('roll')}>Roll dice</button>
  </section>
  <p className="muted">{!me?'You are not a member of this room.':room.finished?'Game over!':myTurn?(room.rolled?'Tap one of your glowing tokens to move.':'Tap the dice to roll.'):'Waiting for your turn…'}</p>
  {error&&<p className="error">{error}</p>}<button className="secondary" onClick={()=>navigator.clipboard.writeText(invite)}>Share invite link</button>
  {confetti&&<Confetti onDone={()=>setConfetti(false)}/>}
 </main>;
}
export default App;
