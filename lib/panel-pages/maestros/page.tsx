import {createHash} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {Boxes,Building2,MapPin,Truck,Users} from "lucide-react";
import {canManage,requireActor} from "@/lib/auth";
import {listMasters} from "@/lib/masters";
import {masterAnchor,masterContext,masterHref,matchesMaster,type MasterContext,type MasterPageKey} from "@/lib/master-form-state";
import {lastRecordPage,recordPage,recordsPerPage} from "@/lib/record-pagination";
import {MasterForm} from "@/components/MasterForms";
import {Notice} from "@/components/UI";

const assetKind:Record<string,string>={camion:"Camión",rampa:"Rampla",equipo:"Equipo"};
function Pages({context,name,page,total,anchor}:{context:MasterContext;name:MasterPageKey;page:number;total:number;anchor:string}){
  const pages=lastRecordPage(total);if(pages===1)return null;
  const href=(next:number)=>masterHref({...context,[name]:String(next)},anchor);
  return <nav className="records-pagination" aria-label={`Páginas de ${anchor}`}><span>{page>1&&<Link href={href(page-1)} className="button button-outline">Anterior</Link>}</span><span>Página {page} de {pages} · {total} registros</span><span>{page<pages&&<Link href={href(page+1)} className="button button-outline">Siguiente</Link>}</span></nav>;
}
function visible<T extends {id:string}>(rows:T[],page:number,focused:string|undefined){
  const result=rows.slice((page-1)*recordsPerPage,page*recordsPerPage);const selected=rows.find(x=>x.id===focused);
  return selected&&!result.some(x=>x.id===selected.id)?[selected,...result]:result;
}
export default async function Masters({searchParams}:{searchParams:Promise<MasterContext&{error?:string;ok?:string;formulario?:string;edicion?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const query=await searchParams,context=masterContext(query),all=await listMasters(actor);
  const filteredClients=all.clients.filter(c=>matchesMaster(context.q,[c.name,c.tax_id,c.contact_name,c.email,c.address]));
  const filteredSites=all.sites.filter(s=>matchesMaster(context.q,[s.name,s.client_name,s.address]));
  const filteredAssets=all.assets.filter(a=>matchesMaster(context.q,[a.code,a.label,a.plate,assetKind[a.kind]]));
  const pages={pagina_clientes:Math.min(recordPage(context.pagina_clientes),lastRecordPage(filteredClients.length)),pagina_centros:Math.min(recordPage(context.pagina_centros),lastRecordPage(filteredSites.length)),pagina_activos:Math.min(recordPage(context.pagina_activos),lastRecordPage(filteredAssets.length))};
  if((Object.keys(pages) as MasterPageKey[]).some(key=>query[key]!==undefined&&query[key]!==String(pages[key])))redirect(masterHref({...context,...Object.fromEntries(Object.entries(pages).map(([key,value])=>[key,String(value)]))},"",{ok:query.ok,error:query.error,formulario:query.formulario,edicion:query.edicion}));
  const focused=(kind:string)=>query.formulario===kind?query.edicion:undefined;
  const clients=visible(filteredClients,pages.pagina_clientes,focused("edit_client")),sites=visible(filteredSites,pages.pagina_centros,focused("edit_site")),assets=visible(filteredAssets,pages.pagina_activos,focused("edit_asset"));
  const extraClient=all.clients.find(x=>x.id===focused("edit_client")&&!clients.some(y=>y.id===x.id));if(extraClient)clients.unshift(extraClient);
  const extraSite=all.sites.find(x=>x.id===focused("edit_site")&&!sites.some(y=>y.id===x.id));if(extraSite)sites.unshift(extraSite);
  const extraAsset=all.assets.find(x=>x.id===focused("edit_asset")&&!assets.some(y=>y.id===x.id));if(extraAsset)assets.unshift(extraAsset);
  const version=createHash("sha256").update(JSON.stringify([all.clients,all.sites,all.assets])).digest("hex");
  const companyQuery=context.empresa?`?empresa=${context.empresa}`:"";
  return <div className="masters-page">
    <div className="page-title-row"><div><div className="eyebrow">CONFIGURACIÓN BASE</div><h1>Maestros de operación</h1><p className="page-intro">Clientes, centros y activos disponibles para preparar las solicitudes.</p></div><span className="title-icon"><Boxes size={24}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <form key={context.q??""} action="/maestros" method="GET" className="master-search" data-master-search>{context.empresa&&<input type="hidden" name="empresa" value={context.empresa}/>}<label>Buscar en maestros<input name="q" type="search" maxLength={160} defaultValue={context.q??""} placeholder="Cliente, RUT, faena, código o patente"/></label><button className="button button-outline" type="submit">Buscar</button>{context.q&&<Link href={masterHref({empresa:context.empresa})} className="text-link">Limpiar búsqueda</Link>}</form>
    <p className="helper-text">Puede corregir nombres, contactos, direcciones y patentes sin perder los servicios vinculados. La empresa de una faena y el código o tipo de un activo se conservan para mantener su historial.</p>
    <nav className="client-section-links" aria-label="Secciones de maestros"><a href="#clientes">Clientes <span>{filteredClients.length}</span></a><a href="#centros">Centros y faenas <span>{filteredSites.length}</span></a><a href="#activos">Activos <span>{filteredAssets.length}</span></a></nav>
    <div className="master-grid">
      <section id="clientes" className="section-card master-section"><div className="section-heading"><div><div className="eyebrow">FICHAS COMERCIALES</div><h2><Building2 size={19}/> Clientes</h2></div><span className="count-pill">{filteredClients.length}</span></div><p className="helper-text">Registre la ficha comercial. Si el cliente necesita ingresar al portal, su cuenta se crea desde Usuarios y accesos.</p><MasterForm key={`client:${version}`} kind="client" context={context}/>
        <ul className="record-list master-records">{clients.map(c=><li key={c.id} id={masterAnchor("edit_client",c.id)} className="master-section" data-master-client={c.id}><details className="master-entry" open={focused("edit_client")===c.id}><summary><span className="master-entry-name"><strong>{c.name}</strong><small>{[c.tax_id,c.contact_name,c.email].filter(Boolean).join(" · ")||"Sin datos de contacto"}</small></span><span className="master-edit-hint">Editar</span></summary>{context.q&&!filteredClients.some(x=>x.id===c.id)&&<p className="helper-text">Ficha seleccionada para edición, fuera de la búsqueda actual.</p>}<MasterForm key={JSON.stringify(c)} kind="edit_client" context={context} defaults={{id:c.id,name:c.name,tax_id:c.tax_id??"",contact_name:c.contact_name??"",email:c.email??"",address:c.address??""}}/><Link href={`/clientes/${c.id}${companyQuery}`} className="text-link master-folder-link">Abrir carpeta del cliente</Link></details></li>)}</ul>{!clients.length&&<p className="muted">{context.q?"No hay clientes con esta búsqueda.":"Sin clientes registrados."}</p>}<Pages context={context} name="pagina_clientes" page={pages.pagina_clientes} total={filteredClients.length} anchor="clientes"/>
      </section>
      <section id="centros" className="section-card master-section"><div className="section-heading"><div><div className="eyebrow">UBICACIONES DE SERVICIO</div><h2><MapPin size={19}/> Centros y faenas</h2></div><span className="count-pill">{filteredSites.length}</span></div><MasterForm key={`site:${version}`} kind="site" context={context} clients={all.clients}/>
        <ul className="record-list master-records">{sites.map(s=><li key={s.id} id={masterAnchor("edit_site",s.id)} className="master-section" data-master-site={s.id}><details className="master-entry" open={focused("edit_site")===s.id}><summary><span className="master-entry-name"><strong>{s.name}</strong><small>{s.client_name}{s.address?` · ${s.address}`:""}</small></span><span className="master-edit-hint">Editar</span></summary>{context.q&&!filteredSites.some(x=>x.id===s.id)&&<p className="helper-text">Ficha seleccionada para edición, fuera de la búsqueda actual.</p>}<MasterForm key={JSON.stringify(s)} kind="edit_site" context={context} defaults={{id:s.id,name:s.name,address:s.address??""}} locked={`Cliente: ${s.client_name}`}/></details></li>)}</ul>{!sites.length&&<p className="muted">{context.q?"No hay centros con esta búsqueda.":"Sin centros registrados."}</p>}<Pages context={context} name="pagina_centros" page={pages.pagina_centros} total={filteredSites.length} anchor="centros"/>
      </section>
      <section id="activos" className="section-card master-section"><div className="section-heading"><div><div className="eyebrow">FLOTA Y EQUIPOS</div><h2><Truck size={19}/> Activos</h2></div><span className="count-pill">{filteredAssets.length}</span></div><MasterForm key={`asset:${version}`} kind="asset" context={context}/>
        <ul className="record-list master-records">{assets.map(a=><li key={a.id} id={masterAnchor("edit_asset",a.id)} className="master-section" data-master-asset={a.id}><details className="master-entry" open={focused("edit_asset")===a.id}><summary><span className="master-entry-name"><strong>{a.plate||a.label}</strong><small>{a.code} · {assetKind[a.kind]??a.kind}{a.plate&&a.label!==a.plate?` · ${a.label}`:""}</small></span><span className="master-edit-hint">Editar</span></summary>{context.q&&!filteredAssets.some(x=>x.id===a.id)&&<p className="helper-text">Ficha seleccionada para edición, fuera de la búsqueda actual.</p>}<MasterForm key={JSON.stringify(a)} kind="edit_asset" context={context} defaults={{id:a.id,plate:a.plate??"",label:a.label}} locked={`Código y tipo: ${a.code} · ${assetKind[a.kind]??a.kind}`}/></details></li>)}</ul>{!assets.length&&<p className="muted">{context.q?"No hay activos con esta búsqueda.":"Sin activos registrados."}</p>}<Pages context={context} name="pagina_activos" page={pages.pagina_activos} total={filteredAssets.length} anchor="activos"/>
      </section>
      {actor.role==="admin"&&<section className="section-card master-section"><div className="section-heading"><div><div className="eyebrow">ACCESOS</div><h2><Users size={19}/> Usuarios y perfiles</h2></div><span className="count-pill">{all.activeUsers} activos</span></div><p className="helper-text">Administre cuentas y perfiles en su espacio dedicado. Cada cuenta Cliente consulta la empresa que tiene asignada.</p><Link href={`/usuarios${companyQuery}`} className="button button-outline">Administrar usuarios</Link></section>}
    </div>
  </div>;
}
