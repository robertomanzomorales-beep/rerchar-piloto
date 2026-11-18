import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {db,transaction} from '../lib/db';
import {seedServiceReport} from '../tests/fixtures/service-report';
import {readdir,readFile,writeFile,mkdtemp} from 'node:fs/promises';
const root=process.cwd();
let work:string;
async function main(){
 work=await mkdtemp(join(tmpdir(),'rerchar-request-http-'));
 Object.assign(process.env,{DATABASE_URL:'',NODE_ENV:'development',VERCEL:'',SMTP_HOST:'',PGLITE_DATA_DIR:await mkdtemp(work+'/db-')});
 for(const name of (await readdir(root+'/db')).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
  const sql=await readFile(root+'/db/'+name,'utf8');
  await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(statement);});
 }
 const {actors,client,other,site}=await seedServiceReport(db);
 const [asset]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind,plate,reading_unit) VALUES('REV-REPORT','Camión recorrido','camion','ABCD12','km') RETURNING id");
 const [service]=await db.query<{id:string}>("SELECT id FROM service_requests WHERE client_id=$1 AND driver_id=$2 AND deleted_at IS NULL LIMIT 1",[client.id,actors.conductor.id]);
 const [foreign]=await db.query<{id:string}>("SELECT id FROM service_requests WHERE client_id=$1 AND deleted_at IS NULL LIMIT 1",[other.id]);
 const tokens:Record<string,string>={};
 for(const [role,user] of Object.entries(actors)){
  const token=randomBytes(32).toString('hex');tokens[role]=token;
  await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),user.id]);
 }
 await (globalThis as any).__rercharDb.local.close();delete (globalThis as any).__rercharDb.local;
 const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,'127.0.0.1',r));
 const address=portServer.address();assert.ok(address&&typeof address!=='string');const port=address.port;
 await new Promise<void>(r=>portServer.close(()=>r()));const base='http://127.0.0.1:'+port;
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env},detached:true,stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
 const request=(path:string,token:string|undefined=tokens.admin,options:RequestInit={})=>fetch(base+path,{redirect:'manual',...options,headers:{...options.headers,...(token?{Cookie:'rerchar_session='+token}:{})},signal:AbortSignal.timeout(60000)});
 const html=async(path='/documentos-sii?empresa=rerchar')=>{const r=await request(path);assert.equal(r.status,200);const body=await r.text();assert.ok(!body.includes('NEXT_HTTP_ERROR_FALLBACK;500'));return body.replace(/<!--[\s\S]*?-->/g,'');};
 const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
 const requestForm=(body:string)=>{const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes('request-form'));assert.ok(form);const data=new FormData();for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||''));}return {form,data};};
 const post=(path:string,data:FormData,role='admin')=>request(path,role?tokens[role]:'',{method:'POST',body:data,headers:{Origin:base}});
 const htmlPage=async(path:string,role='admin')=>{const r=await request(path,tokens[role]);assert.equal(r.status,200);return (await r.text()).replace(/<!--[\s\S]*?-->/g,'');};
 const selected=(form:string,name:string)=>{const select=form.match(new RegExp('<select[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))?.[1];assert.ok(select,name);return select.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1]??'';};
 const inputValue=(form:string,name:string)=>{const input=(form.match(/<input\b[^>]*>/g)||[]).find(x=>x.includes('name="'+name+'"'));assert.ok(input,name);return decode(input.match(/\bvalue="([^"]*)"/)?.[1]||'');};
 const openCount=async(company:string)=>{const r=await request('/api/reportes/servicios?company='+company+'&client_id='+client.id+'&status=solicitada');assert.equal(r.status,200);return (await r.text()).trim().split('\r\n').length-1;};
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Inicio fallido: '+logs.slice(-1000))),25000);server.stdout.on('data',d=>{if(String(d).includes('Ready')){clearTimeout(timer);resolve();}});server.once('exit',code=>{clearTimeout(timer);reject(new Error('Next terminó '+code));});});
  const outcomes=[];
  for(const company of ['rerchar','e_y_j']){
   const path='/solicitudes/nueva?empresa='+company+'&tipo=arriendo';
   let body=await htmlPage(path),original=requestForm(body);
   assert.equal(selected(original.form,'client_id'),'');assert.match(original.form,/<button[^>]*disabled/);
   assert.equal(selected(original.form,'operating_company'),company);
   const key=original.data.get('submission_key');const baseline=await openCount(company);
   const values={client_id:client.id,site_id:'',new_site_name:'Centro HTTP '+company,new_site_address:'Dirección conservada',operating_company:company,request_category:'servicios',service_type:'arriendo',waste_type:'Equipo HTTP '+company,origin:'Origen conservado',destination:'Destino conservado',rental_from:'2026-11-20',rental_to:'2026-11-19',estimated_kg:'',priority:'alta',notes:'Observaciones conservadas <revisar> & confirmar'};
   for(const [name,value] of Object.entries(values))original.data.set(name,value);
   let response=await post(path,original.data);assert.equal(response.status,200);body=(await response.text()).replace(/<!--[\s\S]*?-->/g,'');
   assert.match(body,/No se pudo registrar la solicitud/);assert.match(body,/Indique las fechas de inicio y término/);
   let failed=requestForm(body);
   assert.equal(selected(failed.form,'client_id'),client.id);assert.equal(selected(failed.form,'operating_company'),company);
   assert.equal(inputValue(failed.form,'submission_key'),key);assert.equal(inputValue(failed.form,'origin'),values.origin);assert.equal(inputValue(failed.form,'destination'),values.destination);
   assert.equal(inputValue(failed.form,'new_site_name'),values.new_site_name);assert.equal(inputValue(failed.form,'new_site_address'),values.new_site_address);
   assert.equal(inputValue(failed.form,'rental_from'),values.rental_from);assert.equal(inputValue(failed.form,'rental_to'),values.rental_to);
   assert.match(failed.form,/min="2026-11-20"/);assert.match(failed.form,/Observaciones conservadas &lt;revisar&gt; &amp; confirmar/);
   assert.equal(await openCount(company),baseline);
   assert.ok(!(await htmlPage(path)).includes(values.new_site_name),'el intento fallido tampoco crea el nuevo centro');
   for(const [name,value] of Object.entries(values))failed.data.set(name,value);failed.data.set('rental_to','2026-11-22');
   response=await post(path,failed.data);assert.equal(response.status,303);const target=response.headers.get('location');assert.ok(target&&/\/solicitudes\/[0-9a-f-]+\?ok=1/.test(target));
   assert.equal(await openCount(company),baseline+1);const repeat=await post(path,failed.data);assert.equal(repeat.status,303);assert.equal(repeat.headers.get('location'),target);assert.equal(await openCount(company),baseline+1);
   const fresh=await htmlPage(path);assert.match(fresh,new RegExp(values.new_site_name));
   outcomes.push({company,errorKeepsDraft:true,errorCreatesNoRequest:true,retryCreatesOneRequest:true,repeatedSubmitSameId:true});
  }
  const agenda=await htmlPage('/agenda?empresa=e_y_j&inicio=2026-11-16');assert.match(agenda,/href="\/solicitudes\?estado=solicitada&amp;empresa=e_y_j"/);assert.match(agenda,/aria-current="date"/);
  const clientPath='/solicitudes/nueva?empresa=rerchar';const clientForm=requestForm(await htmlPage(clientPath,'cliente'));assert.equal(inputValue(clientForm.form,'client_id'),client.id);
  for(const [k,v] of Object.entries({client_id:other.id,site_id:'',new_site_name:'No crear',operating_company:'rerchar',request_category:'servicios',service_type:'traslado',waste_type:'Material',origin:'Faena',destination:'Patio',priority:'normal'}))clientForm.data.set(k,v);
  const denied=await post(clientPath,clientForm.data,'cliente');assert.equal(denied.status,200);assert.match(await denied.text(),/No puede crear solicitudes para otro cliente/);
  assert.equal((await post(clientPath,clientForm.data,'')).status,303);
  const result={ok:true,forms:outcomes,companyContext:true,weeklyContextLink:true,clientScope:true,anonymousRedirect:true,productionMutations:false};await writeFile(work+'/http-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,evidenceDirectory:work}));
 }finally{try{process.kill(-server.pid!,'SIGTERM');}catch{}await writeFile(work+'/server.log',logs);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
