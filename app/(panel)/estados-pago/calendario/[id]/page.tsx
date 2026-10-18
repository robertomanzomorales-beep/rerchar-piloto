import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {PaymentCalendarError,getBillingCycle} from "@/lib/payment-calendar";
import {updateBillingCycleAction,linkBillingStatementAction,importBillingCycleServicesAction} from "@/app/payment-calendar-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";
import {serviceFolio} from "@/lib/companies";

const day=(v:Date|string)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const money=(v:string|number)=>Number(v).toLocaleString("es-CL",{maximumFractionDigits:2});
export default async function BillingCyclePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor();if(!["admin","operaciones"].includes(actor.role))redirect("/");
  if(!await moduleReady("edp_calendar"))return <ModuleUnavailable title="Período de estado de pago" company="e_y_j"/>;
  const {id}=await params;let result;
  try{result=await getBillingCycle(actor,id);}catch(error){if(error instanceof PaymentCalendarError)notFound();throw error;}
  const {cycle:c,services,statements,overflow}=result,query=await searchParams;
  const valued=services.filter(s=>s.total_clp!=null),estimated=valued.reduce((n,s)=>n+Number(s.total_clp),0);
  const sent=c.statement_status==="enviado"||c.statement_status==="aprobado";
  const importReady=await moduleReady("edp_service_import");
  const canImport=actor.role==="admin"&&!!c.statement_id&&
    (c.statement_status==="borrador"||c.statement_status==="observado")&&importReady&&!overflow;
  const eligible=(s:typeof services[number])=>s.status==="completada"&&!s.partial_period&&!s.used_elsewhere&&
    (c.statement_type==="arriendo"||Number(s.weight_kg)>0);
  const available=services.some(s=>eligible(s)&&(!s.transport_used||(c.statement_type==="residuos"&&!s.disposal_used)));
  return <><Link href="/estados-pago/calendario" className="back-link">← Calendario de estados de pago</Link>
    <div className="page-title-row"><div><div className="eyebrow">E Y J · {c.statement_type==="arriendo"?"ARRIENDO":"TRANSPORTE Y DISPOSICIÓN"}</div><h1>{c.client_name}</h1><p className="page-intro">Período {day(c.period_from)} al {day(c.period_to)} · corte {day(c.cutoff_on)} · envío {day(c.send_on)}</p></div><div className="order-actions"><a href={`/api/estados-pago/consolidado/${id}`} className="button button-outline">Descargar consolidado CSV</a><Link href="/estados-pago" className="button button-outline">Ver EDP</Link></div></div>
    <Notice error={query.error} ok={query.ok}/>
    {overflow&&<p role="alert" className="notice notice-error">Este período supera 500 servicios. Acote las fechas; el listado y sus sumas están incompletos.</p>}
    <p className="helper-text">El consolidado cruza servicios del período, guías, tickets, pesajes, conductor, patente y valorización. Los campos sin respaldo se entregan vacíos o marcados para revisión antes de armar el EDP.</p>
    <div className="company-metric-grid"><div className="company-metric"><span>Servicios del período</span><strong>{overflow?"500+":services.length}</strong><small>Del cliente y formato</small></div><div className="company-metric"><span>Valor visible</span><strong>{overflow?"—":valued.length}</strong><small>{overflow?"Revise el período completo":`${services.length-valued.length} pendientes de valor o prorrateo`}</small></div><div className="company-metric"><span>Valor neto registrado</span><strong>{overflow?"—":`$${money(estimated)}`}</strong><small>Referencia para revisar, no total del EDP</small></div><div className="company-metric"><span>EDP</span><strong>{c.statement_number?`N° ${c.statement_number}`:"—"}</strong><small>{sent?`Estado ${c.statement_status}`:c.statement_status?`Estado ${c.statement_status}`:"Por vincular"}</small></div></div>
    <section className="section-card"><div className="eyebrow">RESPALDO PARA PREPARAR EL EDP</div><h2>{c.statement_type==="arriendo"?"Arriendos que se cruzan con este período":"Servicios cerrados en este período"}</h2><p className="helper-text">{c.statement_type==="arriendo"?"Se muestran arriendos programados o cerrados de este cliente que coinciden con el período. Si el arriendo abarca más días, revise el prorrateo antes de cargar una línea al EDP; el valor total del arriendo no se suma dos veces.":"Se muestran los servicios de E y J cerrados en hora de Chile para este cliente. Compruebe cantidades, guías, contrato y valores antes de incorporarlos al formato."}</p>
      {canImport&&<p className="helper-text">Seleccione el respaldo de transporte y/o disposición que corresponda. Se copian fecha, peso y documentos al EDP; los importes y la tarifa se revisan y cargan en el EDP.</p>}
      <form action={importBillingCycleServicesAction}><input type="hidden" name="id" value={id}/>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Folio / período</th><th>Servicio</th><th>Guía</th><th>Cantidad</th><th>Unitario</th><th>Neto registrado</th><th>Factura</th>{canImport&&<th>Incorporar al EDP</th>}</tr></thead><tbody>{services.map(s=><tr key={s.id}><td><Link href={`/solicitudes/${s.id}`}><strong>{serviceFolio({folio:s.folio,operating_company:"e_y_j"})}</strong></Link><span className="table-sub">{s.closed_on} · {s.status}</span></td><td>{s.service_type}<span className="table-sub">{s.waste_type}</span></td><td>{s.guide_number||"—"}</td><td>{s.quantity==null?"—":`${money(s.quantity)} ${s.tariff_unit||""}`}</td><td>{s.unit_price_clp==null?"—":`$${money(s.unit_price_clp)}`}</td><td>{s.partial_period?"Revisar prorrateo":s.total_clp==null?"Por valorizar":`$${money(s.total_clp)}`}</td><td>{s.invoice_number||"—"}</td>{canImport&&<td>{!eligible(s)?<span className="table-sub">{s.used_elsewhere?"Ya respalda otro EDP":s.partial_period?"Revisar prorrateo":s.status!=="completada"?"Pendiente de cierre":"Falta pesaje neto"}</span>:<>{!s.transport_used&&<label><input type="checkbox" name="service" value={`${s.id}:0`}/> {c.statement_type==="arriendo"?"Arriendo":"Transporte"}</label>}{c.statement_type==="residuos"&&!s.disposal_used&&<label><input type="checkbox" name="service" value={`${s.id}:1`}/> Disposición</label>}{s.transport_used&&(c.statement_type==="arriendo"||s.disposal_used)&&<span className="table-sub">Ya incorporado</span>}</>}</td>}</tr>)}</tbody></table>{!services.length&&<p className="muted">No hay registros de este formato y período. Revise el contrato y los cargos manuales.</p>}</div>
      {canImport&&available&&<div className="form-footer"><SubmitButton className="button">Incorporar seleccionados al EDP</SubmitButton></div>}</form>
      {actor.role==="admin"&&!!c.statement_id&&!importReady&&<p className="muted">La importación estará disponible cuando se aplique la migración de respaldos del EDP.</p>}
    </section>
    <section className="section-card"><h2>Estado de pago del período</h2><p className="helper-text">El calendario registra fechas y contacto. Al crear un EDP aquí, el borrador queda vinculado y puede incorporar los respaldos elegidos. Complete los cobros según los formatos de E y J. El envío se registra en el EDP.</p>
      {c.statement_id&&<p>Vinculado: <Link href={`/estados-pago/${c.statement_id}`}>EDP N° {c.statement_number}</Link> · {c.statement_status}. {sent?"Envío registrado en el estado de pago.":"La alerta sigue activa hasta marcar el EDP como enviado."}</p>}
      {actor.role==="admin"&&<>{!c.statement_id&&<Link href={`/estados-pago/nuevo?cliente=${c.client_id}&periodo=${day(c.period_from)}&formato=${c.statement_type}&ciclo=${id}`} className="button button-outline">Crear EDP para este período</Link>}
        <form action={linkBillingStatementAction} className="form-grid"><input type="hidden" name="id" value={id}/><label>Vincular EDP del mismo cliente, período y formato<select name="statement_id" defaultValue={c.statement_id??""}><option value="">Sin vincular</option>{statements.map(s=><option key={s.id} value={s.id}>N° {s.number} · {day(s.period_on)} · {s.status}</option>)}</select></label><div className="form-footer"><SubmitButton className="button button-outline">Guardar vínculo</SubmitButton></div></form>
      </>}{statements.length===0&&<p className="muted">Aún no existe un EDP de este formato para el período.</p>}
    </section>
    {actor.role==="admin"&&<section className="section-card"><h2>Corregir calendario acordado</h2><p className="helper-text">La corrección queda en Auditoría. No se puede cambiar el período dejando fuera un EDP ya vinculado.</p>
      <form action={updateBillingCycleAction} className="form-grid"><input type="hidden" name="id" value={id}/>
        <label>Desde<input name="period_from" type="date" required defaultValue={day(c.period_from)}/></label><label>Hasta<input name="period_to" type="date" required defaultValue={day(c.period_to)}/></label>
        <label>Fecha de corte<input name="cutoff_on" type="date" required defaultValue={day(c.cutoff_on)}/></label><label>Fecha pactada de envío<input name="send_on" type="date" required defaultValue={day(c.send_on)}/></label>
        <label>Correo principal de envío<input name="contact_email" type="email" required maxLength={180} defaultValue={c.contact_email}/></label>
        <label>Observaciones<input name="notes" maxLength={500} defaultValue={c.notes??""}/></label>
        <div className="field-full form-footer"><SubmitButton className="button button-outline">Guardar calendario</SubmitButton></div>
      </form></section>}
  </>;
}
