import { readdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const catalog={};
for(const scope of ["repair","platform"]){
 const dir=resolve("db/queries",scope);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith(".sql")).sort()){
  const source=await readFile(resolve(dir,file),"utf8"),parts=source.split(/^-- name: (\w+) :\w+\s*$/m);
  for(let i=1;i<parts.length;i+=2){
   const name=scope+"."+parts[i];if(catalog[name])throw new Error("Duplicate query "+name);
   let sql=parts[i+1].trim().replace(/sqlc\.n?arg\(\s*['"]?(\w+)['"]?\s*\)/g,"@$1").replace(/sqlc\.embed\((\w+)\)/g,"$1.*").replace(/--[^\n]*/g,"");
   const params=[];sql=sql.replace(/@(\w+)/g,(_,key)=>{if(!params.includes(key))params.push(key);return "$"+(params.indexOf(key)+1);});
   catalog[name]={sql,params};
  }
 }
}
await writeFile("src/server/sql/queries.json",JSON.stringify(catalog,null,2)+"\n");
console.log(`Generated ${Object.keys(catalog).length} named PostgreSQL queries`);
