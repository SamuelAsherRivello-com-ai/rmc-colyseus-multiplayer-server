import type { BomberGame, BomberPlayer, Bomb } from './bomberman-rules.js';
export interface CpuBrain {next: number;target: number | undefined;lastBomb: number}
type Hazards = Map<number, [number,number][]>;
interface PathNode {cell: number;path: number[];distance: number}
import { WIDTH, HEIGHT, index, placeBomb } from './bomberman-rules.js';

export const CPU_LEVELS: Record<string, {reaction: number;horizon: number;aggression: number}>={LOW:{reaction:30,horizon:65,aggression:180},MED:{reaction:15,horizon:130,aggression:110},HARD:{reaction:6,horizon:190,aggression:65}};
const directions: [number,number][]=[[1,0],[-1,0],[0,1],[0,-1]];
function rays(g: BomberGame,b: Pick<Bomb,"x" | "y" | "range">){const width=g.width||WIDTH,height=g.height||HEIGHT,cellAt=(x: number,y: number)=>index(x,y,width),cells=[cellAt(b.x,b.y)];for(const [dx,dy] of directions)for(let n=1;n<=b.range;n++){const x=b.x+dx*n,y=b.y+dy*n;if(x<0||y<0||x>=width||y>=height)break;const cell=cellAt(x,y);if(g.board[cell]===1)break;cells.push(cell);if(g.board[cell]===2||(g.plants||[]).includes(cell))break;}return cells;}
function forecast(g: BomberGame,b: Bomb){if(!b.sliding)return b;const width=g.width||WIDTH,height=g.height||HEIGHT;let x=b.slideX!,y=b.slideY!; // Sliding bombs initialize both continuous coordinates.
 for(let ticks=1;ticks<=400;ticks++){const nx=x+b.sliding.dx*.1,ny=y+b.sliding.dy*.1,tx=Math.floor(nx+b.sliding.dx*.48),ty=Math.floor(ny+b.sliding.dy*.48),cell=index(tx,ty,width);
  if(tx<0||ty<0||tx>=width||ty>=height||g.board[cell]||(g.plants||[]).includes(cell)||g.bombs.some(q=>q!==b&&q.x===tx&&q.y===ty))return{...b,x:Math.floor(x),y:Math.floor(y),deadline:g.tick+ticks};x=nx;y=ny;
 }return b;
}
export function cpuHazards(g: BomberGame){
 const width=g.width||WIDTH,cellAt=(x: number,y: number)=>index(x,y,width);
 const hazards: Hazards=new Map(),add=(cell: number,start: number,end: number)=>{const intervals=hazards.get(cell)||[];intervals.push([start,end]);hazards.set(cell,intervals);};
 const bombs=g.bombs.map(b=>{const projected=forecast(g,b);return{...projected,cells:rays(g,projected),at:projected.deadline-g.tick};});
 for(let pass=0;pass<bombs.length;pass++)for(const a of bombs)for(const b of bombs)if(a!==b&&a.cells.includes(cellAt(b.x,b.y)))b.at=Math.min(b.at,a.at);
  if (g.chainReaction)
    for (let pass = 0; pass < bombs.length; pass++) {
      const counts = new Map<number, number>();
      for (const b of bombs) counts.set(b.at, (counts.get(b.at) || 0) + 1);
      for (const b of bombs)
        if ((counts.get(b.at) ?? 0) >= 2)
          b.cells = rays(g, { ...b, range: Math.max(g.width || WIDTH, g.height || HEIGHT) });
      for (const a of bombs)
        for (const b of bombs)
          if (a !== b && a.cells.includes(cellAt(b.x, b.y))) b.at = Math.min(b.at, a.at);
    }
 for(const b of bombs)for(const cell of b.cells)add(cell,b.at,b.at+30);
 for(const b of g.blasts)for(const cell of b.cells)add(cell,0,b.until-g.tick);
 for(const warning of g.warnings||[])for(const cell of warning.cells)add(cell,warning.closeTick-g.tick,Infinity);
 for(const cell of g.plants||[])add(cell,0,Infinity);
 return hazards;
}
function paths(g: BomberGame,p: BomberPlayer,hazards: Hazards){
 const width=g.width||WIDTH,height=g.height||HEIGHT,cellAt=(x: number,y: number)=>index(x,y,width);
 const start=cellAt(Math.floor(p.x),Math.floor(p.y)),queue: PathNode[]=[{cell:start,path:[],distance:0}],seen=new Set([start]),result: PathNode[]=[];
 const travel=Math.ceil(60/p.speed),safe=(cell: number,at: number)=>(hazards.get(cell)||[]).every(([begin,end])=>at+12<begin||at>end+6);
 while(queue.length){const node=queue.shift()!;result.push(node);if(node.distance>=10)continue;const x=node.cell%width,y=Math.floor(node.cell/width);
  for(const [dx,dy] of directions){const nx=x+dx,ny=y+dy,cell=cellAt(nx,ny),distance=node.distance+1;
   if(nx<1||ny<1||nx>=width-1||ny>=height-1||seen.has(cell)||g.board[cell]||g.bombs.some(b=>b.x===nx&&b.y===ny)||!safe(cell,distance*travel))continue;
   seen.add(cell);queue.push({cell,path:[...node.path,cell],distance});
  }
 }
 return result;
}
function safeRest(hazards: Hazards,cell: number,horizon: number){return (hazards.get(cell)||[]).every(([start,end])=>start>horizon||end<0);}
function movement(p: BomberPlayer,cell: number | undefined,width: number){if(cell===undefined)return{x:0,y:0,bomb:false};const tx=cell%width,ty=Math.floor(cell/width),dx=tx+.5-p.x,dy=ty+.5-p.y;
 const horizontal=tx!==Math.floor(p.x)||(ty===Math.floor(p.y)&&Math.abs(dx)>Math.abs(dy));
 return horizontal&&Math.abs(dx)>.08?{x:Math.sign(dx),y:0,bomb:false}:Math.abs(dy)>.08?{x:0,y:Math.sign(dy),bomb:false}:Math.abs(dx)>.08?{x:Math.sign(dx),y:0,bomb:false}:{x:0,y:0,bomb:false};}
export function cpuInput(g: BomberGame,id: string,brains: Map<string, CpuBrain>,level='MED'){
 const width=g.width||WIDTH,cellAt=(x: number,y: number)=>index(x,y,width),move=(cell: number | undefined)=>movement(p!,cell,width);
 const p=g.players.find(p=>p.id===id);if(!p?.alive||g.paused)return{x:0,y:0,bomb:false};
 const config=CPU_LEVELS[level]||CPU_LEVELS.MED!;
 let brain=brains.get(id);if(!brain){brain={next:0,target:undefined,lastBomb:-1000};brains.set(id,brain);}
 if(brain.target!==undefined&&Math.hypot(brain.target%width+.5-p.x,Math.floor(brain.target/width)+.5-p.y)<.12)brain.target=undefined;
 if(g.tick<brain.next&&brain.target!==undefined)return move(brain.target);
 brain.next=g.tick+config.reaction;
 const hazards=cpuHazards(g),reachable=paths(g,p,hazards);
 const danger=[-.28,.28].some(dx=>[-.28,.28].some(dy=>!safeRest(hazards,cellAt(Math.floor(p.x+dx),Math.floor(p.y+dy)),config.horizon)));
 if(danger){const escape=reachable.filter(n=>n.path.length&&safeRest(hazards,n.cell,config.horizon+40)).sort((a,b)=>a.distance-b.distance)[0];brain.target=escape?.path[0];return move(brain.target);}
 const centered=Math.abs(p.x%1-.5)<.12&&Math.abs(p.y%1-.5)<.12;
 const bombUseful=rays(g,{x:Math.floor(p.x),y:Math.floor(p.y),range:p.range}).some(c=>g.board[c]===2||(g.plants||[]).includes(c)||g.players.some(q=>q.id!==id&&q.alive&&cellAt(Math.floor(q.x),Math.floor(q.y))===c));
 if(centered&&bombUseful&&g.tick-brain.lastBomb>=config.aggression){
  const forecast={...g,bombs:g.bombs.map(b=>({...b,pass:[...b.pass]})),players:g.players.map(p=>({...p}))};
  if(placeBomb(forecast,forecast.players.find(p=>p.id===id))){const future=cpuHazards(forecast),escape=paths(forecast,p,future).find(n=>n.path.length&&n.distance*60/p.speed<135&&safeRest(future,n.cell,185));
   if(escape){brain.lastBomb=g.tick;brain.target=escape.path[0];return{...move(brain.target),bomb:true};}
  }
 }
 const scored=reachable.filter(n=>n.path.length&&safeRest(hazards,n.cell,config.horizon)).map(n=>{
  const x=n.cell%width,y=Math.floor(n.cell/width),item=g.powerups.some(item=>item.cell===n.cell),blocks=directions.filter(([dx,dy])=>g.board[cellAt(x+dx,y+dy)]===2||(g.plants||[]).includes(cellAt(x+dx,y+dy))).length;
  const opponents=g.players.filter(q=>q.id!==id&&q.alive),distance=opponents.length?Math.min(...opponents.map(q=>Math.abs(q.x-x-.5)+Math.abs(q.y-y-.5))):0;
  return{...n,score:(item?30:0)+blocks*5-n.distance*.8-distance*(level==='HARD'?.7:.2)+((n.cell+g.tick/180+id.length)%7)*.08};
 }).sort((a,b)=>b.score-a.score);
 brain.target=scored[0]?.path[0];return move(brain.target);
}
