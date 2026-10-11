import {requiredEnv} from './environment.js';
import fs from 'node:fs';
const team=requiredEnv('VERCEL_ORG_ID');
const headers={Authorization:`Bearer ${process.env.VERCEL_TOKEN}`,'Content-Type':'application/json'};
async function api(path: string,options: RequestInit={},missing=false) {
  const response=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${encodeURIComponent(team)}`,{headers,...options});
  if(missing && response.status===404)return null;
  const data=await response.json();
  if(!response.ok)throw new Error(`Vercel API ${response.status}: ${data.error?.message||data.error?.code||'request_failed'}`);
  return data;
}
const account=await api(`/v2/teams/${team}`);
if(account.billing?.plan!=='hobby')throw new Error('Hobby plan required; no resources changed.');
const name='rmc-asteroids-coop';
let project=await api(`/v9/projects/${name}`,{},true);
if(!project)project=await api('/v11/projects',{method:'POST',body:JSON.stringify({name})});
project=await api(`/v9/projects/${project.id}`,{method:'PATCH',body:JSON.stringify({ssoProtection:null})});
if(project.resourceConfig?.fluid!==true)throw new Error('Fluid Compute was not confirmed.');
const env=await api(`/v10/projects/${project.id}/env`);
if(!env.envs?.some((e: {key: string})=>e.key==='ASTEROIDS_ONLY'))await api(`/v10/projects/${project.id}/env`,{method:'POST',body:JSON.stringify({key:'ASTEROIDS_ONLY',value:'1',type:'plain',target:['production','preview']})});
if(!env.envs?.some((e: {key: string})=>e.key==='BLOB_READ_WRITE_TOKEN'))await api('/storage/stores/blob',{method:'POST',body:JSON.stringify({name:'rmc-asteroids-isolated-continuity',region:'iad1',access:'private',projectId:project.id})});
const updated=await api(`/v10/projects/${project.id}/env`);
if(!updated.envs?.some((e: {key: string})=>e.key==='BLOB_READ_WRITE_TOKEN'))throw new Error('Private storage connection missing; do not create duplicate stores.');
const result={id:project.id,name:project.name,plan:'hobby',fluid:true,privateBlob:true,thirdPartyServices:false,paidFeatures:false};
fs.writeFileSync('asteroids-project.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
