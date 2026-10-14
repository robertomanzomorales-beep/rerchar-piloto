import Link from "next/link";
import {AlertTriangle,CalendarDays,ChevronLeft,ChevronRight,Truck} from "lucide-react";
import {canPlan,requireActor} from "@/lib/auth";
import {listAgenda,type AgendaService} from "@/lib/pilot";
import {weeklyFleet,type ScheduledTrip} from "@/lib/fleet-schedule";
import {Badge,chileDate,Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {setFleetDayAction} from "@/app/actions";
import {companyName,serviceFolio} from "@/lib/companies";

function iso(date:Date){return date.toISOString().slice(0,10);}
function addDays(date:Date,days:number){const next=new Date(date);next.setUTCDate(next.getUTCDate()+days);return next;}
function weekStart(input?:string){
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const raw=input&&/^\d{4}-\d{2}-\d{2}$/.test(input)?input:today;
  const date=new Date(`${raw}T12:00:00Z`);
  const safe=!Number.isNaN(date.getTime())&&iso(date)===raw?date:new Date(`${today}T12:00:00Z`);
  return addDays(safe,-((safe.getUTCDay()+6)%7));
}
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

export default async function Agenda({searchParams}:{searchParams:Promise<{inicio?:string;empresa?:string;error?:string;ok?:string}>}){
  const actor=await requireActor();const query=await searchParams;
  const company=query.empresa==="rerchar"||query.empresa==="e_y_j"?query.empresa:"";
  const monday=weekStart(query.inicio),days=Array.from({length:7},(_,offset)=>addDays(monday,offset)),next=addDays(monday,7);
  const managed=canPlan(actor);
  const [board,services]=await Promise.all([
    managed?weeklyFleet(actor,iso(monday),iso(next),company):Promise.resolve(null),
    managed?Promise.resolve([]):listAgenda(actor,iso(monday),iso(next),company),
  ]);
  const period=new Intl.DateTimeFormat("es-CL",{timeZone:"UTC",day:"numeric",month:"long"}).format(monday)+" – "+
    new Intl.DateTimeFormat("es-CL",{timeZone:"UTC",day:"numeric",month:"long",year:"numeric"}).format(days[6]);
  const href=(date:Date)=>`/agenda?inicio=${iso(date)}&empresa=${company}`;
  const selected=(trip:ScheduledTrip)=>!company||trip.operating_company===company;
  const visible=board?.trips.filter(selected)??[];
  const open=visible.filter(t=>t.status==="programada"||t.status==="en_ruta").length;
  const byCell=new Map<string,ScheduledTrip[]>();
  const key=(asset:string,day:string)=>`${asset}:${day}`;
  for(const trip of board?.trips??[]){const k=key(trip.assigned_asset_id,localDay.format(new Date(trip.scheduled_for)));byCell.set(k,[...(byCell.get(k)??[]),trip]);}
  const notes=new Map((board?.notes??[]).map(n=>[key(n.asset_id,new Date(n.day).toISOString().slice(0,10)),n]));
  const busy=(asset:string,day:string)=>byCell.get(key(asset,day))??[];
  const free=board?days.map(day=>board.assets.filter(asset=>asset.available&&
    !notes.get(key(asset.id,iso(day)))?.kind.match(/^(mantencion|indisponible|sin_conductor)$/)&&
    busy(asset.id,iso(day)).length===0).length):[];
  const alerts=board?.pending.filter(p=>p.priority==="critica"||p.priority==="alta").length??0;
  return <>
    <div className="page-title-row"><div><div className="eyebrow">PLANIFICACIÓN</div><h1>Programación semanal de camiones</h1><p className="page-intro">Camiones por día, servicios y novedades de operación. Horarios de Chile.</p></div><span className="title-icon"><CalendarDays size={24}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <form action="/agenda" method="GET" className="filters"><input type="hidden" name="inicio" value={iso(monday)}/><label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><button className="button button-outline" type="submit">Filtrar</button></form>
    <div className="agenda-controls"><Link href={href(addDays(monday,-7))}><ChevronLeft size={18}/> Anterior</Link><strong>{period}</strong><Link href={href(next)}>Siguiente <ChevronRight size={18}/></Link></div>
    {board?<>
      <div className="fleet-week-stats"><div><strong>{open}</strong><span>Servicios activos esta semana</span></div><div><strong>{board.pending.length}</strong><span>Solicitudes por programar{board.pending.length===60?" (primeras 60)":""}</span></div><div><strong>{alerts}</strong><span>Prioridad alta o crítica pendiente</span></div></div>
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">PLANILLA SEMANAL</div><h2>Asignación por camión</h2></div><Link className="text-link" href="/solicitudes?estado=solicitada">Programar solicitud →</Link></div>
        <p className="helper-text">Cada celda admite varios recorridos en horarios distintos. La disponibilidad considera las dos empresas porque comparten flota; el filtro sólo oculta detalles de la otra empresa.</p>
        <div className="fleet-week-scroll"><table className="fleet-week-table"><thead><tr><th>Camión</th>{days.map((day,i)=><th key={iso(day)}>{dayLabel(day)}<span>{free[i]} libre(s)</span></th>)}</tr></thead><tbody>
          {board.assets.map(asset=><tr key={asset.id}><th><Link href={`/flota/${asset.id}`}>{asset.plate||asset.code}</Link><small>{asset.label}</small>{!asset.available&&<em>Detenido</em>}</th>{days.map(day=>{
            const date=iso(day),note=notes.get(key(asset.id,date)),trips=busy(asset.id,date),shown=trips.filter(selected),other=trips.length-shown.length;
            return <td key={date} className={note?.kind&&note.kind!=="nota"?"fleet-week-blocked":""}>{note&&<div className={`fleet-week-note ${note.kind}`}><strong>{kindLabel[note.kind]||note.kind}</strong><span>{note.detail}</span></div>}
              {shown.map(trip=><Link className="fleet-week-trip" href={`/solicitudes/${trip.id}`} key={trip.id}>
                <strong>{serviceFolio(trip)} · {trip.client_name}</strong><span>{new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(trip.scheduled_for))} · {trip.waste_type}</span>
                <span>{trip.driver_name??"Conductor pendiente"}{trip.ramp_label?` · Rampla ${trip.ramp_label}`:""}</span>
                <span>{companyName(trip.operating_company)} · {trip.status.replaceAll("_"," ")}</span>
                {trip.notes&&<small>{trip.notes}</small>}
              </Link>)}{other>0&&<span className="fleet-week-other">{other} asignación(es) de otra empresa</span>}
              {!trips.length&&!note&&<span className="fleet-week-empty">{asset.available?"Libre":"No disponible"}</span>}
            </td>;
          })}</tr>)}
          {!board.assets.length&&<tr><td colSpan={8}>Agregue camiones en Maestros para comenzar la programación.</td></tr>}
        </tbody></table></div>
      </section>
      <div className="fleet-week-lower"><section className="section-card"><div className="section-heading"><div><div className="eyebrow">DESPACHO</div><h2>Solicitudes sin asignación</h2></div><span className="count-pill">{board.pending.length}</span></div>
        {board.pending.length?<ul className="fleet-week-pending">{board.pending.map(trip=><li key={trip.id}><Link href={`/solicitudes/${trip.id}`}><strong>{serviceFolio(trip)} · {trip.client_name}</strong><span>{trip.site_name} · {trip.waste_type}</span><small>{companyName(trip.operating_company)}{trip.priority!=="normal"?` · Prioridad ${trip.priority}`:""}</small></Link></li>)}</ul>:<p className="muted">No hay solicitudes pendientes de programación.</p>}
      </section><section className="section-card"><div className="section-heading"><div><div className="eyebrow">NOVEDADES</div><h2><AlertTriangle size={18}/> Bloqueo u observación</h2></div></div>
        <p className="helper-text">Registre mantención, indisponibilidad o falta de conductor; estas novedades impiden asignar el camión ese día. Observación sólo informa. Para cambiar un servicio ya programado, reprográmelo desde su folio.</p>
        <form action={setFleetDayAction} className="form-stack"><input type="hidden" name="inicio" value={iso(monday)}/><input type="hidden" name="empresa" value={company}/>
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
