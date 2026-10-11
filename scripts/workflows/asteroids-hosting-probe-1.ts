import {requiredEnv} from './environment.js';
import fs from 'node:fs';import {randomUUID} from 'node:crypto';
const headers={'x-probe-secret':requiredEnv('PROBE_SECRET'),'Content-Type':'application/json'};
const results=[];
for(let i=0;i<20;i++){
  const key=randomUUID(),value={sequence:i,nonce:randomUUID()};
  const write=await fetch(process.env.PROBE_URL+'/api/cache-a?key='+key,{method:'POST',headers,body:JSON.stringify(value)});
  const writer=await write.json();if(!write.ok)throw new Error('Cache write failed '+write.status);
  const read=await fetch(process.env.PROBE_URL+'/api/cache-b?key='+key,{headers});const reader=await read.json();
  results.push({writer:writer.instance,reader:reader.instance,writeMs:writer.writeMs,readMs:reader.readMs,matched:JSON.stringify(reader.value)===JSON.stringify(value)});
}
fs.writeFileSync('asteroids-cache-probe.json',JSON.stringify({url:process.env.PROBE_URL,results},null,2));
console.log(JSON.stringify(results,null,2));
if(results.some(r=>r.writer===r.reader||!r.matched))throw new Error('Fresh independent-function visibility not established');
