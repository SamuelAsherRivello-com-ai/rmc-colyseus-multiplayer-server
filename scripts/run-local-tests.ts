import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Build regressions own local servers, never production endpoints or Blob state. */
export function localTestEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
 const env={...source};
 for(const name of ['VERCEL','SERVER_URL','ASTEROIDS_ONLY','MUSIC_ONLY','BLOB_READ_WRITE_TOKEN'])delete env[name];
 return env;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const requested=process.argv.slice(2);
 const files=requested.length?requested:readdirSync('multiplayer-server/test').filter(name=>name.endsWith('.ts')).sort().map(name=>'multiplayer-server/test/'+name);
 const result=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=1',...files],{env:localTestEnvironment(process.env),stdio:'inherit',windowsHide:true});
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
}
