import type {IncomingMessage, ServerResponse} from "node:http";
import { getCache } from '@vercel/functions';
import { randomUUID } from 'node:crypto';
const instance=randomUUID();
export default async function(req: IncomingMessage,res: ServerResponse){
  if(req.headers['x-probe-secret']!==process.env.PROBE_SECRET){res.statusCode=403;res.end();return;}
  const key=new URL(req.url ?? '/', 'http://probe').searchParams.get('key')||'';if(!/^[a-f0-9-]{36}$/.test(key)){res.statusCode=400;res.end();return;}
  const cache=getCache({namespace:'rmc-asteroids-feasibility-v1'}),start=performance.now();
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'){const chunks=[];for await(const chunk of req)chunks.push(chunk);await cache.set(key,JSON.parse(Buffer.concat(chunks).toString()),{ttl:60});res.end(JSON.stringify({instance,writeMs:performance.now()-start}));}
  else res.end(JSON.stringify({instance,value:await cache.get(key),readMs:performance.now()-start}));
}
