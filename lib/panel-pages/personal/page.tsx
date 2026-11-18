import {redirect} from "next/navigation";
import {ShieldCheck,UserRound,CalendarClock,MapPin} from "lucide-react";
import {canManage,requireActor} from "@/lib/auth";
import {listCredentialAlerts,listPersonnel,type Credential,type ExternalCredential,type Requirement} from "@/lib/personnel";
import {Notice,chileDate} from "@/components/UI";
import {PersonnelForm} from "@/components/PersonnelForms";
import RecordsPagination from "@/components/RecordsPagination";
import {lastRecordPage,recordPage,recordsPerPage} from "@/lib/record-pagination";
import {personnelContext,personnelHref,personnelPageKeys,type PersonnelContext,type PersonnelPageKey} from "@/lib/personnel-form-state";

function iso(value:Date|string){return value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);}
const formatDay=(value:Date|string)=>chileDate(`${iso(value)}T12:00:00Z`,false);
type PersonnelQuery=PersonnelContext&{error?:string;ok?:string;edicion?:string;accion?:string;origen?:string};
function historyVersion(items:{created_at:Date}[]){return `${items.length}:${items.reduce((latest,item)=>Math.max(latest,item.created_at.getTime()),0)}`;}
function CredentialRows({items,source,requirements,today,administrator,context,query}:{items:(Credential|ExternalCredential)[];source:"propio"|"tercero";requirements:Requirement[];today:string;administrator:boolean;context:PersonnelContext;query:PersonnelQuery}){
  const byId=new Map(requirements.map(r=>[r.id,r])),kind=source==="propio"?"review":"external_review";
  return <ul className="personnel-records">{items.map(credential=>{
    const expires=iso(credential.expires_on),verified=credential.state==="verificada",future=verified&&iso(credential.issued_on)>today;
    const expired=verified&&expires<today,remaining=(new Date(`${expires}T12:00:00Z`).getTime()-new Date(`${today}T12:00:00Z`).getTime())/86400000;
    const warning=verified&&!future&&!expired&&remaining<=Number(byId.get(credential.requirement_id)?.warning_days??30);
    const label=future?"Vigencia futura":expired?"Vencida":warning?remaining===0?"Vence hoy":"Próxima a vencer":credential.state;
    return <li key={credential.id} id={`documento-${source}-${credential.id}`} className="personnel-section">
      <strong>{credential.worker_name} · {credential.requirement_name}</strong><small>{credential.client_name} / {credential.site_name??"Todas las faenas"} · ref. {credential.reference}</small>
      <small>Emisión {formatDay(credential.issued_on)} · vence {formatDay(credential.expires_on)}</small>
      <span className={verified&&!future&&!expired&&!warning?"inventory-good":"inventory-low"}>{label}</span>
      {credential.review_note&&<small>Revisión: {credential.review_note}</small>}
      {administrator&&credential.state==="pendiente"&&<div className="credential-actions">
        <PersonnelForm kind={kind} id={credential.id} decision="verificada" context={context}/>
        <PersonnelForm kind={kind} id={credential.id} decision="rechazada" context={context}/>
      </div>}
      {administrator&&verified&&<details className="small-action" data-review={credential.id} open={query.edicion===credential.id&&query.accion==="revocada"&&query.origen===kind}><summary>Revocar</summary><PersonnelForm kind={kind} id={credential.id} decision="revocada" context={context}/></details>}
    </li>;
  })}</ul>;
}

export default async function Personnel({searchParams}:{searchParams:Promise<PersonnelQuery>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const query=await searchParams,company=query.empresa==="rerchar"||query.empresa==="e_y_j"?query.empresa:undefined;
  const validity=query.vigencia==="vencidas"||query.vigencia==="proximas"?query.vigencia:"todas";
  const [{workers,clients,sites,requirements,credentials,externalDrivers,externalCredentials},allExpiryAlerts]=await Promise.all([listPersonnel(actor),listCredentialAlerts(actor,company)]);
  const expiryAlerts=allExpiryAlerts.filter(alert=>validity==="vencidas"?alert.days_left<0:validity==="proximas"?alert.days_left>=0:true);
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const activeDrivers=workers.filter(worker=>worker.role==="conductor"),pending=[...credentials,...externalCredentials].filter(d=>d.state==="pendiente").length;
  const expired=allExpiryAlerts.filter(d=>d.days_left<0).length,upcoming=allExpiryAlerts.length-expired;
  const current=(d:Credential|ExternalCredential)=>d.state==="verificada"&&iso(d.issued_on)<=today&&iso(d.expires_on)>=today;
  const internalValid=new Set(credentials.filter(current).map(d=>`${d.user_id}:${d.requirement_id}`)),externalValid=new Set(externalCredentials.filter(current).map(d=>`${d.external_driver_id}:${d.requirement_id}`));
  const coverage=sites.flatMap(site=>{const required=requirements.filter(r=>r.client_id===site.client_id&&(!r.site_id||r.site_id===site.id));return required.length?activeDrivers.map(worker=>({site,worker,missing:required.filter(r=>!internalValid.has(`${worker.id}:${r.id}`))})):[];});
  const externalCoverage=sites.flatMap(site=>{const required=requirements.filter(r=>r.client_id===site.client_id&&(!r.site_id||r.site_id===site.id));return required.length?externalDrivers.map(driver=>({site,driver,missing:required.filter(r=>!externalValid.has(`${driver.id}:${r.id}`))})):[];});
  const totals:Record<PersonnelPageKey,number>={pagina_documentos:credentials.length,pagina_terceros:externalCredentials.length,pagina_habilitacion:coverage.length,pagina_habilitacion_terceros:externalCoverage.length};
  const pages=Object.fromEntries(personnelPageKeys.map(key=>[key,Math.min(recordPage(query[key]),lastRecordPage(totals[key]))])) as Record<PersonnelPageKey,number>;
  const context=personnelContext({...query,...Object.fromEntries(personnelPageKeys.map(key=>[key,String(pages[key])]))});
  if(personnelPageKeys.some(key=>pages[key]!==recordPage(query[key])))redirect(personnelHref(context,"",{error:query.error,ok:query.ok,edicion:query.edicion,accion:query.accion,origen:query.origen}));
  const pageHref=(key:PersonnelPageKey,page:number,anchor:string)=>personnelHref({...context,[key]:String(page)},anchor);
  function pageItems<T>(items:T[],key:PersonnelPageKey){return items.slice((pages[key]-1)*recordsPerPage,pages[key]*recordsPerPage);}
  const pagination=(key:PersonnelPageKey,anchor:string,label:string)=><RecordsPagination page={pages[key]} total={totals[key]} href={page=>pageHref(key,page,anchor)} label={label}/>;
  const requirementVersion=requirements.map(r=>r.id).join(",");
  return <div className="personnel-page">
    <div className="page-title-row"><div><div className="eyebrow">HABILITACIÓN POR FAENA</div><h1>Personal y acreditaciones</h1><p className="page-intro">Registre requisitos, fechas de vigencia y verificaciones antes de asignar conductores.</p></div><span className="title-icon"><ShieldCheck size={23}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <div className="fleet-stats"><div><strong>{activeDrivers.length} + {externalDrivers.length}</strong><span>Propios + terceros</span></div><div><strong>{pending}</strong><span>Documentos por revisar</span></div><div><strong>{expired}</strong><span>Acreditaciones vencidas</span></div><div><strong>{upcoming}</strong><span>Próximas a vencer</span></div></div>
    <section className="section-card personnel-section" id="vencimientos"><div className="section-heading"><div><div className="eyebrow">VIGENCIA POR CLIENTE Y FAENA</div><h2><CalendarClock size={19}/> Alertas de acreditación</h2></div><span className="count-pill">{expiryAlerts.length}</span></div>
      <form key={`${company}:${validity}`} action="/personal#vencimientos" method="GET" className="filters">
        {personnelPageKeys.filter(key=>context[key]).map(key=><input key={key} type="hidden" name={key} value={context[key]}/>)}
        <label>Empresa de la alerta<select name="empresa" defaultValue={company??""}><option value="">Todas las empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><label>Vigencia<select name="vigencia" defaultValue={validity}><option value="todas">Todas las alertas</option><option value="vencidas">Vencidas</option><option value="proximas">Próximas a vencer</option></select></label><button className="button button-outline" type="submit">Aplicar</button>
      </form>
      <p className="helper-text">Cada requisito usa su plazo de aviso, inicialmente 30 días. Se considera el documento verificado de mayor vigencia que ya inició su período; una renovación futura no oculta una alerta vigente.</p>
      {expiryAlerts.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Conductor</th><th>Cliente / faena</th><th>Requisito</th><th>Vencimiento</th><th>Estado</th></tr></thead><tbody>{expiryAlerts.map(a=><tr key={a.id}><td><strong>{a.worker_name}</strong><span className="table-sub">{a.source==="tercero"?"Tercero":"Propio"}</span></td><td>{a.client_name}<span className="table-sub">{a.site_name??"Todas las faenas"}</span></td><td>{a.requirement_name}</td><td>{formatDay(a.expires_on)}</td><td><span className="inventory-low">{a.days_left<0?"Vencida":a.days_left===0?"Vence hoy":`${a.days_left} día(s) restantes`}</span></td></tr>)}</tbody></table></div>:<p className="muted">No hay acreditaciones verificadas dentro del plazo de aviso o vencidas.</p>}
    </section>
    <section className="section-card personnel-section" id="habilitacion-propios"><div className="section-heading"><div><div className="eyebrow">DESPACHO</div><h2><MapPin size={19}/> Habilitación por conductor y faena</h2></div><span className="count-pill">{coverage.length}</span></div>
      <p className="helper-text">Un conductor con requisitos pendientes, vencidos o rechazados no puede ser programado en esa faena. Cuando una faena no tiene requisitos configurados, la planificación sigue disponible.</p>
      {coverage.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Conductor</th><th>Cliente / faena</th><th>Estado</th><th>Requisitos pendientes</th></tr></thead><tbody>{pageItems(coverage,"pagina_habilitacion").map(({site,worker,missing})=><tr key={`${worker.id}:${site.id}`} data-coverage-key={`${worker.id}:${site.id}`}><td><strong>{worker.name}</strong></td><td>{site.client_name}<span className="table-sub">{site.name}</span></td><td>{missing.length?<span className="inventory-low">Faltan {missing.length}</span>:<span className="inventory-good">Habilitado</span>}</td><td>{missing.map(r=>r.name).join(" · ")||"—"}</td></tr>)}</tbody></table></div>:<p className="muted">Al definir requisitos para una faena aparecerá aquí su matriz de habilitación.</p>}
      {pagination("pagina_habilitacion","habilitacion-propios","Páginas de habilitación de conductores propios")}
    </section>
    <section className="section-card personnel-section" id="conductores-terceros"><div className="section-heading"><div><div className="eyebrow">TRANSPORTISTAS EXTERNOS</div><h2><UserRound size={19}/> Conductores terceros sin cuenta</h2></div><span className="count-pill">{externalDrivers.length}</span></div>
      <p className="helper-text">La cuenta de operaciones registra la salida y los respaldos. La acreditación por faena se exige también a estos conductores; un documento pendiente o vencido bloquea la programación y el inicio de ruta.</p>
      <div className="supply-columns">
        <div><h3>Registrar conductor tercero</h3><PersonnelForm key={externalDrivers.map(d=>d.id).join(",")} kind="external_driver" context={context}/><ul className="record-list">{externalDrivers.map(driver=><li key={driver.id}><strong>{driver.name}</strong><small>{driver.company_name} · RUT {driver.tax_id}{driver.phone?` · ${driver.phone}`:""}</small></li>)}</ul></div>
        <div id="registro-tercero" className="personnel-section"><h3>Acreditación del tercero</h3><PersonnelForm key={`${historyVersion(externalCredentials)}:${requirementVersion}`} kind="external_credential" context={context} externalDrivers={externalDrivers} requirements={requirements}/></div>
      </div>
      {externalCoverage.length>0&&<section id="habilitacion-terceros" className="personnel-section"><h3>Habilitación de terceros por faena</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>Conductor tercero</th><th>Cliente / faena</th><th>Estado</th><th>Requisitos pendientes</th></tr></thead><tbody>{pageItems(externalCoverage,"pagina_habilitacion_terceros").map(({site,driver,missing})=><tr key={`${driver.id}:${site.id}`} data-coverage-key={`${driver.id}:${site.id}`}><td><strong>{driver.name}</strong><span className="table-sub">{driver.company_name}</span></td><td>{site.client_name}<span className="table-sub">{site.name}</span></td><td>{missing.length?<span className="inventory-low">Faltan {missing.length}</span>:<span className="inventory-good">Habilitado</span>}</td><td>{missing.map(r=>r.name).join(" · ")||"—"}</td></tr>)}</tbody></table></div>{pagination("pagina_habilitacion_terceros","habilitacion-terceros","Páginas de habilitación de conductores terceros")}</section>}
      <div id="documentos-terceros" className="personnel-section"><div className="section-heading"><h3>Documentos de terceros y revisión</h3><span className="count-pill">{externalCredentials.length}</span></div>
        {externalCredentials.length?<CredentialRows items={pageItems(externalCredentials,"pagina_terceros")} source="tercero" requirements={requirements} today={today} administrator={actor.role==="admin"} context={context} query={query}/>:<p className="muted">No hay documentos de terceros registrados.</p>}
        {pagination("pagina_terceros","documentos-terceros","Páginas de documentos de terceros")}
      </div>
    </section>
    <div className="supply-columns">
      <section className="section-card personnel-section" id="fichas-personal"><div className="section-heading"><div><div className="eyebrow">FICHA DEL TRABAJADOR</div><h2><UserRound size={19}/> Datos de operación</h2></div></div><PersonnelForm key={workers.map(w=>`${w.id}:${w.profile_updated_at?.toISOString()??""}`).join(",")} kind="profile" context={context} workers={workers}/><ul className="record-list">{workers.map(worker=><li key={worker.id}><strong>{worker.name}</strong><small>{worker.employer==="e_y_j"?"E y J Limitada":"RERCHAR Chile SpA"} · {worker.position||worker.role} · {worker.shift||"Sin turno"}</small></li>)}</ul></section>
      <section className="section-card personnel-section" id="requisitos-personal"><div className="section-heading"><div><div className="eyebrow">REGLAS POR CLIENTE</div><h2><ShieldCheck size={19}/> Agregar requisito</h2></div></div><PersonnelForm key={requirementVersion} kind="requirement" context={context} clients={clients} sites={sites}/>
        <ul className="record-list">{requirements.map(requirement=><li key={requirement.id} id={`requisito-${requirement.id}`} className="personnel-section"><div><strong>{requirement.name}</strong><small>{requirement.client_name} · {requirement.site_name??"Todas las faenas"}</small></div>{actor.role==="admin"&&<details className="small-action" open={query.edicion===requirement.id&&query.origen==="disable"}><summary>Desactivar</summary><PersonnelForm kind="disable" id={requirement.id} context={context}/></details>}</li>)}</ul></section>
      <section className="section-card personnel-section" id="registro-propio"><div className="section-heading"><div><div className="eyebrow">VIGENCIAS</div><h2><CalendarClock size={19}/> Registrar documento</h2></div></div><p className="helper-text">La referencia identifica el documento o respaldo. Un administrador debe verificar sus fechas antes de habilitar al conductor.</p><PersonnelForm key={`${historyVersion(credentials)}:${requirementVersion}`} kind="credential" context={context} workers={workers} requirements={requirements}/></section>
      <section className="section-card personnel-section" id="documentos-propios"><div className="section-heading"><div><div className="eyebrow">REVISIÓN</div><h2>Documentos y decisiones</h2></div><span className="count-pill">{credentials.length}</span></div>
        {credentials.length?<CredentialRows items={pageItems(credentials,"pagina_documentos")} source="propio" requirements={requirements} today={today} administrator={actor.role==="admin"} context={context} query={query}/>:<p className="muted">No hay documentos de acreditación registrados.</p>}
        {pagination("pagina_documentos","documentos-propios","Páginas de documentos de conductores propios")}
      </section>
    </div>
  </div>;
}
