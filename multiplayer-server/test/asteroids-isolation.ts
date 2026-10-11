import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

test('dedicated Asteroids deployment registers its relay and rejects legacy game admission',async()=>{
  const port=24000+(process.pid%16000),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,ASTEROIDS_ONLY:'1',PORT:String(port)},stdio:'ignore',windowsHide:true});
  try {
    let health;
    for(let i=0;i<100;i++) {
      try {const response=await fetch(base+'/api/health');if(response.ok){health=await response.json();break;}}catch{}
      await delay(100);
    }
    assert.ok(health,'isolated server started');
    assert.deepEqual(health.games,['asteroids-coop']);
    const denied=await fetch(base+'/api/join/combat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({create:true})});
    assert.equal(denied.status,404);
    const admitted=await fetch(base+'/api/join/asteroids-coop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({create:true})});
    assert.equal(admitted.status,200);
    assert.match((await admitted.json()).code,/^[A-Z0-9]{4}$/);
  } finally {child.kill();}
});
