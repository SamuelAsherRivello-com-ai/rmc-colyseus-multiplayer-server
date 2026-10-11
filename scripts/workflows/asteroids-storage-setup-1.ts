import {requiredEnv} from './environment.js';
const team=requiredEnv('VERCEL_ORG_ID'),project=requiredEnv('VERCEL_PROJECT_ID');
const headers={Authorization:`Bearer ${process.env.VERCEL_TOKEN}`,'Content-Type':'application/json'};
async function api(path: string,options: RequestInit={}) {
  const response=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${encodeURIComponent(team)}`,{headers,...options});
  const data=await response.json();
  if(!response.ok)throw new Error(`Vercel API ${response.status}: ${data.error?.code||'request_failed'}`);
  return data;
}
const account=await api(`/v2/teams/${encodeURIComponent(team)}`);
const plan=account.billing?.plan;
console.log(JSON.stringify({plan,project,paidServicesAllowed:false}));
if(plan!=='hobby')throw new Error('The required Hobby plan could not be confirmed; no resources changed.');
const env=await api(`/v10/projects/${encodeURIComponent(project)}/env`);
if(env.envs?.some((e: {key: string})=>e.key==='BLOB_READ_WRITE_TOKEN')) {
  console.log('Private storage credential already configured; no duplicate store created.');
} else {
  const result=await api('/storage/stores/blob',{method:'POST',body:JSON.stringify({name:'rmc-asteroids-continuity',region:'iad1',access:'private',projectId:project})});
  console.log(JSON.stringify({storageCreated:true,access:result.store?.access,region:result.store?.region}));
  const updated=await api(`/v10/projects/${encodeURIComponent(project)}/env`);
  if(!updated.envs?.some((e: {key: string})=>e.key==='BLOB_READ_WRITE_TOKEN'))throw new Error('Store created but project credential connection needs repair; do not create another store.');
  console.log('Project Blob credential connected. No secret values logged.');
}
