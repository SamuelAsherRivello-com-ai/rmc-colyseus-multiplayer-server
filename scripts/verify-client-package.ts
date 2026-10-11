import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(), output=mkdtempSync(join(tmpdir(),'rmc-typed-client-'));
const npmCli=process.env.npm_execpath;
if(!npmCli) throw new Error('Run npm run verify:client-package');
const npm=(args: string[],cwd=root)=>execFileSync(process.execPath,[npmCli,...args],{cwd,encoding:'utf8',windowsHide:true});
const manifest: {name: string;version: string;exports: Record<string,{types: string;import: string}>}=JSON.parse(readFileSync('multiplayer-server/packages/client/package.json','utf8'));
const packed: {filename: string;files: {path: string}[]}[]=JSON.parse(npm(['pack','./multiplayer-server/packages/client','--json','--pack-destination',output]));
assert.equal(packed.length,1);const artifact=packed[0]!;
assert.equal(artifact.filename,`rmc-multiplayer-client-${manifest.version}.tgz`);
for(const mapping of Object.values(manifest.exports)) for(const path of [mapping.types,mapping.import]) assert.ok(artifact.files.some(file=>file.path===path.replace(/^\.\//,'')),`Missing ${path}`);
assert.ok(artifact.files.every(file=>file.path==='package.json'||file.path==='README.md'||file.path.startsWith('dist/')),'Package must contain built output only');
const imports=Object.keys(manifest.exports).map((key,index)=>`import * as export${index} from '${manifest.name}${key==='.'?'':key.slice(1)}';\nvoid export${index};`).join('\n');
const contracts=`import {MultiplayerClient} from '@rmc/multiplayer-client';
import {makeTruck,driveTruck} from '@rmc/multiplayer-client/racing';
import {createWorld,snapshot,applyInput} from '@rmc/multiplayer-client/asteroids';
import {TetrisDuel} from '@rmc/multiplayer-client/tetris-duel';
const world=createWorld();applyInput(world,'host',{seq:1,runId:1,turn:0,thrust:true,fire:false});snapshot(world,1);
const car=makeTruck('racer',1);driveTruck(car,{steer:0,throttle:1,brake:false,boost:false,recover:false},1/60);
const duel=new TetrisDuel();duel.add('a');duel.project('a');
const typed=new MultiplayerClient<{score: number},{ready:{ready:boolean};input:{seq:number}}>('http://localhost:2567','example');
typed.subscribe(state=>{const score: number | undefined=state.gameState?.score;void score;});typed.send('ready',{ready:true});
// @ts-expect-error Typed actions reject invalid control values.
typed.send('ready',{ready:'yes'});
// @ts-expect-error Typed actions reject unsupported message names.
typed.send('score',{score:999});
// @ts-expect-error Snapshot methods require a numeric membership revision.
snapshot(world,'revision');
// @ts-expect-error Racing controls require numeric steering.
driveTruck(car,{steer:'left',throttle:1,brake:false,boost:false,recover:false},1/60);
// @ts-expect-error State subscribers see checked game properties.
typed.subscribe(state=>{const score: string | undefined=state.gameState?.score;void score;});
`;
const consumer=join(output,'consumer');mkdirSync(consumer);
writeFileSync(join(consumer,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{[manifest.name]:`file:${join(output,artifact.filename).replaceAll('\\','/')}`},devDependencies:{typescript:'5.9.3','@types/node':'24.19.2'}}));
npm(['install','--ignore-scripts','--no-audit','--no-fund'],consumer);
const readme=readFileSync('multiplayer-server/packages/client/README.md','utf8');
const example=readme.match(/```ts\r?\n([\s\S]*?)```/)?.[1];if(!example) throw Error('Missing typed README example');
writeFileSync(join(consumer,'example.ts'),example);
writeFileSync(join(consumer,'consumer.ts'),imports+'\n'+contracts);
writeFileSync(join(consumer,'runtime.ts'),imports+`\nimport {createWorld,snapshot} from '@rmc/multiplayer-client/asteroids';\nif(snapshot(createWorld(),1).version!==1) throw Error('Runtime rule contract failed');\nconsole.log('All public exports load without a TypeScript loader');\n`);
for(const resolution of ['Bundler','NodeNext']){
 const config={compilerOptions:{target:'ES2022',module:resolution==='Bundler'?'ESNext':'NodeNext',moduleResolution:resolution,lib:['ES2022','DOM','DOM.Iterable'],types:[],strict:true,noUncheckedIndexedAccess:true,exactOptionalPropertyTypes:true,noImplicitOverride:true,verbatimModuleSyntax:true,forceConsistentCasingInFileNames:true,skipLibCheck:true,noEmit:true},include:['consumer.ts','runtime.ts','example.ts']};
 writeFileSync(join(consumer,'tsconfig.json'),JSON.stringify(config));
 execFileSync(process.execPath,[join(consumer,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,stdio:'inherit',windowsHide:true});
}
execFileSync(process.execPath,[join(consumer,'node_modules/typescript/bin/tsc'),'runtime.ts','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--outDir','compiled','--skipLibCheck','--strict'],{cwd:consumer,stdio:'inherit',windowsHide:true});
execFileSync(process.execPath,[resolve(consumer,'compiled/runtime.js')],{cwd:consumer,stdio:'inherit',windowsHide:true});
if(process.env.VERIFY_LOCAL_SERVER==='1') {
 // Existing integration assertions run against the installed artifact, never source imports.
 const cases=['integration','racing-integration','private-room-admission-integration'];
 for(const name of cases){const source=readFileSync(`multiplayer-server/test/${name}.ts`,'utf8').replaceAll('../packages/client/index.js','@rmc/multiplayer-client').replaceAll('../packages/client/racing-simulation.js','@rmc/multiplayer-client/racing');writeFileSync(join(consumer,name+'.ts'),source);}
 const config={compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022','DOM','DOM.Iterable'],types:['node'],strict:true,noUncheckedIndexedAccess:true,exactOptionalPropertyTypes:true,noImplicitOverride:true,verbatimModuleSyntax:true,forceConsistentCasingInFileNames:true,skipLibCheck:true,outDir:'compiled-tests'},include:cases.map(name=>name+'.ts')};
 writeFileSync(join(consumer,'tsconfig.tests.json'),JSON.stringify(config));
 execFileSync(process.execPath,[join(consumer,'node_modules/typescript/bin/tsc'),'-p','tsconfig.tests.json'],{cwd:consumer,stdio:'inherit',windowsHide:true});
 const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));const address=socket.address();assert.ok(address&&typeof address!=='string');const port=address.port;await new Promise<void>((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
 const endpoint=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['--import','tsx','server.ts'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore',windowsHide:true});
 try {
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(endpoint+'/api/health')).ok;}catch{}if(ready)break;await delay(100);}assert.ok(ready,'Local server starts');
  // Async subprocess lets the parent event loop continue serving orchestration.
  const child=spawn(process.execPath,['--test','--test-concurrency=1',...cases.map(name=>join(consumer,'compiled-tests',name+'.js'))],{cwd:consumer,env:{...process.env,SERVER_URL:endpoint},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let log='';child.stdout.on('data',data=>{log+=String(data);});child.stderr.on('data',data=>{log+=String(data);});
  const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});writeFileSync(join(output,'local-consumer-tests.txt'),log);assert.equal(code,0,log);console.log('Packed consumer authority, reconnect and room-expiration tests passed');
  for(const [script,env] of [['probe.ts',{MUSIC_PROBE_SECONDS:'1'}],['long-lived-session.ts',{LONG_SESSION_SECONDS:'1'}]] as const){execFileSync(process.execPath,['--import','tsx',join(root,'scripts',script)],{cwd:root,env:{...process.env,SERVER_URL:endpoint,...env},stdio:'inherit',windowsHide:true,timeout:60000});}
 } finally {server.kill();}
}
writeFileSync(join(output,'verification.json'),JSON.stringify({artifact:artifact.filename,exports:Object.keys(manifest.exports),files:artifact.files.map(file=>file.path),resolutions:['Bundler','NodeNext'],runtime:'loader-free compiled TypeScript',localServer:process.env.VERIFY_LOCAL_SERVER==='1'},null,2));
console.log(`Client package verification passed: ${output}`);
