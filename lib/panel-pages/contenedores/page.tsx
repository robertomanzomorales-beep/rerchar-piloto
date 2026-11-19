import {createHash} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {Container,MapPin,ArrowLeftRight,AlertTriangle} from "lucide-react";
import {canManage,requireActor} from "@/lib/auth";
import {listContainers} from "@/lib/containers";
import {containerContext,containerHref,containerStatuses,type ContainerContext,type ContainerPageKey} from "@/lib/container-form-state";
import {lastRecordPage,recordPage,recordsPerPage} from "@/lib/record-pagination";
import {Notice,chileDate} from "@/components/UI";
import {ContainerForm} from "@/components/ContainerForms";
import {serviceFolio} from "@/lib/companies";

const amount=(value:string|number)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:2});
const day=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const movementLabels:Record<string,string>={alta:"Registro en patio",instalacion:"Instalación",retiro:"Retiro a patio",reubicacion:"Reubicación",traslado:"Traslado",fuera_servicio:"Fuera de servicio",reactivacion:"Reactivación"};
function Pages({context,name,page,total,anchor,label}:{context:ContainerContext;name:ContainerPageKey;page:number;total:number;anchor:string;label:string}){
  const pages=lastRecordPage(total);if(pages===1)return null;
  const href=(next:number)=>containerHref({...context,[name]:String(next)},anchor);
  return <nav className="records-pagination" aria-label={`Páginas de ${label}`}><span>{page>1&&<Link className="button button-outline" href={href(page-1)}>Anterior</Link>}</span><span>Página {page} de {pages} · {total} {label}</span><span>{page<pages&&<Link className="button button-outline" href={href(page+1)}>Siguiente</Link>}</span></nav>;
}
export default async function Containers({searchParams}:{searchParams:Promise<ContainerContext&{error?:string;ok?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const query=await searchParams,context=containerContext(query);
  const data=await listContainers(actor,{unitId:context.unidad,movementPage:recordPage(context.pagina_movimientos),recordPage:recordPage(context.pagina_registros)});
  const {containers,sites,services,movements,records,totalMovements,totalRecords}=data;
  const pages={pagina:Math.min(recordPage(context.pagina),lastRecordPage(containers.length)),pagina_movimientos:data.movementPage,pagina_registros:data.recordPage};
  const changed=(Object.keys(pages) as ContainerPageKey[]).filter(key=>query[key]!==undefined&&query[key]!==String(pages[key]));
  if(changed.length)redirect(containerHref({...context,...Object.fromEntries(Object.entries(pages).map(([key,value])=>[key,String(value)]))},changed[0]==="pagina"?"inventario-unidades":changed[0]==="pagina_registros"?"historial-registros":"historial-movimientos",{ok:query.ok,error:query.error}));
  const shown=containers.slice((pages.pagina-1)*recordsPerPage,pages.pagina*recordsPerPage),overdue=containers.filter(c=>c.status==="instalada"&&c.stay_days>=c.max_stay_days);
  const brief=containers.map(({id,code,kind,status,client_id,site_id,location_name,waste_type})=>({id,code,kind,status,client_id,site_id,location_name,waste_type}));
  const version=createHash("sha256").update(JSON.stringify([containers.map(x=>[x.id,x.updated_at]),totalMovements,totalRecords])).digest("hex");
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const manage=(id:string)=>containerHref({...context,unidad:id,pagina_movimientos:"1",pagina_registros:"1"},"movimiento-unidad");
  const selected=containers.find(x=>x.id===context.unidad);
  return <div className="containers-page">
    <div className="page-title-row"><div><div className="eyebrow">UNIDADES EN TERRENO</div><h1>Tolvas y contenedores</h1><p className="page-intro">Ubicación, contenido y permanencia de cada unidad, con sus traslados y mantenciones.</p></div><span className="title-icon"><Container size={23}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <div className="supply-summary"><div><strong>{containers.length}</strong><span>Unidades registradas</span></div><div><strong>{containers.filter(c=>c.status==="instalada").length}</strong><span>Instaladas en faena</span></div><div><strong>{overdue.length}</strong><span>Permanencias por revisar</span></div></div>
    {overdue.length>0&&<details className="container-overdue"><summary><AlertTriangle size={16}/><strong>{overdue.length} {overdue.length===1?"unidad alcanzó":"unidades alcanzaron"} el plazo de revisión</strong><span>Ver unidades</span></summary><ul>{overdue.map(c=><li key={c.id}><Link href={manage(c.id)}>{c.code}</Link><span>{c.stay_days} días · {c.site_name??c.location_name}</span></li>)}</ul></details>}
    <section className="section-card container-section" id="inventario-unidades"><div className="section-heading"><div><div className="eyebrow">UBICACIÓN VIGENTE</div><h2><MapPin size={19}/> Inventario de unidades</h2></div><span className="count-pill">{containers.length}</span></div>
      {shown.length?<div className="table-wrap" role="region" aria-label="Inventario de tolvas y contenedores" tabIndex={0}><table className="data-table container-inventory"><thead><tr><th>Unidad</th><th>Estado</th><th>Ubicación / contenido</th><th>Permanencia</th><th>Gestionar</th></tr></thead><tbody>{shown.map(c=><tr key={c.id} data-container-id={c.id}><td><strong>{c.code}</strong><span className="table-sub">{c.kind} · {amount(c.capacity_m3)} m³</span></td><td><span className={`badge container-${c.status}`}>{containerStatuses[c.status]}</span></td><td>{c.location_name}<span className="table-sub">{c.waste_type||"Sin contenido registrado"}</span></td><td>{c.status==="instalada"?<span className={c.stay_days>=c.max_stay_days?"inventory-low":"inventory-good"}>{c.stay_days} días<span className="table-sub">Revisión desde {c.max_stay_days} días</span></span>:"—"}</td><td><Link href={manage(c.id)} className="button button-outline" aria-label={`Gestionar ${c.code}`}>Gestionar</Link></td></tr>)}</tbody></table></div>:<p className="muted">Registre una unidad para comenzar el control de ubicaciones.</p>}
      <Pages context={context} name="pagina" page={pages.pagina} total={containers.length} anchor="inventario-unidades" label="unidades"/>
    </section>
    <section className="section-card container-section container-selection" id="historial-unidad"><form method="GET" action="/contenedores#historial-unidad" className="container-history-filter" key={context.unidad??"todas"} data-container-filter>
      {context.empresa&&<input type="hidden" name="empresa" value={context.empresa}/>}<input type="hidden" name="pagina" value={pages.pagina}/>
      <label>Unidad que desea consultar<select name="unidad" defaultValue={context.unidad??""}><option value="">Todas las unidades</option>{context.unidad&&!selected&&<option value={context.unidad}>Unidad anterior no disponible</option>}{containers.map(c=><option key={c.id} value={c.id}>{c.code} · {containerStatuses[c.status]}</option>)}</select></label><button type="submit" className="button button-outline">Consultar</button>{context.unidad&&<Link className="text-link" href={containerHref({empresa:context.empresa,pagina:context.pagina},"historial-unidad")}>Ver todas</Link>}
      </form><p className="helper-text">{context.unidad?`Mostrando el historial de ${selected?.code??"la unidad seleccionada"}. El inventario conserva todas las unidades.`:"Seleccione una unidad para preparar sus formularios y consultar su historial. El inventario es compartido entre ambas empresas."}</p></section>
    <div className="supply-columns container-entry-layout">
      <section className="section-card container-section" id="movimiento-unidad"><div className="section-heading"><div><div className="eyebrow">UBICACIÓN Y DISPONIBILIDAD</div><h2><MapPin size={19}/> Registrar movimiento</h2></div></div><ContainerForm key={`move:${context.unidad}:${version}`} kind="move" context={context} containers={brief} sites={sites} services={services}/></section>
      <section className="section-card container-section" id="nueva-unidad"><div className="section-heading"><div><div className="eyebrow">CATÁLOGO</div><h2><Container size={19}/> Nueva unidad</h2></div></div><ContainerForm key={`create:${version}`} kind="create" context={context}/></section>
    </div>
    <section className="section-card container-section" id="registro-unidad"><div className="section-heading"><div><div className="eyebrow">ARRIENDOS Y TRASLADOS</div><h2>Kilometrajes y mantenciones</h2></div></div><ContainerForm key={`record:${context.unidad}:${version}`} kind="record" context={context} containers={brief} sites={sites} services={services} today={today}/>
      <div className="container-history-heading container-section" id="historial-registros"><h3>Historial de kilometrajes y mantenciones</h3><span className="count-pill">{totalRecords}</span></div>
      {records.length?<div className="table-wrap" role="region" aria-label="Kilometrajes y mantenciones de unidades" tabIndex={0}><table className="data-table container-records"><thead><tr><th>Fecha / unidad</th><th>Tipo / detalle</th><th>Kilómetros</th><th>Costo</th><th>Responsable / servicio</th></tr></thead><tbody>{records.map(r=><tr key={r.id} data-container-record={r.id}><td>{chileDate(`${day(r.record_date)}T12:00:00Z`,false)}<span className="table-sub">{r.code}</span></td><td>{r.kind==="mantenimiento"?"Mantención":"Kilometraje"}<span className="table-sub container-record-description">{r.description}</span></td><td>{r.kilometers!==null?`${amount(r.kilometers)} km`:"—"}</td><td>{r.cost_clp!==null?`$${amount(r.cost_clp)}`:"—"}</td><td>{r.actor_name}{r.service_id&&<span className="table-sub"><Link href={`/solicitudes/${r.service_id}`}>{serviceFolio({folio:r.service_folio??"",operating_company:r.service_company})}</Link></span>}</td></tr>)}</tbody></table></div>:<p className="muted">{context.unidad?"Esta unidad no tiene kilometrajes ni mantenciones registrados.":"No hay kilometrajes ni mantenciones registrados."}</p>}
      <Pages context={context} name="pagina_registros" page={pages.pagina_registros} total={totalRecords} anchor="historial-registros" label="registros"/>
    </section>
    <section className="section-card container-section" id="historial-movimientos"><div className="section-heading"><div><div className="eyebrow">TRAZABILIDAD</div><h2><ArrowLeftRight size={19}/> Historial de movimientos</h2></div><span className="count-pill">{totalMovements}</span></div>
      {movements.length?<ol className="container-events">{movements.map(m=><li key={m.id} data-container-movement={m.id}><div className="container-event-top"><strong>{m.code} · {movementLabels[m.kind]??m.kind}</strong><small>{chileDate(m.created_at)}</small></div><span>{m.previous_location?`${m.previous_location} → `:""}{m.next_location}</span>{(m.previous_waste_type||m.next_waste_type)&&<small>Contenido: {m.previous_waste_type||"Sin registro"} → {m.next_waste_type||"Sin contenido registrado"}</small>}<p>{m.note}</p><small>{m.actor_name}{m.service_id&&<> · <Link href={`/solicitudes/${m.service_id}`}>{serviceFolio({folio:m.service_folio??"",operating_company:m.service_company})}</Link></>}</small>{m.photo_id&&<Link href={`/api/contenedores/movimientos/${m.id}/foto`} className="text-link">Descargar foto · {m.photo_filename}</Link>}</li>)}</ol>:<p className="muted">{context.unidad?"Esta unidad no tiene movimientos registrados.":"El historial se genera al registrar, instalar o retirar una unidad."}</p>}
      <Pages context={context} name="pagina_movimientos" page={pages.pagina_movimientos} total={totalMovements} anchor="historial-movimientos" label="movimientos"/>
    </section>
  </div>;
}
