import {rmSync} from 'node:fs';
import {resolve, relative} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd(), output=resolve(root,'multiplayer-server/packages/client/dist');
if(relative(root,output).startsWith('..')) throw new Error('Client output must stay inside this checkout');
rmSync(output,{recursive:true,force:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.client-build.json'],{stdio:'inherit',windowsHide:true});
