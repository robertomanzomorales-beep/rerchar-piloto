import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {seedGuideFollowupReview} from "../tests/fixtures/guide-followup-review";
import {chileCsvDay} from "../lib/chile-csv";
import {guideFollowupHref,type GuideFilter} from "../lib/guide-followup-filters";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-dashboard-followup-review-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db"),{listGuideFollowups}=await import("../lib/service-ledger");let server:ChildProcess|undefined,logs="";
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,""),decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'");
  try{
    for(const name of (await readdir("db")).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});}
    const f=await seedGuideFollowupReview(db,chileCsvDay()),tokens:Record<string,string>={};
    for(const [role,actor]of Object.entries(f.actors)){const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);}
    const filters:GuideFilter[]=["todas","mias","mias_atrasadas","atrasadas","proximas","sin_plazo","pendientes"],expected:Record<string,Record<string,string[]>>={};for(const role of ["admin","operaciones"] as const){expected[role]={};for(const filter of filters)expected[role][filter]=(await listGuideFollowups(f.actors[role],"rerchar",filter,f.today)).map(row=>row.id);}
    console.log(JSON.stringify({phase:"fixtures",eligible:f.totalEligible,ownOverdue:f.ownOverdue,roles:4,companies:2,productionMutations:false}));
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(resolve=>listener.listen(0,"127.0.0.1",resolve));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(resolve=>listener.close(()=>resolve()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,role="admin")=>fetch(base+path,{redirect:"manual",headers:role?{Cookie:`rerchar_session=${tokens[role]}`}:{},signal:AbortSignal.timeout(120000)}),html=async(path:string,role="admin")=>{const response=await request(path,role);assert.equal(response.status,200,path);const body=clean(await response.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;},ids=(body:string)=>[...body.matchAll(/data-guide-followup="([^"]+)"/g)].map(match=>match[1]);
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",data=>{if(String(data).includes("Ready")){clearTimeout(timer);resolve();}});server!.once("exit",code=>{clearTimeout(timer);reject(new Error("Next terminó "+code));});});
    const counts:Record<string,number>={};
    for(const role of ["admin","operaciones"] as const){
      const home=await html("/empresa/rerchar",role),row=(home.match(/<tr\b[\s\S]*?<\/tr>/g)||[]).find(row=>row.includes("Guías valorizadas atrasadas a mi cargo"));assert.ok(row);const href=decode(row.match(/href="([^"]+)"/)![1]);assert.equal(href,guideFollowupHref("mias_atrasadas"));assert.ok(row.includes(`<td>${role==="admin"?312:3}</td>`));
      for(const filter of filters){const seen:string[]=[],total=expected[role][filter].length,pages=Math.max(1,Math.ceil(total/100));for(let page=1;page<=pages;page++){const body=await html(guideFollowupHref(filter,page),role),current=ids(body);assert.equal(current.length,Math.min(100,total-(page-1)*100));seen.push(...current);assert.ok(body.includes(`de ${total} servicios.`));const nav=body.match(/<nav\b[^>]*aria-label="Páginas del seguimiento de guías"[\s\S]*?<\/nav>/)?.[0];if(pages>1){assert.ok(nav);for(const target of [...nav.matchAll(/href="([^"]+)"/g)]){const url=new URL(decode(target[1]),base);assert.equal(url.searchParams.get("empresa"),"rerchar");assert.equal(url.searchParams.get("estado"),filter);}}}assert.deepEqual(seen,expected[role][filter]);assert.equal(new Set(seen).size,total);counts[role+":"+filter]=total;}
      const all=await html(guideFollowupHref(),role),summary=all.match(/<a\b[^>]*data-guide-summary="my_overdue"[\s\S]*?<\/a>/)?.[0];assert.ok(summary);assert.ok(summary.includes("estado=mias_atrasadas"));assert.ok(all.includes("Imprimir esta página"));assert.ok(!all.includes("hasta 250"));
      const over=await request(guideFollowupHref("mias_atrasadas",999),role),overBody=await over.text(),location=over.headers.get("location")??decode(overBody.match(/<meta\b[^>]*http-equiv="refresh"[^>]*content="[^;]*;url=([^"]*)"/)?.[1]??"");assert.ok(location);const target=new URL(location,base);assert.equal(target.searchParams.get("estado"),"mias_atrasadas");assert.equal(target.searchParams.get("pagina"),role==="admin"?"4":null);
      const eyj=await html("/empresa/e_y_j",role);assert.ok(!eyj.includes("Guías valorizadas atrasadas a mi cargo"));assert.ok(!eyj.includes('href="/seguimiento-guias?'));
      const ingress=await html("/ingresos",role);assert.ok(ingress.includes("Archivo Excel con las 22 columnas"));assert.ok(!ingress.includes("21 columnas"));
      console.log(JSON.stringify({phase:"panels",role,companies:2,filters:7,completePages:true,counterMatchesTarget:true,receiptColumns:22}));
    }
    const sample=f.groups["Propia atrasada"][0],followup=await html(`/solicitudes/${sample}/seguimiento`);assert.ok(followup.includes("Seguimiento del servicio y guías"));
    for(const role of ["cliente","conductor"]){for(const company of ["rerchar","e_y_j"]){const home=await html("/empresa/"+company,role);assert.ok(!home.includes("Guías valorizadas atrasadas a mi cargo"));assert.ok(!home.includes('href="/seguimiento-guias?'));assert.ok(!home.includes("Saldo por cobrar"));}const response=await request(guideFollowupHref("mias_atrasadas"),role),body=await response.text();assert.ok([303,307].includes(response.status)||body.includes("NEXT_REDIRECT"));assert.equal(ids(body).length,0);}
    const anonymous=await request(guideFollowupHref(),""),anonymousBody=await anonymous.text();assert.ok([303,307].includes(anonymous.status)||anonymousBody.includes("NEXT_REDIRECT"));assert.equal(ids(anonymousBody).length,0);
    const result={ok:true,roles:4,companies:2,eligibleServices:322,adminOwnOverdue:312,operationsOwnOverdue:3,counts,allPagesWithoutLossOrDuplicates:true,personalOverdueCounterMatchesLink:true,legacyPendingFilterPreserved:true,companyAndFilterPreserved:true,clampedPages:true,internalGuideVisibilityScoped:true,receiptExportCopyMatches22Columns:true,productionMutations:false,emailsSent:false,browserVisualTested:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
