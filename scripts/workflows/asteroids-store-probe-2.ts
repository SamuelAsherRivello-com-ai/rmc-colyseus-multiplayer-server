import fs from 'node:fs';
const root='.store-probe/.vercel/output';fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(root+'/config.json',JSON.stringify({version:3,routes:[{handle:'filesystem'}]}));
fs.writeFileSync(root+'/builds.json',JSON.stringify({target:'preview',builds:[]}));
for(const name of ['store-a','store-b']) {
  const folder=root+'/functions/api/'+name+'.func';fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(folder+'/index.mjs',fs.readFileSync('dist/probes/asteroids-store-probe-handler.js','utf8')+'\n//distinct function '+name);
  fs.cpSync('.store-probe/node_modules',folder+'/node_modules',{recursive:true});
  fs.writeFileSync(folder+'/.vc-config.json',JSON.stringify({runtime:'nodejs24.x',handler:'index.mjs',launcherType:'Nodejs',maxDuration:30,regions:['iad1']}));
}
