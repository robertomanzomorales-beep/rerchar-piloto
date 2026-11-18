import Link from "next/link";
import {AlertTriangle,CalendarDays,ChevronLeft,ChevronRight,Truck} from "lucide-react";
import {canPlan,requireActor} from "@/lib/auth";
import {listAgenda,type AgendaService} from "@/lib/pilot";
import {weeklyFleet,type ScheduledTrip} from "@/lib/fleet-schedule";
import {Badge,chileDate,Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {setFleetDayAction} from "@/app/actions";
import {companyName,serviceFolio} from "@/lib/companies";
import {listWeekResults,listOpenDayAlerts,resultLabel,type DayReportWeek} from "@/lib/service-day";
import {agendaPeriod,agendaMonths,agendaIso as iso,agendaAddDays as addDays} from "@/lib/agenda-dates";

const localDay=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"});
const dayLabel=(day:Date)=>new Intl.DateTimeFormat("es-CL",{timeZone:"UTC",weekday:"short",day:"2-digit",month:"2-digit"}).format(day);
const kindLabel:Record<string,string>={mantencion:"Mantención",indisponible:"Fuera de servicio",sin_conductor:"Sin conductor",nota:"Observación"};
function DayList({items}:{items:AgendaService[]}){
  return items.length?<ul>{items.map(service=><li key={service.id}><Link href={`/solicitudes/${service.id}`}>
    <span className="agenda-item-head"><strong>{serviceFolio(service)}</strong><Badge status={service.status}/></span>
    <span className="agenda-time">{chileDate(service.scheduled_for)} · {companyName(service.operating_company)}</span>
    <b>{service.client_name}</b><span>{service.waste_type} · {service.site_name}</span>
    <span className="agenda-detail">{service.origin} → {service.destination}</span>
    <span className="agenda-detail"><Truck size={13}/>{service.asset_label??"Camión pendiente"} · {service.driver_name??"Conductor pendiente"}</span>
  </Link></li>)}</ul>:<p>Sin servicios programados.</p>;
}

export default async function Agenda({searchParams}:{searchParams:Promise<{inicio?:string;mes?:string;anio?:string;empresa?:string;error?:string;ok?:string;partes?:string;pagina?:string}>}){
  const actor=await requireActor();const query=await searchParams;
  const company=query.empresa==="rerchar"||query.empresa==="e_y_j"?query.empresa:"";
  const requested=Number(query.pagina),page=Number.isSafeInteger(requested)&&requested>=1&&requested<=10_000?requested:1;
  const pendingView=query.partes==="pendientes";
  const selectedPeriod=agendaPeriod(query),{monday,days,next,reference}=selectedPeriod;
  const managed=canPlan(actor);
  const [board,services,results,openResults]=await Promise.all([
    managed?weeklyFleet(actor,iso(monday),iso(next),company):Promise.resolve(null),
    managed?Promise.resolve([]):listAgenda(actor,iso(monday),iso(next),company),
    managed?listWeekResults(actor,iso(monday),iso(next)):Promise.resolve([]),
    managed?listOpenDayAlerts(actor,company,page):Promise.resolve({total:0,items:[]}),
  ]);
  const currentDay=localDay.format(new Date());
  const period=new Intl.DateTimeFormat("es-CL",{timeZone:"UTC",day:"numeric",month:"long"}).format(monday)+" – "+
    new Intl.DateTimeFormat("es-CL",{timeZone:"UTC",day:"numeric",month:"long",year:"numeric"}).format(days[6]);
  const href=(date:Date)=>`/agenda?${new URLSearchParams({inicio:iso(date),empresa:company,...(pendingView?{partes:"pendientes"}:{})})}${pendingView?"#partes-pendientes":""}`;
  const partsHref=(nextPage:number)=>`/agenda?${new URLSearchParams({inicio:reference,empresa:company,partes:"pendientes",pagina:String(nextPage)})}#partes-pendientes`;
  const selected=(trip:ScheduledTrip)=>!company||trip.operating_company===company;
  const visible=board?.trips.filter(selected)??[];
  const open=visible.filter(t=>t.status==="programada"||t.status==="en_ruta").length;
  const byCell=new Map<string,ScheduledTrip[]>();
  const key=(asset:string,day:string)=>`${asset}:${day}`;
  for(const trip of board?.trips??[]){const k=key(trip.assigned_asset_id,localDay.format(new Date(trip.scheduled_for)));byCell.set(k,[...(byCell.get(k)??[]),trip]);}
  const notes=new Map((board?.notes??[]).map(n=>[key(n.asset_id,new Date(n.day).toISOString().slice(0,10)),n]));
  const busy=(asset:string,day:string)=>byCell.get(key(asset,day))??[];
  const reportByCell=new Map<string,DayReportWeek[]>();
  for(const report of results){const k=key(report.asset_id,new Date(report.day).toISOString().slice(0,10));reportByCell.set(k,[...(reportByCell.get(k)??[]),report]);}
  const reports=(asset:string,day:string)=>reportByCell.get(key(asset,day))??[];
  const free=board?days.map(day=>board.assets.filter(asset=>asset.available&&
    !notes.get(key(asset.id,iso(day)))?.kind.match(/^(mantencion|indisponible|sin_conductor)$/)&&
    busy(asset.id,iso(day)).length===0&&reports(asset.id,iso(day)).length===0).length):[];
  const alerts=board?.pendingPriorityTotal??0;
  return <>
    <div className="page-title-row"><div><div className="eyebrow">PLANIFICACIÓN</div><h1>Programación semanal de camiones</h1><p className="page-intro">Camiones por día, servicios y novedades de operación. Horarios de Chile.</p></div><span className="title-icon"><CalendarDays size={24}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <form action="/agenda" method="GET" className="filters"><input type="hidden" name="inicio" value={reference}/>{pendingView&&<input type="hidden" name="partes" value="pendientes"/>}<label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><button className="button button-outline" type="submit">Filtrar</button></form>
    <section className="agenda-navigation" aria-label="Navegación de agenda">
      <form key={reference} action="/agenda" method="get" className="form-grid agenda-month-jump">
        <input type="hidden" name="empresa" value={company}/>{pendingView&&<input type="hidden" name="partes" value="pendientes"/>}
        <label>Mes<select name="mes" defaultValue={String(selectedPeriod.month).padStart(2,"0")} required>{agendaMonths.map((month,index)=><option key={month} value={String(index+1).padStart(2,"0")}>{month}</option>)}</select></label>
        <label>Año<input name="anio" type="number" min="1900" max="2100" step="1" inputMode="numeric" required defaultValue={selectedPeriod.year}/></label>
        <div className="agenda-jump-actions"><button className="button button-primary" type="submit">Ir al mes</button><Link className="button button-outline" href={href(new Date(`${selectedPeriod.today}T12:00:00Z`))}>Hoy</Link></div>
      </form>
      <p className="agenda-navigation-help">Seleccione un mes para abrir su primera semana.</p>
      <div className="agenda-controls"><Link aria-label="Semana anterior" href={href(addDays(monday,-7))}><ChevronLeft size={18}/> Anterior</Link><strong>{period}</strong><Link aria-label="Semana siguiente" href={href(next)}>Siguiente <ChevronRight size={18}/></Link></div>
    </section>
    {board?<>
      <div className="fleet-week-stats"><div><strong>{open}</strong><span>Servicios activos esta semana</span></div><div><strong>{board.pendingTotal}</strong><span>Solicitudes por programar</span></div><div><strong>{alerts}</strong><span>Prioridad alta o crítica pendiente</span></div></div>
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">PLANILLA SEMANAL</div><h2>Asignación por camión</h2></div><Link className="text-link" href={"/solicitudes?"+new URLSearchParams({estado:"solicitada",empresa:company})}>Programar solicitud →</Link></div>
        <p className="helper-text">Cada celda admite varios recorridos en horarios distintos. La disponibilidad considera las dos empresas porque comparten flota; el filtro sólo oculta detalles de la otra empresa.</p>
        <div className="fleet-week-scroll" role="region" aria-label="Asignación semanal por camión" tabIndex={0}><table className="fleet-week-table"><thead><tr><th>Camión</th>{days.map((day,i)=><th key={iso(day)} aria-current={iso(day)===currentDay?"date":undefined} className={iso(day)===currentDay?"fleet-week-today":undefined}>{dayLabel(day)}<span>{iso(day)===currentDay?"Hoy · ":""}{free[i]} {free[i]===1?"libre":"libres"}</span></th>)}</tr></thead><tbody>
          {board.assets.map(asset=><tr key={asset.id}><th><Link href={`/flota/${asset.id}`}>{asset.plate||asset.code}</Link><small title={asset.label}>{asset.label}</small>{!asset.available&&<em>Detenido</em>}</th>{days.map(day=>{
            const date=iso(day),note=notes.get(key(asset.id,date)),trips=busy(asset.id,date),shown=trips.filter(selected),other=trips.length-shown.length;
            const dayReports=reports(asset.id,date),extraReports=dayReports.filter(r=>!trips.some(t=>t.id===r.service_id)&&(!company||r.operating_company===company));
            const otherReports=dayReports.filter(r=>!trips.some(t=>t.id===r.service_id)&&company&&r.operating_company!==company).length;
            return <td key={date} className={note?.kind&&note.kind!=="nota"?"fleet-week-blocked":""}>{note&&<div className={`fleet-week-note ${note.kind}`}><strong>{kindLabel[note.kind]||note.kind}</strong><span>{note.detail}</span></div>}
              {shown.map(trip=><Link className="fleet-week-trip" href={`/solicitudes/${trip.id}`} key={trip.id}>
                <strong>{serviceFolio(trip)} · {trip.client_name}</strong><span>{new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(trip.scheduled_for))} · {trip.waste_type}</span>
                <span>{trip.driver_name??"Conductor pendiente"}{trip.ramp_label?` · Rampla ${trip.ramp_label}`:""}</span>
                <span>{companyName(trip.operating_company)} · {trip.status.replaceAll("_"," ")}</span>
                {dayReports.filter(r=>r.service_id===trip.id).map(r=><em className={`service-day-result ${r.outcome}`} key={r.service_id}>{resultLabel[r.outcome]}{r.observation?` · ${r.observation}`:""}</em>)}
                {trip.notes&&<small>{trip.notes}</small>}
              </Link>)}{extraReports.map(r=><Link className="fleet-week-trip" href={`/solicitudes/${r.service_id}`} key={r.service_id}>
                <strong>Parte {serviceFolio(r)} · {r.client_name}</strong><em className={`service-day-result ${r.outcome}`}>{resultLabel[r.outcome]}</em><small>{r.observation}</small>
              </Link>)}{other>0&&<span className="fleet-week-other">{other} {other===1?"asignación de otra empresa":"asignaciones de otra empresa"}</span>}
              {otherReports>0&&<span className="fleet-week-other">{otherReports} {otherReports===1?"parte de otra empresa":"partes de otra empresa"}</span>}
              {!trips.length&&!note&&!dayReports.length&&<span className="fleet-week-empty">{asset.available?"Libre":"No disponible"}</span>}
            </td>;
          })}</tr>)}
          {!board.assets.length&&<tr><td colSpan={8}>Agregue camiones en Maestros para comenzar la programación.</td></tr>}
        </tbody></table></div>
      </section>
      {(openResults.total>0||pendingView)&&<section className="section-card" id="partes-pendientes"><div className="section-heading"><div><div className="eyebrow">SEGUIMIENTO DE TERRENO{company?` · ${companyName(company)}`:""}</div><h2>Viajes incompletos o suspendidos</h2></div><span className="count-pill">{openResults.total}</span></div>
        <p className="helper-text">Un nuevo parte realizado o el cierre del servicio quita la alerta. Revise la causa y el siguiente paso en la solicitud.</p>
        {openResults.items.length?<ul className="fleet-week-pending">{openResults.items.map(r=><li key={r.service_id}><Link href={`/solicitudes/${r.service_id}`}><strong>{serviceFolio(r)} · {resultLabel[r.outcome]} · {r.client_name}</strong><span>{new Date(r.day).toISOString().slice(0,10)} · {r.waste_type} · {r.driver_name||"Sin conductor"}</span><small>{r.observation}</small></Link></li>)}</ul>:<p className="muted">No hay viajes pendientes en esta vista.</p>}
        {(page>1||page*100<openResults.total)&&<nav className="records-pagination" aria-label="Páginas de partes pendientes"><span>{page>1&&<Link className="button button-outline" href={partsHref(page-1)}>Anterior</Link>}</span><span>Página {page} · {openResults.total} pendientes</span><span>{page*100<openResults.total&&<Link className="button button-outline" href={partsHref(page+1)}>Siguiente</Link>}</span></nav>}
      </section>}
      <div className="fleet-week-lower"><section className="section-card"><div className="section-heading"><div><div className="eyebrow">DESPACHO</div><h2>Solicitudes sin asignación</h2></div><span className="count-pill">{board.pendingTotal}</span></div>
        {board.pending.length<board.pendingTotal&&<p className="helper-text">Se muestran {board.pending.length} de {board.pendingTotal} solicitudes, ordenadas por prioridad.</p>}{board.pending.length?<ul className="fleet-week-pending">{board.pending.map(trip=><li key={trip.id}><Link href={`/solicitudes/${trip.id}`}><strong>{serviceFolio(trip)} · {trip.client_name}</strong><span>{trip.site_name} · {trip.waste_type}</span><small>{companyName(trip.operating_company)}{trip.priority!=="normal"?` · Prioridad ${trip.priority}`:""}</small></Link></li>)}</ul>:<p className="muted">No hay solicitudes pendientes de programación.</p>}{board.pendingTotal>board.pending.length&&<Link className="text-link" href={"/solicitudes?"+new URLSearchParams({estado:"solicitada",empresa:company})}>Abrir listado de solicitudes</Link>}
      </section><section className="section-card"><div className="section-heading"><div><div className="eyebrow">NOVEDADES</div><h2><AlertTriangle size={18}/> Bloqueo u observación</h2></div></div>
        <p className="helper-text">Registre mantención, indisponibilidad o falta de conductor; estas novedades impiden asignar el camión ese día. Observación sólo informa. Para cambiar un servicio ya programado, reprográmelo desde su folio.</p>
        <form action={setFleetDayAction} className="form-stack"><input type="hidden" name="inicio" value={reference}/><input type="hidden" name="empresa" value={company}/>
          <label>Camión<select name="asset_id" required defaultValue=""><option value="">Seleccione camión</option>{board.assets.map(a=><option key={a.id} value={a.id}>{a.plate||a.code} · {a.label}</option>)}</select></label>
          <label>Día<input type="date" name="day" min={iso(monday)} max={iso(days[6])} defaultValue={iso(monday)} required/></label>
          <label>Tipo<select name="kind" defaultValue="nota"><option value="nota">Observación</option><option value="mantencion">Mantención</option><option value="indisponible">Fuera de servicio</option><option value="sin_conductor">Sin conductor</option><option value="despejado">Borrar novedad del día</option></select></label>
          <label>Detalle<textarea name="detail" maxLength={500} rows={3} placeholder="Qué ocurrió o por qué se bloquea"/></label>
          <SubmitButton className="button button-primary" disabled={!board.assets.length}>Guardar novedad</SubmitButton>
        </form>
      </section></div>
      {board.trips.some(t=>!board.assets.find(a=>a.id===t.assigned_asset_id)?.available&&t.status!=="completada")&&<p className="agenda-warning">Hay servicios asignados a camiones detenidos. Revise su reprogramación en las fichas de solicitud.</p>}
    </>:<div className="agenda-grid">{days.map(day=><section className="agenda-day" key={iso(day)}><header><span>{dayLabel(day)}</span></header><DayList items={services.filter(s=>localDay.format(new Date(s.scheduled_for))===iso(day))}/></section>)}</div>}
  </>;
}
