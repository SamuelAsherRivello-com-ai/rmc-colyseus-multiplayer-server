import {requiredEnv} from './environment.js';
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const key=randomUUID(),headers={'x-probe-secret':requiredEnv('PROBE_SECRET'),'Content-Type':'application/json'};
async function call(route: string,op: string,body?: unknown) {
  const response=await fetch(`${process.env.PROBE_URL}/api/${route}?key=${key}&op=${op}`,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});
  return {status:response.status,...await response.json()};
}
const claim=await Promise.all(['store-a','store-b'].map((route,i)=>call(route,'claim',{value:{claim:i,padding:randomUUID().repeat(128)}})));
console.log(JSON.stringify({claim}));assert.deepEqual(claim.map(r=>r.status).sort(),[200,409]);assert.notEqual(claim[0]!.instance,claim[1]!.instance);
const compressed=await call('store-a','read');assert.equal(compressed.status,200);
const initial=await call('store-a','read-identity');assert.equal(initial.status,200);
console.log(JSON.stringify({defaultReadEncoding:compressed.encoding,defaultEtag:compressed.etag,identityReadEncoding:initial.encoding,identityEtag:initial.etag}));const cas=await Promise.all(['store-a','store-b'].map((route,i)=>call(route,'cas',{etag:initial.etag,value:{winner:i}})));
console.log(JSON.stringify({cas}));assert.deepEqual(cas.map(r=>r.status).sort(),[200,409]);
const final=await call('store-b','read-identity');assert.equal(final.status,200);assert.notEqual(final.etag,initial.etag);
assert.equal(final.value.winner,cas.findIndex(r=>r.status===200));
await call('store-a','delete');
console.log(JSON.stringify({exclusiveCreation:claim.map(r=>r.status),conditionalWrite:cas.map(r=>r.status),distinctInstances:true,consistentLatestRead:true,defaultReadEncoding:compressed.encoding,defaultEtagWeak:compressed.weak,identityReadEncoding:initial.encoding,identityEtagWeak:initial.weak}));
