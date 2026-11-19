import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-clients-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");let server:ChildProcess|undefined,logs="";
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const actions=new WeakMap<FormData,string>();
  function formFrom(body:string,marker:string,source?:string){
    const forms=body.match(/<form\b[\s\S]*?<\/form>/g)||[];
    const form=forms.find(x=>x.includes(marker)&&(source===undefined||(source?x.includes(`data-source-id="${source}"`):!x.includes('data-source-id='))));assert.ok(form,marker+":"+source);const data=new FormData();
    for(const tag of form.match(/<input\b[^>]*>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name&&!(/type="checkbox"/.test(tag)&&!tag.includes('checked=""')))data.set(decode(name),decode(tag.match(/\bvalue="([^"]*)"/)?.[1]??(/type="checkbox"/.test(tag)?"on":"")));}
    for(const tag of form.match(/<select\b[\s\S]*?<\/select>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name){const options=tag.match(/<option\b[^>]*>/g)||[],selected=options.find(x=>x.includes('selected=""'))??options[0];data.set(name,decode(selected?.match(/\bvalue="([^"]*)"/)?.[1]??""));}}
    for(const tag of form.match(/<textarea\b[\s\S]*?<\/textarea>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(name,decode(tag.slice(tag.indexOf(">")+1,tag.indexOf("</textarea>"))));}
    const action=decode(form.match(/\baction="([^"]*)"/)?.[1]??"");if(action)actions.set(data,action);return {form,data};
  }
  const fill=(data:FormData,values:Record<string,string>)=>{for(const [key,value]of Object.entries(values))data.set(key,value);};
  function retained(body:string,marker:string,values:Record<string,string>,source?:string){const result=formFrom(body,marker,source);for(const [key,value]of Object.entries(values))assert.equal(String(result.data.get(key)??""),value,key);assert.match(body,/Los datos ingresados se conservan/);return result;}
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const clients=await db.query<{id:string}>("INSERT INTO clients(name,tax_id,contact_name,email,address) SELECT 'HTTP Cliente '||lpad(n::text,3,'0'),'RUT-'||n,'Contacto HTTP','contacto@example.invalid','Dirección HTTP' FROM generate_series(1,213) n RETURNING id");
    const [archived]=await db.query<{id:string}>("INSERT INTO clients(name,contact_name,deleted_at) VALUES('Cliente archivado','Contacto',now()) RETURNING id");
    const sites=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name,address) SELECT $1,'HTTP Faena '||lpad(n::text,3,'0'),'Dirección faena' FROM generate_series(1,217) n RETURNING id",[clients[0].id]);
    const [foreignSite]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena privada de otro cliente') RETURNING id",[clients[1].id]);
    const assets=await db.query<{id:string;code:string;plate:string}>("INSERT INTO assets(code,label,kind,plate) SELECT 'HTTP-A-'||lpad(n::text,3,'0'),'HTTP Camión '||n,'camion','XX'||lpad(n::text,4,'0') FROM generate_series(1,203) n RETURNING id,code,plate");
    const tokens:Record<string,string>={},users:Record<string,{id:string}>={};
    for(const role of ["admin","operaciones","conductor","cliente"] as const){
      const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id",[role+"@clients.example.invalid","Revisión "+role,role,clients[0].id]);users[role]=user;
      const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
    }
    const services=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,priority,created_by,operating_company,status,gross_kg,tare_kg,closed_at,created_at)
      SELECT gen_random_uuid(),$1,$2,'retiro','Metal HTTP','Faena','Patio','normal',$3,'rerchar','completada',10.5,2.25,'2026-10-01','2026-10-01' FROM generate_series(1,517) n RETURNING id`,[clients[0].id,sites[0].id,users.admin.id]);
    await db.query("UPDATE service_requests SET gross_kg=NULL,tare_kg=NULL WHERE id=$1",[services[516].id]);
    await db.query(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,created_by,operating_company,status,gross_kg,tare_kg,closed_at)
      SELECT gen_random_uuid(),$1,$2,'retiro','Metal E y J','Faena','Patio',$3,'e_y_j','completada',20,5,now() FROM generate_series(1,2) n`,[clients[0].id,sites[0].id,users.admin.id]);
    await db.query(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,created_by,operating_company,status)
      VALUES(gen_random_uuid(),$1,$2,'retiro','MATERIAL PRIVADO AJENO','Faena','Patio',$3,'e_y_j','solicitada')`,[clients[1].id,foreignSite.id,users.admin.id]);
    const photoBytes=Buffer.from("%PDF-1.4\n%%EOF");
    const documents=await db.query<{id:string}>(`INSERT INTO service_evidence(service_id,description,document_kind,created_by,created_at,storage_key,original_filename,mime_type,file_content)
      SELECT $1,'Archivo HTTP '||n,'otro',$2,'2026-10-01',gen_random_uuid()||'.pdf','respaldo.pdf','application/pdf',$3 FROM generate_series(1,421) n RETURNING id`,[services[0].id,users.admin.id,photoBytes]);
    await db.query(`INSERT INTO client_quotes(submission_key,client_id,issuer,client_name,title,issued_on,valid_until,status,created_by,created_at)
      SELECT gen_random_uuid(),$1,'rerchar','Cliente HTTP',CASE WHEN n<=200 THEN 'Cotización pública HTTP ' ELSE 'BORRADOR PRIVADO HTTP ' END||n,'2026-10-01','2026-11-01',CASE WHEN n<=200 THEN 'enviada' ELSE 'borrador' END,$2,'2026-10-01' FROM generate_series(1,217) n`,[clients[0].id,users.admin.id]);
    await db.query(`INSERT INTO material_receipts(client_id,kind,movement_on,site_name,weighing_ticket,material_name,net_basis,rerchar_kg,recorded_by,created_at)
      SELECT $1,'ingreso','2026-10-01','Faena HTTP','T-'||n,'Metal HTTP','rerchar',12,$2,'2026-10-01' FROM generate_series(1,213) n`,[clients[0].id,users.admin.id]);
    for(const s of services.slice(0,205))await db.query("INSERT INTO service_certificates(service_id,version,code,snapshot,issued_by,issued_at) VALUES($1,1,replace(gen_random_uuid()::text,'-','')||repeat('a',16),'{}',$2,'2026-10-01')",[s.id,users.admin.id]);
    const {createContract,createTariff}=await import("../lib/finance"),actor={...users.admin,name:"Admin HTTP",email:"admin@clients.example.invalid",role:"admin" as const,client_id:null};
    const contractId=await createContract(actor,{client_id:clients[0].id,site_id:sites[0].id,operating_company:"rerchar",code:"HTTP-CONT",starts_on:"2026-01-01",ends_on:"",notes:""});
    const tariffId=await createTariff(actor,{contract_id:contractId,service_type:"retiro",waste_type:"",unit:"servicio",unit_price_clp:"100",valid_from:"2026-01-01",valid_until:""});
    await db.query("INSERT INTO service_valuations(service_id,tariff_id,quantity,unit_price_clp,total_clp,created_by) SELECT id,$3,1,100,100,$2 FROM service_requests WHERE client_id=$1",[clients[0].id,users.admin.id,tariffId]);
    await db.query(`INSERT INTO service_invoices(valuation_id,invoice_number,issued_on,due_on,total_clp,created_by)
      SELECT id,'F-'||row_number() OVER(ORDER BY id),'2026-10-01','2026-11-01',100,$2 FROM service_valuations WHERE service_id=ANY($1::uuid[])`,[services.slice(0,207).map(x=>x.id),users.admin.id]);
    console.log(JSON.stringify({phase:"fixtures",ready:true}));
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(120000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,{},role);assert.equal(r.status,200);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const post=(path:string,data:FormData,role="admin")=>request(actions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
    const form=(body:string,kind:string,id="")=>formFrom(body,`data-master-form="${kind}"`,id);
    const keep=(body:string,kind:string,values:Record<string,string>,id="")=>retained(body,`data-master-form="${kind}"`,values,id);
    const ids=(body:string,attribute:string)=>[...body.matchAll(new RegExp(`${attribute}="([^"]+)"`,"g"))].map(x=>x[1]);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const seenClients:string[]=[],seenSites:string[]=[],seenAssets:string[]=[],directory:string[]=[];
    for(let page=1;page<=3;page++){
      const body=await html(`/maestros?pagina_clientes=${page}&pagina_centros=${page}&pagina_activos=${page}`);seenClients.push(...ids(body,"data-master-client"));seenSites.push(...ids(body,"data-master-site"));seenAssets.push(...ids(body,"data-master-asset"));
      directory.push(...ids(await html(`/clientes?pagina=${page}&empresa=e_y_j`),"data-directory-client"));
    }
    for(const [rows,total]of [[seenClients,213],[seenSites,218],[seenAssets,203],[directory,213]] as const){assert.equal(rows.length,total);assert.equal(new Set(rows).size,total);}
    const folderId=clients[0].id,folderBase=`/clientes/${folderId}`;
    const attributes=["service","quote","certificate","invoice","receipt","document"],expected=[519,217,205,207,213,421],collected=attributes.map(()=>[] as string[]);
    for(let page=1;page<=6;page++){
      const context=Object.fromEntries(["servicios","cotizaciones","certificados","facturas","ingresos","archivos"].map((key,index)=>["pagina_"+key,String(Math.min(page,Math.ceil(expected[index]/100)))]));
      const body=await html(folderBase+"?"+new URLSearchParams({empresa:"e_y_j",...context}));
      for(const [index,attr]of attributes.entries())if(page<=Math.ceil(expected[index]/100))collected[index].push(...ids(body,"data-client-"+attr));
    }
    collected.forEach((rows,index)=>{assert.equal(rows.length,expected[index]);assert.equal(new Set(rows).size,expected[index]);});
    const portal=await html(folderBase,"cliente");assert.ok(!portal.includes("BORRADOR PRIVADO HTTP"));assert.ok(!portal.includes("MATERIAL PRIVADO AJENO"));assert.match(portal,/Mi panel/);
    const download=await request(`/api/evidencia/${documents[0].id}`,{},"cliente");assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),photoBytes);assert.equal((await request(`/api/evidencia/${documents[0].id}`,{},"conductor")).status,404);
    for(const [company,count]of [["rerchar",517],["e_y_j",2]] as const){const body=await html(`${folderBase}/resumen?empresa=${company}`,"cliente");assert.equal(ids(body,"data-client-retirement").length,count);if(company==="rerchar")assert.match(body,/1 retiro requiere/);}
    console.log(JSON.stringify({phase:"pagination",masterClients:213,masterSites:218,assets:203,services:519,documents:421,summaryRetirements:517}));
    const outcomes=[];
    for(const [index,company]of ["rerchar","e_y_j"].entries()){
      const role=index?"operaciones":"admin",context={empresa:company,q:"HTTP",pagina_clientes:"3",pagina_centros:"3",pagina_activos:"3"},path="/maestros?"+new URLSearchParams(context);
      const target=(r:Response,anchor:string)=>{assert.equal(r.status,303);const url=new URL(r.headers.get("location")!,base);assert.equal(url.pathname,"/maestros");assert.equal(url.hash,"#"+anchor);for(const [key,value]of Object.entries(context))assert.equal(url.searchParams.get(key),value,key);return url.pathname+url.search+url.hash;};
      let current=form(await html(path),"client"),clientValues={name:"HTTP Cliente nuevo "+company,tax_id:"RUT-HTTP",contact_name:"Contacto & prueba",email:"correo inválido",address:"Dirección conservada"};fill(current.data,clientValues);let r=await post(path,current.data,role);assert.equal(r.status,200);current=keep(clean(await r.text()),"client",clientValues);current.data.set("email","nuevo@example.invalid");target(await post(path,current.data,role),"clientes");assert.equal(form(await html(path),"client").data.get("name"),"");
      current=form(await html(path),"site");const siteValues={client_id:archived.id,name:"HTTP Faena nueva "+company,address:"Dirección & faena"};fill(current.data,siteValues);r=await post(path,current.data,role);assert.equal(r.status,200);current=keep(clean(await r.text()),"site",siteValues);assert.match(current.form,/Selección anterior no disponible/);current.data.set("client_id",clients[0].id);target(await post(path,current.data,role),"centros");
      current=form(await html(path),"asset");const assetValues={code:assets[0].code,kind:"equipo",plate:"",label:"HTTP Equipo nuevo "+company};fill(current.data,assetValues);r=await post(path,current.data,role);assert.equal(r.status,200);current=keep(clean(await r.text()),"asset",assetValues);current.data.set("code","HTTP-NUEVO-"+company);target(await post(path,current.data,role),"activos");
      const editPath=(kind:string,id:string)=>path+"&formulario="+kind+"&edicion="+id;
      current=form(await html(editPath("edit_client",clients[index].id)),"edit_client",clients[index].id);const editClient={id:clients[index].id,name:"X",tax_id:"RUT editado",contact_name:"Contacto editado",email:"edicion@example.invalid",address:"Dirección editada"};fill(current.data,editClient);r=await post(path,current.data,role);assert.equal(r.status,200);current=keep(clean(await r.text()),"edit_client",editClient,clients[index].id);current.data.set("name","Cliente renombrado "+company);const edited=target(await post(path,current.data,role),"client-"+clients[index].id);assert.match(await html(edited),/Ficha seleccionada para edición/);
      current=form(await html(editPath("edit_site",sites[index].id)),"edit_site",sites[index].id);const editSite={id:sites[index].id,name:"X",address:"Dirección nueva de la faena"};fill(current.data,editSite);r=await post(path,current.data,role);assert.equal(r.status,200);current=keep(clean(await r.text()),"edit_site",editSite,sites[index].id);current.data.set("name","Faena renombrada "+company);target(await post(path,current.data,role),"site-"+sites[index].id);
      const assetIndex=index+2;current=form(await html(editPath("edit_asset",assets[assetIndex].id)),"edit_asset",assets[assetIndex].id);const editAsset={id:assets[assetIndex].id,plate:assets[1].plate,label:"Descripción editada "+company};fill(current.data,editAsset);r=await post(path,current.data,role);assert.equal(r.status,200);current=keep(clean(await r.text()),"edit_asset",editAsset,assets[assetIndex].id);current.data.set("plate",index?"EYJ-100":"RER-100");target(await post(path,current.data,role),"asset-"+assets[assetIndex].id);
      outcomes.push({company,role,sixFormsRetainDrafts:true,pagesAndSearchPreserved:true,offPageEditorRetained:true,archivedClientRejected:true});console.log(JSON.stringify({phase:"forms",company,complete:true}));
    }
    for(const role of ["conductor","cliente",""]){const r=await request("/maestros",{},role),body=await r.text();assert.ok(r.status>=300&&r.status<400||body.includes("NEXT_REDIRECT"));assert.ok(!body.includes("data-master-form"));}
    for(const suffix of ["","/resumen?empresa=rerchar"]){const r=await request(`/clientes/${clients[2].id}${suffix}`,{},"cliente"),body=await r.text();assert.ok(r.status===404||body.includes("NEXT_HTTP_ERROR_FALLBACK;404"),"la carpeta ajena debe resolver a la pantalla de no disponible");assert.ok(!body.includes("data-client-service")&&!body.includes("data-client-retirement"),"la respuesta no debe incluir registros del cliente ajeno");}
    const search=await html("/clientes?buscar=NO-EXISTE&empresa=e_y_j");assert.equal(ids(search,"data-directory-client").length,0);assert.match(search,/No hay clientes que coincidan/);
    const result={ok:true,cases:outcomes,masterPagination:true,directoryPagination:true,dossierTotals:expected,retirementsBeyond500:true,portalDraftProtection:true,crossClientProtection:true,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
