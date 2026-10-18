import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CircleCheck, Truck, Wrench } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { listFleet } from "@/lib/pilot";
import { reportFleetIncidentAction, resolveFleetIncidentAction } from "@/app/actions";
import { Notice, chileDate } from "@/components/UI";
import { SubmitButton } from "@/components/Transition";

const assetName: Record<string, string> = { camion: "Camión", rampa: "Rampa", equipo: "Equipo" };
const severityName: Record<string, string> = { baja: "Baja", media: "Media", alta: "Alta", critica: "Crítica" };
const observed=(value:Date|string|null,fallback:Date)=>value?chileDate(`${value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10)}T12:00:00Z`,false):chileDate(fallback);

export default async function Fleet({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const actor = await requireActor();
  if (!canManage(actor)) redirect("/");
  const { assets, incidents } = await listFleet(actor);
  const params = await searchParams;
  const equipmentAlerts=assets.reduce((sum,asset)=>sum+Number(asset.equipment_alerts),0);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">CONTINUIDAD OPERACIONAL</div><h1>Flota y averías</h1><p className="page-intro">Disponibilidad de camiones, rampas y equipos conectada con el despacho.</p></div><Link className="button button-outline" href="/mantenimiento">Ver mantenimiento <ArrowRight size={16}/></Link></div>
    <Notice error={params.error} ok={params.ok}/>
    <div className="fleet-stats"><div><strong>{assets.filter((a) => a.available).length}</strong><span>Disponibles</span></div><div><strong>{assets.filter((a) => !a.available).length}</strong><span>Detenidos</span></div><div><strong>{incidents.length}</strong><span>Averías abiertas</span></div><div><strong>{equipmentAlerts}</strong><span>Elementos por revisar</span></div></div>
    <div className="fleet-grid"><section className="section-card"><div className="section-heading"><div><div className="eyebrow">RECURSOS</div><h2><Truck size={19}/> Estado de la flota</h2></div><Link className="text-link" href="/maestros">Agregar activo <ArrowRight size={15}/></Link></div>
      {assets.length ? <ul className="fleet-assets">{assets.map((asset) => <li key={asset.id}><span className={`fleet-status-icon ${asset.available ? "available" : "stopped"}`}>{asset.available ? <CircleCheck size={19}/> : <AlertTriangle size={19}/>}</span><span><Link className="table-main" href={`/flota/${asset.id}`}>{asset.label}</Link><small>{asset.code} · {assetName[asset.kind] ?? asset.kind}{asset.plate ? ` · ${asset.plate}` : ""}{asset.reading_unit !== "sin" ? ` · ${Number(asset.current_reading).toLocaleString("es-CL")} ${asset.reading_unit}` : ""}{Number(asset.equipment_alerts)>0&&` · ${asset.equipment_alerts} elemento(s) por revisar`}</small></span><span className={`fleet-state ${asset.available ? "available" : "stopped"}`}>{asset.available ? "Disponible" : `${asset.open_incidents} avería(s)`}</span></li>)}</ul> : <p className="muted">Agregue activos desde Maestros para comenzar.</p>}</section>
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">REGISTRO</div><h2><Wrench size={19}/> Reportar avería</h2></div></div><p className="helper-text">Al reportarla, el activo deja de estar disponible para asignaciones nuevas. Revise los viajes ya programados si ese activo estaba comprometido.</p>
        <form action={reportFleetIncidentAction} className="form-stack"><label>Fecha del hallazgo (si fue anterior)<input name="observed_on" type="date"/></label><label>Activo<select name="asset_id" defaultValue="" required><option value="">Seleccione camión, rampa o equipo</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.code} · {asset.label}</option>)}</select></label><label>Criticidad<select name="severity" defaultValue="media" required><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label><label>Descripción de la falla<textarea name="description" rows={4} minLength={5} maxLength={1000} required placeholder="Describa qué ocurrió y dónde se encuentra el activo"/></label><SubmitButton className="button button-primary" disabled={!assets.length}>Registrar avería</SubmitButton></form>
      </section></div>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">SEGUIMIENTO</div><h2><AlertTriangle size={19}/> Averías abiertas</h2></div><span className="count-pill">{incidents.length}</span></div>
      {incidents.length ? <div className="incident-grid">{incidents.map((incident) => <article className="incident-card" key={incident.id}><div className="incident-head"><div><Link className="table-main" href={`/flota/${incident.asset_id}`}>{incident.asset_label}</Link><span>{incident.code} · {observed(incident.observed_on,incident.reported_at)} · {incident.reported_by_name}</span></div><span className={`incident-severity severity-${incident.severity}`}>{severityName[incident.severity]}</span></div><p>{incident.description}</p><form action={resolveFleetIncidentAction} className="incident-resolve"><input type="hidden" name="id" value={incident.id}/><label>Solución aplicada<textarea name="resolution" minLength={5} maxLength={1000} rows={2} required placeholder="Describa la reparación o verificación antes de liberar el activo"/></label><SubmitButton className="button button-outline">Resolver y revisar disponibilidad</SubmitButton></form></article>)}</div> : <p className="muted">No hay averías pendientes. Los activos disponibles pueden utilizarse en nuevos despachos.</p>}
    </section>
  </>;
}
