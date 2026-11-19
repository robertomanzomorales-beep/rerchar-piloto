import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CircleCheck, Truck, Wrench } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { listFleet } from "@/lib/pilot";
import {maintenanceContext,maintenanceHref,type MaintenanceContext} from "@/lib/maintenance-form-state";
import {MaintenanceForm} from "@/components/MaintenanceForms";
import { Notice, chileDate } from "@/components/UI";

const assetName: Record<string, string> = { camion: "Camión", rampa: "Rampla", equipo: "Equipo" };
const severityName: Record<string, string> = { baja: "Baja", media: "Media", alta: "Alta", critica: "Crítica" };
const observed=(value:Date|string|null,fallback:Date)=>value?chileDate(`${value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10)}T12:00:00Z`,false):chileDate(fallback);

export default async function Fleet({ searchParams }: { searchParams: Promise<MaintenanceContext&{error?:string;ok?:string}> }) {
  const actor = await requireActor();
  if (!canManage(actor)) redirect("/");
  const params = await searchParams;
  const { assets, incidents, totalIncidents, page, totalPages } = await listFleet(actor,Number(params.pagina));
  const context=maintenanceContext(params);
  if(Number(params.pagina)>page)redirect(maintenanceHref({...context,pagina:String(page)},"",{ok:params.ok,error:params.error},"fleet"));
  const available=assets.filter(asset=>asset.available).length;
  const equipmentAlerts=assets.reduce((sum,asset)=>sum+Number(asset.equipment_alerts),0);
  const incidentPage=(next:number)=>maintenanceHref({...context,pagina:String(next)},"averias",{},"fleet");
  return <div className="fleet-page">
    <div className="page-title-row"><div><div className="eyebrow">CONTINUIDAD OPERACIONAL</div><h1>Flota y averías</h1><p className="page-intro">Disponibilidad de camiones, ramplas y equipos conectada con el despacho.</p></div><Link className="button button-outline" href={maintenanceHref(context)}>Ver mantenimiento <ArrowRight size={16}/></Link></div>
    <Notice error={params.error} ok={params.ok}/>
    <div className="fleet-stats"><div><strong>{available}</strong><span>Disponibles</span></div><div className={assets.length>available?"fleet-stat-attention":undefined}><strong>{assets.length-available}</strong><span>No disponibles</span></div><div className={totalIncidents?"fleet-stat-attention":undefined}><strong>{totalIncidents}</strong><span>Averías abiertas</span></div><div><strong>{equipmentAlerts}</strong><span>Elementos por revisar</span></div></div>
    <div className="fleet-grid"><section className="section-card"><div className="section-heading"><div><div className="eyebrow">RECURSOS COMPARTIDOS</div><h2><Truck size={19}/> Estado de la flota <span className="count-pill">{assets.length}</span></h2></div><Link className="text-link" href="/maestros">Agregar activo</Link></div>
      {assets.length ? <ul className="fleet-assets">{assets.map((asset) => <li key={asset.id}>
        <span aria-hidden="true" className={`fleet-status-icon ${asset.available ? "available" : "stopped"}`}>{asset.available ? <CircleCheck size={18}/> : <AlertTriangle size={18}/>}</span>
        <span className="fleet-asset-copy"><Link className="table-main fleet-asset-id" href={`/flota/${asset.id}`}>{asset.plate||asset.code}</Link><span className="fleet-asset-label" title={asset.label}>{asset.label}</span><small>{asset.code} · {assetName[asset.kind] ?? asset.kind}{asset.reading_unit !== "sin" ? ` · ${Number(asset.current_reading).toLocaleString("es-CL")} ${asset.reading_unit}` : ""}</small>{Number(asset.equipment_alerts)>0&&<small className="fleet-equipment-alert">{asset.equipment_alerts} {Number(asset.equipment_alerts)===1?"elemento por revisar":"elementos por revisar"}</small>}</span>
        <span className={`fleet-state ${asset.available ? "available" : "stopped"}`}>{asset.available ? "Disponible" : Number(asset.open_incidents)>0?`${asset.open_incidents} ${Number(asset.open_incidents)===1?"avería":"averías"}`:Number(asset.blocking_orders)>0?"En mantenimiento":"No disponible"}</span>
      </li>)}</ul> : <p className="muted">Agregue activos desde Maestros para comenzar.</p>}</section>
      <section className="section-card maintenance-section" id="reportar-averia"><div className="section-heading"><div><div className="eyebrow">REGISTRO</div><h2><Wrench size={19}/> Reportar avería</h2></div></div><p className="helper-text">El activo deja de estar disponible para asignaciones nuevas. Revise también sus viajes ya programados.</p>
        <MaintenanceForm key={`report:${totalIncidents}`} kind="report" context={context} assets={assets}/>
      </section></div>
    <section className="section-card maintenance-section" id="averias"><div className="section-heading"><div><div className="eyebrow">SEGUIMIENTO</div><h2><AlertTriangle size={19}/> Averías abiertas</h2></div><span className="count-pill">{totalIncidents}</span></div>
      {totalIncidents>0&&<p className="helper-text">Primero las averías críticas y altas; luego las más recientes de cada nivel.{totalPages>1&&` Se muestran ${incidents.length} de ${totalIncidents}.`}</p>}
      {incidents.length ? <div className="incident-grid">{incidents.map((incident) => <article className="incident-card maintenance-section" key={incident.id} id={`averia-${incident.id}`}><div className="incident-head"><div><Link className="table-main" href={`/flota/${incident.asset_id}`}>{incident.code}</Link><span className="fleet-incident-asset" title={incident.asset_label}>{incident.asset_label}</span><span>{observed(incident.observed_on,incident.reported_at)} · {incident.reported_by_name}</span></div><span className={`incident-severity severity-${incident.severity}`}>{severityName[incident.severity]}</span></div><p>{incident.description}</p>{incident.source_service_id&&<Link className="text-link" href={`/solicitudes/${incident.source_service_id}`}>Ver servicio de origen</Link>}
        {incident.order_id?<div className="fleet-incident-order"><div><strong>{incident.order_status==="en_trabajo"?"Reparación en curso":"Orden de trabajo abierta"}</strong><p>La avería se resuelve al cerrar su orden de trabajo.</p></div><Link className="button button-outline" href={maintenanceHref(context,"",{},incident.order_id)}>Abrir OT-{String(incident.order_folio).padStart(5,"0")}</Link></div>
        :<MaintenanceForm kind="resolve" context={context} sourceId={incident.id} defaults={{id:incident.id}}/>}
      </article>)}</div> : <p className="muted">No hay averías pendientes. Los activos disponibles pueden utilizarse en nuevos despachos.</p>}
      {totalPages>1&&<nav className="records-pagination" aria-label="Páginas de averías"><span>{page>1&&<Link className="button button-outline" href={incidentPage(page-1)}>Anterior</Link>}</span><span>Página {page} de {totalPages} · {totalIncidents} averías</span><span>{page<totalPages&&<Link className="button button-outline" href={incidentPage(page+1)}>Siguiente</Link>}</span></nav>}
    </section>
  </div>;
}
