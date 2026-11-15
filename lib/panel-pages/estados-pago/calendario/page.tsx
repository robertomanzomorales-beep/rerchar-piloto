import Link from "next/link";
import {redirect} from "next/navigation";
import {CalendarDays} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {listBillingCycles,eyjBillingCalendarDashboard,type BillingCycleView} from "@/lib/payment-calendar";
import {createBillingCycleAction} from "@/app/payment-calendar-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

const day=(v:Date|string)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const format={residuos:"Transporte y disposición",arriendo:"Arriendo de equipo"};
const views:Record<BillingCycleView,string>={"":"Todos los períodos",cortes:"Cortes próximos",envios:"Envíos próximos",atrasados:"Envíos atrasados"};
export default async function BillingCalendar({searchParams}:{searchParams:Promise<{error?:string;ok?:string;vista?:string;pagina?:string}>}){
  const actor=await requireActor();if(!["admin","operaciones"].includes(actor.role))redirect("/");
  if(!await moduleReady("edp_calendar"))return <ModuleUnavailable title="Agenda de estados de pago" company="e_y_j"/>;
  const query=await searchParams;
  const view:BillingCycleView=Object.hasOwn(views,query.vista??"")?query.vista as BillingCycleView:"";
  const requestedPage=Number(query.pagina),pageNumber=Number.isSafeInteger(requestedPage)&&requestedPage>=1&&requestedPage<=10_000?requestedPage:1;
  const pageSize=100;
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const [result,clients,alerts]=await Promise.all([listBillingCycles(actor,view,pageSize+1,(pageNumber-1)*pageSize,today),
    actor.role==="admin"?db.query<{id:string;name:string;email:string|null}>(
      "SELECT id,name,email FROM clients WHERE deleted_at IS NULL ORDER BY name"):Promise.resolve([]),
    eyjBillingCalendarDashboard(today)]);
  const cycles=result.slice(0,pageSize),hasMore=result.length>pageSize;
  const href=(nextView:BillingCycleView,page=1)=>`/estados-pago/calendario?${new URLSearchParams({vista:nextView,pagina:String(page)})}`;
  return <><Link href="/estados-pago" className="back-link">← Estados de pago</Link>
    <div className="page-title-row"><div><div className="eyebrow">E Y J · CONTROL DE CLIENTES</div><h1>Calendario de estados de pago</h1><p className="page-intro">Defina el período, el corte, el envío y el contacto acordados con cada cliente. Revise los servicios cerrados antes de preparar el EDP.</p></div><span className="title-icon"><CalendarDays size={24}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <div className="company-metric-grid"><Link href={href("")} className="company-metric"><span>Períodos programados</span><strong>{alerts.total}</strong><small>Por cliente y formato</small></Link><Link href={href("cortes")} className="company-metric"><span>Cortes próximos</span><strong>{alerts.cutoffs}</strong><small>Hoy o próximos 7 días</small></Link><Link href={href("envios")} className="company-metric"><span>Envíos próximos</span><strong>{alerts.sends}</strong><small>Hoy o próximos 7 días</small></Link><Link href={href("atrasados")} className="company-metric"><span>Envíos atrasados</span><strong>{alerts.overdue}</strong><small>Sin EDP enviado</small></Link></div>
    {actor.role==="admin"&&<section className="section-card"><div className="eyebrow">NUEVO PERÍODO</div><h2>Agendar corte y envío</h2><p className="helper-text">Las fechas y el contacto se registran según el acuerdo de cada cliente. Esta agenda no supone un ciclo mensual ni emite facturas.</p>
      <form action={createBillingCycleAction} className="form-grid">
        <label>Cliente<select name="client_id" required defaultValue=""><option value="">Seleccione cliente</option>{clients.map(c=><option value={c.id} key={c.id}>{c.name}{c.email?` · ${c.email}`:""}</option>)}</select></label>
        <label>Formato del EDP<select name="statement_type"><option value="residuos">Transporte y disposición</option><option value="arriendo">Arriendo de equipo</option></select></label>
        <label>Desde<input name="period_from" type="date" required/></label><label>Hasta<input name="period_to" type="date" required/></label>
        <label>Fecha de corte<input name="cutoff_on" type="date" required/></label><label>Fecha pactada de envío<input name="send_on" type="date" required/></label>
        <label>Correo principal de envío<input name="contact_email" type="email" maxLength={180} required/></label>
        <label>Observaciones<input name="notes" maxLength={500} placeholder="Condiciones de corte o respaldo requerido"/></label>
        <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!clients.length}>Guardar período</SubmitButton></div>
      </form></section>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">AGENDA</div><h2>{view?views[view]:"Períodos y fechas por cliente"}</h2></div><span className="count-pill">Hasta 100 por página</span></div><form action="/estados-pago/calendario" className="filters"><label>Vista<select name="vista" defaultValue={view}>{Object.entries(views).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button type="submit" className="button button-outline">Aplicar</button></form><div className="table-wrap"><table className="data-table"><thead><tr><th>Cliente / formato</th><th>Período</th><th>Corte</th><th>Envío</th><th>Estado</th></tr></thead><tbody>{cycles.map(c=>{
      const sent=c.statement_status==="enviado"||c.statement_status==="aprobado";
      const status=sent?`EDP ${c.statement_status}`:day(c.send_on)<today?"Envío atrasado":day(c.send_on)<=alertsDay(today,7)?"Envío próximo":day(c.cutoff_on)>=today&&day(c.cutoff_on)<=alertsDay(today,7)?"Corte próximo":"Por preparar";
      return <tr key={c.id}><td><Link href={`/estados-pago/calendario/${c.id}`}><strong>{c.client_name}</strong></Link><span className="table-sub">{format[c.statement_type]}</span></td><td>{day(c.period_from)} → {day(c.period_to)}</td><td>{day(c.cutoff_on)}</td><td>{day(c.send_on)}<span className="table-sub">{c.contact_email}</span></td><td>{status}</td></tr>;
    })}</tbody></table>{!cycles.length&&<p className="muted">{view?"Sin períodos en esta vista.":"Aún no hay períodos acordados. Registre el primero para activar alertas de corte y envío."}</p>}</div>
      {(pageNumber>1||hasMore)&&<nav className="records-pagination" aria-label="Páginas del calendario EDP"><span>{pageNumber>1&&<Link className="button button-outline" href={href(view,pageNumber-1)}>Anterior</Link>}</span><span>Página {pageNumber} · hasta 100 períodos</span><span>{hasMore&&<Link className="button button-outline" href={href(view,pageNumber+1)}>Siguiente</Link>}</span></nav>}
    </section>
  </>;
}

function alertsDay(today:string,days:number){const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
