import React,{useEffect,useState} from 'react';

export const TIERS={
 gold:  {label:'Gold Medal',  place:'1st Place',emoji:'🥇',hi:'#fff4b0',mid:'#f2c230',lo:'#a87a05',ribbon:['#d62839','#1d4ed8']},
 silver:{label:'Silver Medal',place:'2nd Place',emoji:'🥈',hi:'#ffffff',mid:'#c3cad3',lo:'#6b7480',ribbon:['#1d4ed8','#e5e7eb']},
 bronze:{label:'Bronze Medal',place:'3rd Place',emoji:'🥉',hi:'#ffd9b5',mid:'#cd7f32',lo:'#7a4314',ribbon:['#15803d','#f59e0b']},
 lost:  {label:'Lost',        place:'Last Place',emoji:'',  hi:'#e5e7eb',mid:'#9ca3af',lo:'#4b5563',ribbon:['#6b7280','#9ca3af']},
};
const ORDER=['gold','silver','bronze'];

/** gold / silver / bronze / lost for a player, or null while they are still playing */
export function tierOf(room,id){
 const rk=room.ranking||[];const i=rk.indexOf(id);
 if(i<0)return null;
 const n=room.players.length;
 if(room.finished&&n>1&&i===rk.length-1&&rk.length===n)return 'lost';
 return ORDER[i]||'lost';
}

/** gradients shared by every medal on the page */
export function MedalDefs(){
 return <svg width="0" height="0" style={{position:'absolute'}} aria-hidden="true"><defs>
  {Object.entries(TIERS).map(([k,t])=><React.Fragment key={k}>
   <radialGradient id={`md-${k}`} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor={t.hi}/><stop offset=".55" stopColor={t.mid}/><stop offset="1" stopColor={t.lo}/></radialGradient>
   <linearGradient id={`mr-${k}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={t.lo}/><stop offset=".5" stopColor={t.hi}/><stop offset="1" stopColor={t.lo}/></linearGradient>
  </React.Fragment>)}
  <linearGradient id="md-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset=".5" stopColor="#fff" stopOpacity=".85"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
 </defs></svg>;
}

/** medal drawn around (0,0); disc radius ~ size/2. Usable inside any <svg>. */
export function Medal({tier,size=100,animate=false,uid=''}){
 const t=TIERS[tier];const r=size/2;const clip=`mclip-${tier}-${uid}`;
 if(tier==='lost')return <g className={animate?'lostbadge':''}>
  <g transform="rotate(-12)">
   <rect x={-r*1.15} y={-r*.45} width={r*2.3} height={r*.9} rx={r*.14} fill="rgba(255,255,255,.92)" stroke="#c62828" strokeWidth={r*.09}/>
   <rect x={-r*1.02} y={-r*.33} width={r*2.04} height={r*.66} rx={r*.08} fill="none" stroke="#c62828" strokeWidth={r*.03}/>
   <text y={r*.2} textAnchor="middle" fontSize={r*.62} fontWeight="900" fill="#c62828" letterSpacing={r*.06} fontFamily="system-ui,Arial,sans-serif">LOST</text>
  </g>
 </g>;
 const n=tier==='gold'?1:tier==='silver'?2:3;
 return <g className={animate?'medal pop':'medal'}>
  {/* ribbon */}
  <path d={`M${-r*.62} ${-r*2.1}L${-r*.05} ${-r*.55}L${r*.35} ${-r*.75}L${-r*.15} ${-r*2.1}Z`} fill={t.ribbon[0]}/>
  <path d={`M${r*.62} ${-r*2.1}L${r*.05} ${-r*.55}L${-r*.35} ${-r*.75}L${r*.15} ${-r*2.1}Z`} fill={t.ribbon[1]}/>
  <rect x={-r*.32} y={-r*1.12} width={r*.64} height={r*.3} rx={r*.08} fill={`url(#mr-${tier})`}/>
  {/* disc */}
  <circle cy={r*.08} r={r} fill="rgba(0,0,0,.25)"/>
  <circle r={r} fill={`url(#mr-${tier})`}/>
  <circle r={r*.84} fill={`url(#md-${tier})`}/>
  <circle r={r*.7} fill="none" stroke={t.lo} strokeOpacity=".45" strokeWidth={r*.04} strokeDasharray={`${r*.06} ${r*.08}`}/>
  <path transform={`translate(0 ${-r*.06}) scale(${r/52})`} d="M0 -26L7.6 -8.4L26.4 -8L11.2 4L16.4 22.4L0 11.6L-16.4 22.4L-11.2 4L-26.4 -8L-7.6 -8.4Z" fill={t.hi} stroke={t.lo} strokeWidth="2" opacity=".95"/>
  <text y={r*.2} textAnchor="middle" fontSize={r*.42} fontWeight="900" fill={t.lo} fontFamily="system-ui,Arial,sans-serif">{n}</text>
  {/* moving shine */}
  <clipPath id={clip}><circle r={r}/></clipPath>
  <g clipPath={`url(#${clip})`}><rect className="shine" x={-r*.35} y={-r*1.3} width={r*.5} height={r*2.6} fill="url(#md-shine)" transform="rotate(25)"/></g>
 </g>;
}

/** full-screen celebration when *you* finish */
export function ResultOverlay({tier,name,onClose}){
 const t=TIERS[tier];const lost=tier==='lost';
 const [sparks]=useState(()=>Array.from({length:lost?0:22},(_,i)=>({i,a:Math.random()*360,d:110+Math.random()*90,delay:.55+Math.random()*.5,s:4+Math.random()*6})));
 useEffect(()=>{const id=setTimeout(onClose,lost?4200:5200);return()=>clearTimeout(id)},[]);
 return <div className={`overlay ${lost?'is-lost':'is-'+tier}`} onClick={onClose} role="dialog" aria-label={`${t.label} — ${name}`}>
  {!lost&&<div className="rays"/>}
  <div className="overlay-card">
   <svg viewBox="-150 -170 300 300" className="overlay-medal">
    {sparks.map(s=><circle key={s.i} r={s.s} className="ospark" fill={s.i%2?t.hi:t.mid}
     style={{'--x':`${Math.cos(s.a)*s.d}px`,'--y':`${Math.sin(s.a)*s.d}px`,animationDelay:`${s.delay}s`}}/>)}
    <Medal tier={tier} size={lost?120:150} animate uid="overlay"/>
   </svg>
   <div className="overlay-place">{lost?'Better luck next time':t.place}</div>
   <div className="overlay-title">{t.label}</div>
   <div className="overlay-name">{name}</div>
   <div className="overlay-hint">Tap to continue</div>
  </div>
 </div>;
}

/** final standings with a podium */
export function ResultsPanel({room,playerId,onClose,onRestart,busy}){
 const rows=(room.ranking||[]).map(id=>{const p=room.players.find(x=>x.id===id);return{id,name:p?.name||'Player',tier:tierOf(room,id)}});
 const podium=[rows[1],rows[0],rows[2]].filter(Boolean).filter(r=>r.tier!=='lost');
 const H={gold:120,silver:92,bronze:72};
 return <div className="overlay results" role="dialog" aria-label="Final results">
  <div className="results-card">
   <h2>Final Results</h2>
   <div className="podium">
    {podium.map(r=><div key={r.id} className={`step step-${r.tier}`}>
     <svg viewBox="-60 -120 120 180" className="podium-medal"><Medal tier={r.tier} size={70} uid={'p'+r.id}/></svg>
     <div className="step-name">{r.name}{r.id===playerId?' (You)':''}</div>
     <div className="step-block" style={{height:H[r.tier]}}>{r.tier==='gold'?1:r.tier==='silver'?2:3}</div>
    </div>)}
   </div>
   <ol className="standings">
    {rows.map((r,i)=><li key={r.id} className={`row-${r.tier}`} style={{animationDelay:`${.5+i*.15}s`}}>
     <span className="pos">{i+1}</span>
     <span className="who">{r.name}{r.id===playerId?' (You)':''}</span>
     <span className={`tag tag-${r.tier}`}>{TIERS[r.tier].emoji} {TIERS[r.tier].label}</span>
    </li>)}
   </ol>
   <div className="results-actions">
    <button disabled={busy} onClick={onRestart}>Play again</button>
    <button className="secondary" onClick={onClose}>View board</button>
   </div>
  </div>
 </div>;
}
