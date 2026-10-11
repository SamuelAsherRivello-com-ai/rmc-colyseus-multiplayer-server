// Subprocess-only fixture. Every request is intercepted; no remote mutation occurs.
import assert from 'node:assert/strict';
const calls: string[]=[];
const mode=process.env.TOOL_FIXTURE;
globalThis.fetch=async(input,init)=>{
 const url=String(input);calls.push(url);
 assert.ok(!init?.method||init.method==='GET','Fixture prohibits remote mutation');
 if(mode==='diagnostics') return Response.json({name:'fixture',framework:'express',resourceConfig:{},envs:[{key:'TOKEN',type:'encrypted',target:['production'],value:process.env.VERCEL_TOKEN}],configurations:[{id:'fixture',slug:'fixture',installationType:'marketplace',projects:[],secret:process.env.VERCEL_TOKEN}]});
 if(mode==='previous') {assert.ok(url.startsWith('https://api.vercel.com/v6/deployments'));return Response.json({deployments:[{uid:'fixture-deployment'}]});}
 if(mode==='empty') return Response.json({deployments:[]});
 if(mode==='failure') return Response.json({}, {status:503});
 assert.ok(url.includes('/api/health'));return Response.json({status:'ok',version:process.env.EXPECTED_VERSION||'0.9.13',games:['fixture']});
};
const target=process.env.TOOL_TARGET;if(!target) throw Error('TOOL_TARGET required');
await import(target);
assert.equal(calls.length,mode==='diagnostics'?3:1);
