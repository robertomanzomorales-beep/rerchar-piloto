import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {seedComplianceReview} from "../tests/fixtures/compliance-review";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-release-review-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",NEXT_TELEMETRY_DISABLED:"1",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");
  let server:ChildProcess|undefined,logs="";
  const decode=(value:string)=>value.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const failures:{role:string;company:string;path:string;error:string}[]=[],cases:{role:string;company:string;menu:number;details:number}[]=[];
  try{
    for(const name of(await readdir("db")).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
      const sql=await readFile(join("db",name),"utf8");
      await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(value=>value.trim()).filter(Boolean))await tx.query(part);});
    }
    const f=await seedComplianceReview(db),tokens:Record<string,string>={};
    await db.query("UPDATE service_requests SET driver_id=$1 WHERE id IN($2,$3)",[f.actors.conductor.id,f.records.rerchar[0].service_id,f.records.e_y_j[0].service_id]);
    for(const[role,actor]of Object.entries(f.actors)){
      const token=randomBytes(32).toString("hex");tokens[role]=token;
      await db.query("INSERT INTO sessions(token_hash,user_id,expires_at)VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);
    }
    await(globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();
    delete(globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(resolve=>listener.listen(0,"127.0.0.1",resolve));
    const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;
    await new Promise<void>(resolve=>listener.close(()=>resolve()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
    server.stdout!.on("data",data=>logs+=data);server.stderr!.on("data",data=>logs+=data);
    server.on("exit",(code,signal)=>logs+=`\nServer exit ${code} ${signal}\n`);
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",data=>{if(String(data).includes("Ready")){clearTimeout(timer);resolve();}});server!.once("exit",code=>{clearTimeout(timer);reject(new Error("Next terminó "+code));});});
    const html=async(path:string,role:string,depth=0):Promise<string>=>{
      assert.ok(depth<5,`${path}: demasiadas redirecciones`);
      const response=await fetch(base+path,{redirect:"manual",headers:{Cookie:`rerchar_session=${tokens[role]}`},signal:AbortSignal.timeout(120000)}),body=(await response.text()).replace(/<!--[\s\S]*?-->/g,"");
      const refresh=(body.match(/<meta\b[^>]*>/gi)||[]).find(tag=>/http-equiv="refresh"/i.test(tag));
      const target=response.headers.get("location")??(refresh?.match(/\bcontent="[0-9]+;url=([^\"]*)"/i)?.[1]);
      if(target){
        const source=new URL(path,base),destination=new URL(decode(target),base);
        assert.equal(destination.origin,base);
        assert.ok(source.pathname===destination.pathname||role==="cliente"&&source.pathname==="/clientes"&&destination.pathname===`/clientes/${f.client.id}`,`${path}: redirección inesperada a ${destination.pathname}`);
        return html(destination.pathname+destination.search,role,depth+1);
      }
      assert.equal(response.status,200,`${path}: ${response.status} ${response.headers.get("location")??""}`);
      assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK")&&!body.includes("NEXT_REDIRECT")&&!body.includes('id="__next_error__"'),`${path}: error o redirección dentro del HTML`);
      assert.ok(body.includes('id="workspace-content"'),`${path}: falta el contenido del módulo`);
      return body;
    };
    const links=(body:string)=>Array.from(new Set((body.match(/<a\b[^>]*>/g)||[]).map(tag=>decode(tag.match(/\bhref="([^"]*)"/)?.[1]??"")).filter(href=>href.startsWith("/")&&!href.startsWith("//"))));
    for(const company of["rerchar","e_y_j"]){
      const dossier=await html(`/clientes?empresa=${company}`,"cliente");
      const back=(dossier.match(/<a\b[^>]*>[\s\S]*?<\/a>/g)||[]).find(tag=>tag.includes('class="back-link"')&&tag.includes("Mi panel"));
      assert.ok(back);assert.equal(decode(back.match(/\bhref="([^"]*)"/)?.[1]??""),`/empresa/${company}`,"Mi panel vuelve a la empresa desde la que se abrió la carpeta");
    }
    for(const role of["admin","operaciones","cliente","conductor"]){
      await html("/",role);
      for(const company of["rerchar","e_y_j"]){
        const root=await html(`/empresa/${company}`,role),nav=(root.match(/<nav\b[\s\S]*?<\/nav>/g)||[]).find(tag=>tag.includes('aria-label="Navegación principal"'));
        assert.ok(nav);const menu=links(nav),detailPaths=new Set<string>();
        assert.ok(menu.length>=4);if(role==="admin")assert.equal(menu.length,company==="rerchar"?31:28);
        for(const path of menu){
          try{
            const body=await html(path,role);
            const candidates=links(body).filter(href=>/^\/(solicitudes|clientes|flota|cotizaciones|cumplimiento|fichas)\/(?:[0-9a-f-]{36}|nueva|nuevo)(?:\/(?:orden|guias|resumen))?(?:[?#]|$)/.test(href));
            const byType=new Map<string,number>();
            for(const href of candidates){const pieces=new URL(href,base).pathname.split("/"),kind=pieces[1]+(pieces[3]?`/${pieces[3]}`:""),count=byType.get(kind)??0;if(count<2){detailPaths.add(href);byType.set(kind,count+1);}}
          }catch(error){failures.push({role,company,path,error:String(error)});}
        }
        for(const path of detailPaths){try{await html(path,role);}catch(error){failures.push({role,company,path,error:String(error)});}}
        cases.push({role,company,menu:menu.length,details:detailPaths.size});
        console.log(JSON.stringify({phase:"role-company",...cases[cases.length-1],failures:failures.length}));
      }
    }
    const result={ok:failures.length===0,cases,failures,totalMenuRequests:cases.reduce((sum,item)=>sum+item.menu,0),totalDetailRequests:cases.reduce((sum,item)=>sum+item.details,0),clientPanelReturnPreserved:true,companies:2,roles:4,productionMutations:false,emailsSent:false,browserVisualTested:false,evidenceDirectory:work};
    await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert.equal(failures.length,0,JSON.stringify(failures,null,2));
  }finally{
    if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}
    await writeFile(join(work,"server.log"),logs);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
