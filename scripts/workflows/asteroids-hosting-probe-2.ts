import fs from 'node:fs';
const output='.hosting-probe/.vercel/output';fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(output+'/config.json',JSON.stringify({version:3,routes:[{handle:'filesystem'}]}));
fs.writeFileSync(output+'/builds.json',JSON.stringify({target:'preview',builds:[]}));
for(const name of ['cache-a','cache-b']){
  const folder=output+'/functions/api/'+name+'.func';fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(folder+'/index.mjs',fs.readFileSync('.hosting-probe/api/'+name+'.mjs','utf8')+'\n// distinct function '+name);
  fs.cpSync('.hosting-probe/node_modules',folder+'/node_modules',{recursive:true});
  fs.writeFileSync(folder+'/.vc-config.json',JSON.stringify({runtime:'nodejs24.x',handler:'index.mjs',launcherType:'Nodejs',maxDuration:30,regions:['iad1']}));
}
