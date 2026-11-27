import React,{useEffect,useRef,useState} from 'react';
import {Client} from '@stomp/stompjs';
import {sfx,unlockAudio,isMuted,setMuted,vibrate} from './sfx.js';
import {TIERS,tierOf,MedalDefs,Medal,ResultOverlay,ResultsPanel} from './Results.jsx';
import {startRecording,voiceSupported} from './voice.js';
const API=import.meta.env.VITE_API_URL||'http://localhost:8080';
const WS=import.meta.env.VITE_WS_URL||'http://localhost:8080/ws';
const COLORS=['#df3939','#229d55','#e7bb28','#3284dc'];
const NAMES=['Red','Green','Yellow','Blue'];
const LIGHT=[{hi:'#f37171',dark:'#b52424',soft:'#fde3e3'},{hi:'#45c47a',dark:'#15773e',soft:'#dcf4e6'},{hi:'#f8d75e',dark:'#bf950f',soft:'#fcf3d2'},{hi:'#63a8f0',dark:'#1c5ea8',soft:'#deebfb'}];
const PATH=[[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
const LANES=[[[7,1],[7,2],[7,3],[7,4],[7,5]],[[1,7],[2,7],[3,7],[4,7],[5,7]],[[7,13],[7,12],[7,11],[7,10],[7,9]],[[13,7],[12,7],[11,7],[10,7],[9,7]]];
const BASE=[[[1.3,1.3],[3.7,1.3],[1.3,3.7],[3.7,3.7]],[[1.3,10.3],[3.7,10.3],[1.3,12.7],[3.7,12.7]],[[10.3,10.3],[12.7,10.3],[10.3,12.7],[12.7,12.7]],[[10.3,1.3],[12.7,1.3],[10.3,3.7],[12.7,3.7]]];
const safe=[0,8,13,21,26,34,39,47];
const STEP_MS=170, DICE_MS=650;
const PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const copy=t=>t.map(r=>[...r]);

// board coordinates (SVG units) of token t of player p at progress v
function cellXY(p,v,t){
 if(v<0){const [r,c]=BASE[p][t];return[c*40+20,r*40+20]}
 if(v<=51){const [r,c]=PATH[(p*13+v)%52];return[c*40+20,r*40+20]}
 if(v<=56){const [r,c]=LANES[p][v-52];return[c*40+20,r*40+20]}
 // finished: sit inside the player's own home triangle
 return [[262,300],[300,262],[338,300],[300,338]][p];
}

// top-left corner (SVG units) of each player's base square
const BASE_AREA=[[0,0],[360,0],[360,360],[0,360]];

// SVG dice drawn inside a player's base
function Dice({x,y,size=58,value,rolling,color,ready,faded,onRoll,bare=false}){
 const [face,setFace]=useState(value||1);
 useEffect(()=>{
  if(!rolling){if(value)setFace(value);return}
  const id=setInterval(()=>setFace(1+Math.floor(Math.random()*6)),70);
  return()=>clearInterval(id);
 },[rolling,value]);
 const h=size/2,o=size*.27;
 const roll=()=>ready&&onRoll();
 return <g transform={`translate(${x} ${y})`}>
  {!bare&&<><circle r={h+11} fill="white" stroke={color} strokeWidth="4" opacity=".95"/>
  <circle r={h+11} fill="none" stroke={color} strokeWidth="8" opacity=".18"/></>}
  <g className={`sdice${rolling?' rolling':''}${ready?' ready':''}`} opacity={faded&&!rolling?.82:1}
   role="button" tabIndex={ready?0:-1} aria-label={ready?'Roll dice':`Dice shows ${value||'nothing yet'}`}
   onClick={roll} onKeyDown={e=>(e.key==='Enter'||e.key===' ')&&(e.preventDefault(),roll())} style={{cursor:ready?'pointer':'default'}}>
   <rect x={-h+2} y={-h+8} width={size} height={size} rx="14" fill="rgba(0,0,0,.3)"/>
   <rect x={-h} y={-h+4} width={size} height={size} rx="14" fill="#bdbdbd"/>
   <rect x={-h} y={-h} width={size} height={size} rx="14" fill="url(#diceFace)" stroke="#9e9e9e" strokeWidth="1.5"/>
   <rect x={-h+5} y={-h+4} width={size-10} height={size*.35} rx="10" fill="white" opacity=".55"/>
   {Array.from({length:9},(_,i)=>PIPS[face].includes(i)&&<circle key={i} cx={(i%3-1)*o} cy={(Math.floor(i/3)-1)*o} r={size*.09} fill={face===1?'#d62828':'url(#pip)'}/>)}
  </g>
 </g>;
}

const CONFETTI={gold:['#f2c230','#fff4b0','#d62839','#1d4ed8','#ffffff'],silver:['#c3cad3','#ffffff','#1d4ed8','#9aa4b1'],bronze:['#cd7f32','#ffd9b5','#15803d','#f59e0b']};
function Confetti({onDone,tier='gold'}){
 const pal=CONFETTI[tier]||COLORS;
 const [bits]=useState(()=>Array.from({length:tier==='gold'?140:90},(_,i)=>({i,left:Math.random()*100,delay:Math.random()*1.2,dur:2.2+Math.random()*1.8,color:pal[i%pal.length],rot:Math.random()*360,w:6+Math.random()*6})));
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
 const [diceSeat,setDiceSeat]=useState(null);  // keeps the dice at the roller's base while effects play
 const [toast,setToast]=useState(null);
 const [confetti,setConfetti]=useState(null);      // tier of confetti burst
 const [overlay,setOverlay]=useState(null);        // {tier,name} your own result
 const [showResults,setShowResults]=useState(false);
 const [muted,setMutedUI]=useState(isMuted());
 const [voiceOn,setVoiceOn]=useState(false);       // server has a Gemini key
 const [mic,setMic]=useState('idle');              // idle | listening | thinking
 const recRef=useRef(null);
 useEffect(()=>{if(!voiceSupported())return;fetch(`${API}/api/rooms/voice/status`).then(r=>r.json()).then(d=>setVoiceOn(!!d.enabled)).catch(()=>{})},[]);
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
  let turnDelay=0,fxDelay=0;

  if(rolledNow){
   const passed=!room.rolled&&room.turn!==prev.turn;
   sfx.dice();setRolling(true);setDiceSeat(prev.turn);
   turnDelay=passed?DICE_MS+900:DICE_MS+150;
   later(()=>{
    setRolling(false);
    if(room.dice===6){sfx.six();say(`${nameOf(prev.turn)} rolled a 6! 🎉`)}
    else if(passed)say(`${nameOf(prev.turn)} rolled ${room.dice} — no moves`);
   },DICE_MS);
   // let everyone see the result before the dice moves to the next player
   later(()=>setDiceSeat(null),passed?DICE_MS+900:DICE_MS);
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
    setDiceSeat(mover.p);
    steps.forEach((s,i)=>later(()=>{
     setView(cur=>{const n=copy(cur||room.tokens);n[mover.p][mover.t]=s;return n});
     setHop({p:mover.p,t:mover.t,n:i});
     if(mover.from>=0)sfx.step(i);
    },i*STEP_MS));
    const end=steps.length*STEP_MS;turnDelay=end+(caps.length?500:100);fxDelay=end+(caps.length?700:250);
    later(()=>{
     setHop(null);
     if(caps.length){
      sfx.kill();vibrate([70,40,140]);setShake(true);later(()=>setShake(false),450);
      const [x,y]=cellXY(mover.p,mover.to,mover.t);const id=Date.now();
      setBursts(b=>[...b,{id,x,y,color:COLORS[mover.p]}]);later(()=>setBursts(b=>b.filter(z=>z.id!==id)),900);
      setFlying(caps.map(c=>`${c.p}-${c.t}`));later(()=>setFlying([]),800);
      say(`💥 ${nameOf(mover.p)} captured ${nameOf(caps[0].p)}!`);
     }
     if(mover.to===57){sfx.home();if((room.ranking||[]).length===(prev.ranking||[]).length)say(`🏠 ${nameOf(mover.p)} got a token home!`)}
     setView(copy(room.tokens));
     later(()=>setDiceSeat(null),caps.length?400:0);
    },end);
   }
  }

  // medals: someone finished (and, when the game ends, the last player lost)
  const oldRank=prev.ranking||[],newRank=room.ranking||[];
  if(prev.finished&&!room.finished){setShowResults(false);setOverlay(null);setConfetti(null)}   // new game
  else if(newRank.length>oldRank.length){
   let t=fxDelay;let mine=null;
   newRank.slice(oldRank.length).forEach(id=>{
    const tier=tierOf(room,id);const pl=room.players.find(p=>p.id===id);if(!pl||!tier)return;
    if(id===playerId){mine={tier,name:pl.name};return}
    later(()=>{if(tier!=='lost'){sfx.medal();say(`${TIERS[tier].emoji} ${pl.name} won the ${TIERS[tier].label}!`)}else say(`${pl.name} lost`)},t);t+=2100;
   });
   if(mine){
    later(()=>{
     setOverlay(mine);sfx[mine.tier]();
     if(mine.tier==='lost')vibrate([300]);else{vibrate([100,60,100,60,220]);later(()=>setConfetti(mine.tier),650)}
    },t);
    t+=mine.tier==='lost'?4300:5300;
   }
   if(room.finished)later(()=>setShowResults(true),t+300);
   turnDelay=Math.max(turnDelay,t);
  }

  // lobby: someone joined, or the host started the game
  if(!room.started&&room.players.length>prev.players.length){sfx.out();room.players.slice(prev.players.length).forEach(pl=>pl.id!==playerId&&say(`👋 ${pl.name} joined`))}
  if(room.started&&!prev.started){sfx.six();vibrate(60);later(()=>{if(room.turn===mySeat){sfx.turn();say('🎲 Game on — your turn!')}else say(`🎲 Game on! ${nameOf(room.turn)} goes first`)},300)}
  else if(room.turn!==prev.turn&&room.turn===mySeat&&!room.finished)later(()=>{sfx.turn();vibrate(40);say('Your turn!')},turnDelay);
 },[room]);

 // Auto-move: when only one move is possible (one coin can move, or every movable coin
 // is in the base so they are all the same move), make it for the player after the dice lands.
 const autoRef=useRef(null);
 const onlyMove=r=>{
  const s=r?.players.find(p=>p.id===playerId)?.seat;
  if(s==null||!r.started||r.finished||r.turn!==s||!r.rolled)return null;
  const legal=[0,1,2,3].filter(t=>{const v=r.tokens[s][t];return v<0?r.dice===6:v!==57&&v+r.dice<=57});
  const spots=new Set(legal.map(t=>r.tokens[s][t]));   // coins on the same spot make the same move
  return legal.length&&spots.size===1?legal[0]:null;
 };
 const autoToken=onlyMove(room);
 useEffect(()=>{
  if(autoToken==null||autoRef.current===room.rolls)return;
  autoRef.current=room.rolls;
  const rolls=room.rolls;
  // wait for the dice animation, then check the move is still pending before sending it
  later(()=>{const cur=prevRef.current;if(cur&&cur.rolls===rolls&&onlyMove(cur)===autoToken)act('move',autoToken)},DICE_MS+450);
 },[autoToken,room?.rolls]);

 async function request(path,body){setBusy(true);setError('');try{let r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');setRoom(data);return data}catch(e){setError(e.message);return null}finally{setBusy(false)}}
 async function create(){let r=await request('/api/rooms',{playerId,name});if(r){setRoomCode(r.code);history.replaceState({},'',`?room=${r.code}`)}}
 async function join(){let r=await request(`/api/rooms/${roomCode.toUpperCase()}/join`,{playerId,name});if(r){setRoomCode(r.code);history.replaceState({},'',`?room=${r.code}`)}}
 const me=room?.players.find(p=>p.id===playerId);const myTurn=!!me&&room.turn===me.seat;
 const animating=rolling||!!hop;
 // quarter turns (clockwise) so the viewer's own corner is drawn bottom-left
 const rotK=me?(3-me.seat+4)%4:0;
 const R=(x,y)=>{let a=x,b=y;for(let i=0;i<rotK;i++)[a,b]=[600-b,a];return[a,b]};
 // ---------- voice: record a clip, the server asks Gemini, and rolls if you said "roll" ----------
 const canVoice=me?.seat===0&&myTurn&&!room?.rolled&&!busy&&!animating&&!!room?.started;
 async function talk(){
  if(mic==='listening'){recRef.current?.stop();return}
  if(mic!=='idle'||!canVoice)return;
  let rec;
  try{rec=await startRecording(4000)}catch{setError('Microphone blocked. Allow microphone access for this site to use voice.');return}
  recRef.current=rec;setMic('listening');setError('');
  const audio=await rec.result;recRef.current=null;setMic('thinking');
  try{
   const r=await fetch(`${API}/api/rooms/${room.code}/voice`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId,audio,mimeType:'audio/wav'})});
   const data=await r.json();
   if(!r.ok)throw Error(data.error||'Voice failed');
   if(data.action==='roll'){if(data.room)setRoom(data.room)}
   else say(data.heard?`🎤 Heard “${data.heard.slice(0,30)}” — say a number 1 to 6`:'🎤 Didn’t catch that — say a number 1 to 6');
  }catch(e){setError(e.message)}
  finally{setMic('idle')}
 }
 async function act(action,token){await request(`/api/rooms/${room.code}/${action}`,action==='move'?{playerId,token}:{playerId,name})}
 function valid(t){let v=room.tokens[me.seat][t];return room.rolled&&(v<0?room.dice===6:v!==57&&v+room.dice<=57)}

 // Static board, drawn in seat-0 orientation; it is rotated as a whole so the viewer sits bottom-left.
 function board(){
  const s=[];
  // flat style: solid colours, white track, thin grid lines
  const GRID='#a7b0bb';
  s.push(<rect key="bg" width="600" height="600" fill="#ffffff"/>);
  // track cells (start cells in the owner's colour, with a direction arrow)
  PATH.forEach(([r,c],i)=>{const p=[0,13,26,39].indexOf(i);
   s.push(<rect key={'p'+i} x={c*40} y={r*40} width="40" height="40" fill={p>=0?COLORS[p]:'#ffffff'} stroke={GRID} strokeWidth="1"/>);
   if(p>=0){const [nr,nc]=PATH[i+1];const dx=nc-c,dy=nr-r;const cx=c*40+20,cy=r*40+20;
    s.push(<path key={'ar'+i} d={`M${cx-dx*10} ${cy-dy*10}L${cx+dx*10} ${cy+dy*10}M${cx+dx*10-dx*6+dy*6} ${cy+dy*10-dy*6+dx*6}L${cx+dx*10} ${cy+dy*10}L${cx+dx*10-dx*6-dy*6} ${cy+dy*10-dy*6-dx*6}`} fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>)}
  });
  // home lanes
  LANES.forEach((lane,p)=>lane.forEach(([r,c],i)=>s.push(<rect key={`l${p}${i}`} x={c*40} y={r*40} width="40" height="40" fill={COLORS[p]} stroke={GRID} strokeWidth="1"/>)));
  // bases: solid colour, white yard, four coloured spots
  BASE_AREA.forEach(([x,y],p)=>{
   s.push(<rect key={'a'+p} x={x} y={y} width="240" height="240" fill={COLORS[p]}/>);
   s.push(<rect key={'b'+p} x={x+40} y={y+40} width="160" height="160" rx="6" fill="#ffffff" stroke="rgba(0,0,0,.12)" strokeWidth="1.5"/>);
   BASE[p].forEach(([rr,cc],t)=>s.push(<circle key={`base${p}${t}`} cx={cc*40+20} cy={rr*40+20} r="20" fill={COLORS[p]}/>));
  });
  // centre home: each triangle points from its own home lane
  s.push(<path key="c0" d="M240 240V360L300 300Z" fill={COLORS[0]}/>,<path key="c1" d="M240 240H360L300 300Z" fill={COLORS[1]}/>,
   <path key="c2" d="M360 240V360L300 300Z" fill={COLORS[2]}/>,<path key="c3" d="M360 360H240L300 300Z" fill={COLORS[3]}/>,
   <rect key="cf" x="240" y="240" width="120" height="120" fill="none" stroke={GRID} strokeWidth="1"/>,
   <rect key="frame" x="0.75" y="0.75" width="598.5" height="598.5" fill="none" stroke="#6b7684" strokeWidth="1.5"/>);
  return s;
 }

 function tokens(){
  const tk=view||room.tokens;const groups={};
  tk.forEach((row,p)=>row.forEach((v,t)=>{const [x,y]=R(...cellXY(p,v,t));const k=v<0?`b${p}${t}`:`${x},${y}`;(groups[k]=groups[k]||[]).push({p,t,x,y})}));
  const OFF=[[-7,-7],[7,-7],[-7,7],[7,7]];const list=[];
  Object.values(groups).forEach(g=>g.forEach((o,i)=>{const n=g.length;const [dx,dy]=n>1?OFF[i%4]:[0,0];list.push({...o,x:o.x+dx,y:o.y+dy,r:n>1?10.5:14})}));
  // the hopping token is drawn last so it is on top
  list.sort((a,b)=>(hop&&a.p===hop.p&&a.t===hop.t)-(hop&&b.p===hop.p&&b.t===hop.t));
  return list.map(({p,t,x,y,r})=>{
   const can=!animating&&p===me?.seat&&myTurn&&valid(t);
   const hopping=hop&&hop.p===p&&hop.t===t;const fly=flying.includes(`${p}-${t}`);
   return <g key={`t${p}${t}`} className="tok" onClick={()=>can&&act('move',t)}
    style={{transform:`translate(${x}px,${y}px)`,transition:fly?'transform .7s cubic-bezier(.4,-0.5,.5,1.3)':`transform ${STEP_MS-30}ms ease-out`,cursor:can?'pointer':'default'}}>
    <g key={hopping?'h'+hop.n:'s'} className={hopping?'hop':fly?'spin':''}>
     {can&&<circle r="19" className="ring" fill="none" stroke="#111" strokeWidth="3"/>}
     <ellipse cy={r*.8} rx={r*.95} ry={r*.32} fill="rgba(0,0,0,.3)"/>
     <circle cy="2.5" r={r} fill={LIGHT[p].dark}/>
     <circle r={r} fill={`url(#g${p})`} stroke="white" strokeWidth="2.5"/>
     <circle r={r*.5} fill="white" opacity=".9"/>
     <circle r={r*.28} fill={COLORS[p]}/>
     <ellipse cx={-r*.35} cy={-r*.5} rx={r*.32} ry={r*.18} fill="white" opacity=".55"/>
    </g>
   </g>;
  });
 }

 // glow on the active player's base (names live in the corner panels)
 function seats(){
  const active=diceSeat??room.turn;
  return [0,1,2,3].map(s=>{
   const pl=room.players[s];const [cx,cy]=R(BASE_AREA[s][0]+120,BASE_AREA[s][1]+120);const x=cx-120,y=cy-120;
   const tier=pl&&tierOf(room,pl.id);
   if(room.finished||s!==active||!pl||tier)return null;
   return <rect key={'seat'+s} pointerEvents="none" x={x+20} y={y+20} width="200" height="200" rx="12" className="baseglow" fill="none" stroke="white" strokeWidth="5"/>;
  });
 }

 // which screen corner each seat's base is drawn in, after the board is rotated for this viewer
 const cornerOf=s=>{const [cx,cy]=R(BASE_AREA[s][0]+120,BASE_AREA[s][1]+120);return (cy<300?'t':'b')+(cx<300?'l':'r')};

 function medals(){
  return room.players.map(pl=>{
   const tier=tierOf(room,pl.id);if(!tier)return null;
   const [cx,cy]=R(BASE_AREA[pl.seat][0]+120,BASE_AREA[pl.seat][1]+120);
   return <g key={'medal'+pl.id} pointerEvents="none" className="basemedal">
    <rect x={cx-82} y={cy-82} width="164" height="164" rx="22" fill={tier==='lost'?'rgba(70,70,80,.45)':'rgba(255,253,248,.82)'}/>
    <g transform={`translate(${cx} ${cy+(tier==='lost'?0:22)})`}><Medal tier={tier} size={tier==='lost'?62:72} uid={'b'+pl.seat}/></g>
   </g>;
  });
 }

 function stars(){
  return safe.filter(i=>i%13!==0).map(i=>{const [r,c]=PATH[i];const [x,y]=R(c*40+20,r*40+20);
   return <path key={'st'+i} transform={`translate(${x} ${y})`} d='M0 -13L3.8 -4.2L13.2 -4L5.6 2L8.2 11.2L0 5.8L-8.2 11.2L-5.6 2L-13.2 -4L-3.8 -4.2Z' fill='none' stroke='#7c8794' strokeWidth='1.6' strokeLinejoin='round' pointerEvents='none'/>});
 }

 function effects(){
  return bursts.map(b=>{const [bx,by]=R(b.x,b.y);return <g key={b.id} transform={`translate(${bx} ${by})`} pointerEvents="none">
   <circle r="12" className="shock" fill="none" stroke={b.color} strokeWidth="4"/>
   {Array.from({length:14},(_,i)=>{const a=i/14*Math.PI*2,d=34+(i%3)*12;return <circle key={i} r={i%2?3:4.5} className="spark" fill={i%3?b.color:'#ffd23f'} style={{'--dx':`${Math.cos(a)*d}px`,'--dy':`${Math.sin(a)*d}px`}}/>})}
   <text className="pow" y="6" textAnchor="middle" fontSize="22">💥</text>
  </g>});
 }

 const brand=<div className="brand"><Logo/><span>Ludo <b>Online</b></span></div>;
 const errorBar=error&&<p className="error" role="alert">{error}</p>;
 const nameInput=<label className="field"><span>Your name</span><input value={name} maxLength="24" autoFocus placeholder="e.g. Asha" onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&name.trim()&&!busy&&(inviteCode?join():create())}/></label>;

 // ---------- home / invite screens ----------
 if(!room)return <main className="shell home">
  <div className="hero"><Logo size={64}/><h1>Ludo Online</h1><p>Classic Ludo for up to four friends, each on their own phone.</p></div>
  {inviteCode?<section className="card form">
   <div className="card-head"><h2>You're invited</h2><span className="chip">Room {inviteCode.toUpperCase()}</span></div>
   {nameInput}
   <button className="btn primary lg" disabled={busy||!name.trim()} onClick={join}>Join game</button>
   {errorBar}
   <button className="btn ghost" onClick={()=>{history.replaceState({},'',location.pathname);location.reload()}}>Create my own room instead</button>
  </section>:<section className="card form">
   {nameInput}
   <button className="btn primary lg" disabled={busy||!name.trim()} onClick={create}>Create a room</button>
   <div className="divider"><span>or join a friend</span></div>
   <div className="joinrow">
    <input aria-label="Room code" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} placeholder="Room code" maxLength="8"/>
    <button className="btn secondary" disabled={busy||!roomCode.trim()||!name.trim()} onClick={join}>Join</button>
   </div>
   {errorBar}
  </section>}
 </main>;

 const invite=`${location.origin}${location.pathname}?room=${room.code}`;
 const shareText=`🎲 Join my Ludo game! Room code: ${room.code}`;
 // invites are only offered in the lobby, while a seat is still free
 const canInvite=!room.started&&room.players.length<4;
 async function copyLink(){
  try{await navigator.clipboard.writeText(invite)}
  catch{const ta=document.createElement('textarea');ta.value=invite;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove()}
  say('🔗 Link copied');
 }
 async function shareLink(){
  // native share sheet: lists WhatsApp, Instagram, Telegram, SMS… on phones
  if(navigator.share){try{await navigator.share({title:'Ludo Online',text:shareText,url:invite});return}catch(e){if(e.name==='AbortError')return}}
  copyLink();
 }
 const whatsapp=`https://wa.me/?text=${encodeURIComponent(shareText+" "+invite)}`;
 const muteBtn=<button className="iconbtn" aria-label={muted?'Unmute sounds':'Mute sounds'} title={muted?'Unmute':'Mute'} onClick={()=>{setMuted(!muted);setMutedUI(!muted)}}>{muted?<Icon.mute/>:<Icon.sound/>}</button>;
 const topbar=<header className="topbar">{brand}<div className="topbar-right"><span className="chip">Room <b>{room.code}</b></span>{muteBtn}</div></header>;
 const initial=n=>(n||'?').trim().charAt(0).toUpperCase()||'?';

 // ---------- waiting room: everyone gathers here until the host taps Start ----------
 if(!room.started){
  const host=room.players[0];const isHost=me?.seat===0;const enough=room.players.length>=2;
  return <main className="shell">
   {topbar}
   <section className="card lobby">
    <div className="card-head"><h2>Waiting room</h2><span className="muted">{room.players.length} of 4 joined</span></div>
    <ul className="lobby-seats">
     {[0,1,2,3].map(s=>{const pl=room.players[s];return <li key={s} className={pl?'filled':'empty'} style={{'--c':COLORS[s]}}>
      <span className="avatar">{pl?initial(pl.name):''}</span>
      <span className="lobby-text">
       <span className="lobby-name">{pl?pl.name:'Open seat'}</span>
       {pl&&(s===0||pl.id===playerId)&&<span className="lobby-tags">
        {s===0&&<span className="tag host">Host</span>}
        {pl.id===playerId&&<span className="tag you">You</span>}
       </span>}
      </span>
     </li>})}
    </ul>
    {!me?<p className="error">You are not a member of this room.</p>
     :isHost?<>
      <button className="btn go lg" disabled={busy||!enough} onClick={()=>act('start')}>Start game</button>
      <p className="muted center">{enough?'Nobody can join once the game has started.':'Invite at least one friend to start.'}</p>
     </>
     :<p className="lobby-wait">Waiting for <b>{host?.name}</b> to start<span className="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>}
    {toast&&<div key={toast.id} className="toast">{toast.msg}</div>}
   </section>
   {canInvite&&<section className="card invite">
    <div className="card-head"><h3>Invite friends</h3><span className="muted">Code <b>{room.code}</b></span></div>
    <div className="invite-btns">
     <button className="btn primary" onClick={shareLink}><Icon.share/> Share</button>
     <a className="btn wa" href={whatsapp} target="_blank" rel="noopener noreferrer"><Icon.wa/> WhatsApp</a>
     <button className="btn secondary" onClick={copyLink}><Icon.link/> Copy link</button>
    </div>
   </section>}
   {errorBar}
  </main>;
 }

 // ---------- game ----------
 const winnerName=room.players.find(p=>p.id===room.winner)?.name||'Player';
 const myTier=me&&tierOf(room,me.id);
 const ds=diceSeat??room.turn;                         // seat whose dice is shown
 const dsName=room.players[ds]?.name||NAMES[ds];
 const mineDice=!!me&&ds===me.seat;
 const diceReady=!room.finished&&myTurn&&mineDice&&!room.rolled&&!busy&&!animating;
 const hint=!me?'You are watching this game.'
  :myTier?`You finished: ${TIERS[myTier].label}`
  :myTurn&&mineDice?(room.rolled?(autoToken!=null?'Moving your coin…':'Tap a glowing coin to move'):'Your turn: tap your dice to roll')
  :`${dsName}'s turn`;
 const showMic=voiceOn&&me?.seat===0&&!room.finished&&!myTier;
 const at=c=>[0,1,2,3].find(s=>cornerOf(s)===c);
 // player panel at the board corner next to that player's base; the dice sits in the active player's panel
 const panel=s=>{
  const right=cornerOf(s)[1]==='r';const pl=room.players[s];
  if(!pl)return <div className={`ppanel empty${right?' right':''}`} style={{'--c':COLORS[s]}}><span className="pav"/><div className="ptext"><span className="pname">Empty seat</span></div></div>;
  const tier=tierOf(room,pl.id);const active=!room.finished&&s===ds&&!tier;const isMe=pl.id===playerId;
  const home=room.tokens[s].filter(v=>v===57).length;
  return <div className={`ppanel${active?' active':''}${tier?' done':''}${right?' right':''}`} style={{'--c':COLORS[s]}}>
   <span className="pav">{initial(pl.name)}</span>
   <div className="ptext"><span className="pname">{pl.name}</span>
    <span className="pmeta">{tier?`${TIERS[tier].emoji} ${TIERS[tier].label}`:isMe?`You · ${home}/4`:`${home}/4 home`}</span></div>
   <div className="pdice">{active
    ?<svg viewBox="-34 -34 68 68" aria-live="polite"><Dice bare x={0} y={0} size={52} value={room.dice} rolling={rolling} color={COLORS[s]}
      ready={isMe&&diceReady} faded={!rolling&&!room.rolled&&diceSeat==null} onRoll={()=>act('roll')}/></svg>
    :<span className="pdice-empty"/>}</div>
  </div>;
 };
 return <main className="shell game">
  <MedalDefs/>
  <svg width="0" height="0" style={{position:'absolute'}} aria-hidden="true"><defs>
   <linearGradient id="diceFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset=".6" stopColor="#f3f3f3"/><stop offset="1" stopColor="#dcdcdc"/></linearGradient>
   <radialGradient id="pip" cx=".35" cy=".35" r=".7"><stop offset="0" stopColor="#5a5a5a"/><stop offset="1" stopColor="#0e0e0e"/></radialGradient>
   {LIGHT.map((l,p)=><linearGradient key={p} id={'g'+p} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={l.hi}/><stop offset="1" stopColor={COLORS[p]}/></linearGradient>)}
  </defs></svg>
  {topbar}
  <div className="prow top">{panel(at('tl'))}{panel(at('tr'))}</div>
  <div className="boardwrap">
   <svg viewBox="0 0 600 600" className={shake?'board shake':'board'}>
    <g transform={`rotate(${rotK*90} 300 300)`}>{board()}</g>
    {stars()}{seats()}{tokens()}{medals()}{effects()}
   </svg>
   {toast&&<div key={toast.id} className="toast">{toast.msg}</div>}
  </div>
  <div className="prow bottom">{panel(at('bl'))}{panel(at('br'))}</div>
  {room.finished?<section className="endbar">
   <span className="endtitle">🥇 {winnerName} wins!</span>
   <div className="endbtns"><button className="btn secondary" onClick={()=>setShowResults(true)}>Results</button><button className="btn primary" disabled={busy} onClick={()=>act('restart')}>Play again</button></div>
  </section>:<section className={`hintbar${diceReady?' ready':''}`} style={{'--c':COLORS[ds]}}>
   <span className="hintdot"/>
   <span className="hinttext">{mic==='listening'?'Listening… say a number from 1 to 6':hint}</span>
   {showMic&&<button className={`micbtn mic-${mic}`} disabled={mic==='thinking'||(mic==='idle'&&!canVoice)} onClick={talk}
    aria-label={mic==='listening'?'Stop listening':'Say a dice number'} title="Say a number">
    {mic==='thinking'?<span className="spinner" aria-hidden="true"/>:<Icon.mic/>}
   </button>}
  </section>}
  {errorBar}
  {confetti&&<Confetti tier={confetti} onDone={()=>setConfetti(null)}/>}
  {overlay&&<ResultOverlay tier={overlay.tier} name={overlay.name} onClose={()=>setOverlay(null)}/>}
  {showResults&&!overlay&&room.finished&&<ResultsPanel room={room} playerId={playerId} busy={busy} onClose={()=>setShowResults(false)} onRestart={()=>act('restart')}/>}
 </main>;
}

// four-colour mark used in the header and on the home screen
function Logo({size=28}){
 return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
  <rect x="1" y="1" width="14" height="14" rx="4" fill={COLORS[0]}/><rect x="17" y="1" width="14" height="14" rx="4" fill={COLORS[1]}/>
  <rect x="17" y="17" width="14" height="14" rx="4" fill={COLORS[2]}/><rect x="1" y="17" width="14" height="14" rx="4" fill={COLORS[3]}/>
  <circle cx="16" cy="16" r="5" fill="#fff"/>
 </svg>;
}

const svgIcon=d=>()=><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const Icon={
 sound:svgIcon(<><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></>),
 mute:svgIcon(<><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m22 9-6 6M16 9l6 6"/></>),
 mic:svgIcon(<><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>),
 share:svgIcon(<><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14"/></>),
 link:svgIcon(<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></>),
 wa:()=><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z"/></svg>,
};
export default App;
