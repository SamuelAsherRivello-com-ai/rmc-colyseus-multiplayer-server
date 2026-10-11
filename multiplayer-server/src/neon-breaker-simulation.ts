interface Paddle { seat: number; x: number; target: number; y: number; width: number }
interface Ball { id: number; x: number; y: number; vx: number; vy: number; r: number; attached: boolean; seat?: number }
interface Drop { id: number; x: number; y: number; type: string; caught?: boolean }
interface Brick { id: number; x: number; y: number; w: number; h: number; hp: number; maxHp: number; kind: string }
// Fixed wave/seat bounds and preceding length checks establish indexed access.
export const WIDTH = 320;
export const HEIGHT = 576;
export const PADDLE_Y_BY_SEAT = Object.freeze([490, 440]);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const waves = [
  ['11111111111','12222222221','11111111111','00111111100'],
  ['21212121212','11111111111','12222222221','11111111111','00111111100'],
  ['22211111122','21122222112','11211111211','11122222111','01111111110','00111111100']
];
export class NeonBreakerSimulation {
  // reset() initializes these fields before construction returns.
  score!: number; lives!: number; wave!: number; outcome!: string; time!: number;
  paddles!: Paddle[]; balls!: Ball[]; drops!: Drop[]; dropSerial!: number;
  rng!: number; effects!: { wideUntil: number }; bricks!: Brick[];
  constructor() { this.reset(); }
  reset() {
    this.score=0; this.lives=3; this.wave=0; this.outcome='playing'; this.time=0;
    this.paddles=PADDLE_Y_BY_SEAT.map((y,seat)=>({seat,x:160,target:160,y,width:38}));
    this.balls=[]; this.drops=[]; this.dropSerial=0; this.rng=0x4e424432; this.effects={wideUntil:0};
    this.bricks=[]; this.loadWave(0);
  }
  random(){ this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0; return this.rng/4294967296; }
  loadWave(index: number){
    this.wave=index; this.bricks=[];
    waves[index]!.forEach((row,ry)=>[...row].forEach((v,c)=>{const hp=Number(v); if(hp)this.bricks.push({id:this.bricks.length,x:18+c*26,y:74+ry*20,w:24,h:14,hp,maxHp:hp,kind:hp===2?'reinforced':'normal'});}));
    this.balls=[{id:0,x:160,y:520,vx:0,vy:0,r:4,attached:true}]; this.drops=[];
  }
  join(seat: number){ const p=this.paddles[seat]; if(p)p.x=p.target=WIDTH/2; }
  leave(seat: number){ const p=this.paddles[seat]; if(p)p.x=p.target=WIDTH/2; for(const b of this.balls)if(b.attached&&b.seat===seat)b.seat=0; }
  input(seat: number,value: unknown){
    if(!Number.isInteger(seat)||seat<0||seat>1||!value||typeof value!=='object')return false;
    const x=(value as Record<string, unknown>).x;
    if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)return false;
    this.paddles[seat]!.target=x*WIDTH; return true;
  }
  launch(seat: number){ if(this.outcome!=='playing'||!this.balls.some(b=>b.attached))return false;
    for(const b of this.balls)if(b.attached){b.attached=false;b.seat=seat;b.vx=seat===0?-95:95;b.vy=-175;} return true;
  }
  restart(){this.reset();}
  step(dt=1/30){
    if(!Number.isFinite(dt)||dt<=0||dt>.1)return;
    this.time+=dt;
    if(this.outcome!=='playing')return;
    for(const p of this.paddles){p.width=this.effects.wideUntil>this.time?54:38;const half=p.width/2;p.target=clamp(p.target,half,WIDTH-half);p.x+=clamp(p.target-p.x,-260*dt,260*dt);p.x=clamp(p.x,half,WIDTH-half);}
    for(const b of this.balls){if(b.attached){const p=this.paddles[b.seat??0]!;b.x=p.x;b.y=p.y-20;continue;}
      const ox=b.x,oy=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;
      if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx);}if(b.x>WIDTH-b.r){b.x=WIDTH-b.r;b.vx=-Math.abs(b.vx);}if(b.y<b.r+42){b.y=b.r+42;b.vy=Math.abs(b.vy);}
      if(b.vy>0){
        for(const p of this.paddles){const dy=b.y-oy;if(dy<=0)continue;const crossing=(p.y-(oy+b.r))/dy;if(crossing<0||crossing>1)continue;const hitX=ox+(b.x-ox)*crossing;if(Math.abs(hitX-p.x)>p.width/2+b.r)continue;const off=clamp((hitX-p.x)/(p.width/2),-1,1);b.x=hitX;b.y=p.y-b.r-1;b.vx=off*210+(p.seat===0?-18:18);b.vy=-Math.max(125,Math.sqrt(Math.max(20000, b.vx*b.vx+Math.abs(b.vy*b.vy))));break;}
      }
      if(b.vy<0){const hit=this.bricks.find(k=>ox+b.r>=k.x&&ox-b.r<=k.x+k.w&&oy+b.r>=k.y&&oy-b.r<=k.y+k.h);if(hit){hit.hp--;b.vy=Math.abs(b.vy);if(hit.hp<=0){this.score+=hit.kind==='reinforced'?25:10;this.bricks.splice(this.bricks.indexOf(hit),1);if(this.random()<.125)this.drops.push({id:this.dropSerial++,x:hit.x+hit.w/2,y:hit.y,type:this.random()<.5?'wide':'multiball'});}}}
    }
    this.balls=this.balls.filter(b=>b.y<HEIGHT+10);
    for(const d of this.drops){d.y+=90*dt;for(const p of this.paddles){if(Math.abs(d.x-p.x)<p.width/2+5&&Math.abs(d.y-p.y)<10){if(d.type==='wide')this.effects.wideUntil=this.time+8;else if(this.balls.length<3&&this.balls.length){const src=this.balls[0]!;this.balls.push({id:++this.dropSerial,x:src.x,y:src.y,vx:-src.vx,vy:src.vy, r:4,attached:false});}d.caught=true;}}}
    this.drops=this.drops.filter(d=>!d.caught&&d.y<HEIGHT);
    if(!this.balls.length){this.lives--;if(this.lives<=0)this.outcome='defeat';else this.balls=[{id:0,x:this.paddles[0]!.x,y:this.paddles[0]!.y-20,vx:0,vy:0,r:4,attached:true,seat:0}];}
    if(!this.bricks.length){if(this.wave===2)this.outcome='victory';else this.loadWave(this.wave+1);}
  }
  snapshot(){return {width:WIDTH,height:HEIGHT,wave:this.wave+1,waves:3,score:this.score,lives:this.lives,outcome:this.outcome,time:this.time,paddles:this.paddles.map(p=>({...p})),balls:this.balls.map(b=>({...b})),bricks:this.bricks.map(b=>({...b})),drops:this.drops.map(d=>({...d})),effects:{wide:this.effects.wideUntil>this.time}};}
}


