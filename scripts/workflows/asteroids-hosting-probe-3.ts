import fs from 'node:fs';
fs.writeFileSync('.hosting-probe/package.json',JSON.stringify({name:'asteroids-hosting-capability-probe',private:true,type:'module',engines:{node:'24.x'},dependencies:{'@vercel/functions':'3.9.11'}}));
fs.writeFileSync('.hosting-probe/vercel.json',JSON.stringify({framework:null,regions:['iad1'],functions:{'api/*.mjs':{maxDuration:30}}}));
const source=fs.readFileSync('dist/probes/fixtures/cache-probe-handler.js','utf8');
for(const name of ['cache-a','cache-b'])fs.writeFileSync('.hosting-probe/api/'+name+'.mjs',source);
