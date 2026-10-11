import {requiredEnv} from './environment.js';
import fs from 'node:fs';
const headers = {Authorization: `Bearer ${process.env.VERCEL_TOKEN}`};
const team = encodeURIComponent(requiredEnv('VERCEL_ORG_ID'));
const project = encodeURIComponent(requiredEnv('VERCEL_PROJECT_ID'));
const outputs: Record<string, {status: number;variables?: unknown;configurations?: unknown;error?: unknown}> = {};
for (const [name,path] of Object.entries({project:`/v9/projects/${project}`,env:`/v10/projects/${project}/env`,integrations:'/v1/integrations/configurations?view=account'})) {
  const response=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${team}`,{headers});
  const data=await response.json();
  outputs[name]={status:response.status};
  if(name==='env') outputs[name]!.variables=data.envs?.map((e: {key: string;type: string;target: string[]})=>({key:e.key,type:e.type,target:e.target}));
  if(name==='project') Object.assign(outputs[name],{name:data.name,framework:data.framework,resourceConfig:data.resourceConfig});
  if(name==='integrations') outputs[name]!.configurations=(data.configurations||[]).map((e: {id: string;slug: string;installationType: string;projects: string[]})=>({id:e.id,slug:e.slug,installationType:e.installationType,projects:e.projects}));
  if(!response.ok) outputs[name]!.error={code:data.error?.code,message:data.error?.message};
}
fs.writeFileSync('hosting-capabilities.json',JSON.stringify(outputs,null,2));
console.log(JSON.stringify(outputs,null,2));
