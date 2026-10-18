import Link from "next/link";
import {redirect} from "next/navigation";
import {ReceiptText} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {listExtraCharges,extraChargeLabels} from "@/lib/extra-charges";
import {decideExtraChargeAction,invoiceExtraChargeAction} from "@/app/extra-charge-actions";
import {Notice,chileDate} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {companyName,serviceFolio} from "@/lib/companies";

const day=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const money=(value:string|number)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:0});
const statusName={propuesto:"Por revisar",aprobado:"Aprobado",descartado:"No cobrar",facturado:"Factura externa registrada"} as const;
export default async function ExtraCharges({searchParams}:{searchParams:Promise<{empresa?:string;error?:string;ok?:string}>}){
  const actor=await requireActor();
  if(actor.role!=="admin"&&actor.role!=="operaciones")redirect("/");
  const query=await searchParams;
  const company=query.empresa==="e_y_j"?"e_y_j":"rerchar";
  const charges=await listExtraCharges(actor,company);
  const proposed=charges.filter(x=>x.status==="propuesto");
  const approved=charges.filter(x=>x.status==="aprobado");
  return <>
    <div className="page-title-row"><div><div className="eyebrow">CONTROL COMERCIAL · {companyName(company)}</div><h1>Cobros extraordinarios</h1><p className="page-intro">Flete falso, sobreestadía y otros conceptos respaldados por el parte diario.</p></div><ReceiptText size={23}/></div>
    <Notice error={query.error} ok={query.ok}/>
    <form action="/cobros-extraordinarios" method="GET" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><button type="submit" className="button button-outline">Ver empresa</button></form>
    <div className="supply-summary"><div><strong>{proposed.length}</strong><span>Por decidir</span></div><div><strong>{approved.length}</strong><span>Aprobados sin factura registrada</span></div><div><strong>${money(approved.reduce((sum,x)=>sum+Number(x.amount_clp??0),0))}</strong><span>Neto aprobado sin factura registrada</span></div></div>
    <p className="helper-text">Estos importes no se suman a la valorización del servicio ni al estado de pago. Una factura externa se cuenta una vez en <Link href={`/cobranzas?empresa=${company}`}>Cobranza</Link>, aunque incluya varios cargos o también el servicio principal.</p>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">TRAZABILIDAD</div><h2>Cargos del parte diario</h2></div><span className="count-pill">{charges.length}</span></div>
      {charges.length?<div className="record-list">{charges.map(x=><article key={x.id} className="note-block">
        <strong>{extraChargeLabels[x.kind]} · {statusName[x.status]} · {day(x.service_day)}</strong>
        <p><Link href={`/solicitudes/${x.service_id}`}>{serviceFolio(x)}</Link> · {x.client_name} · {companyName(x.operating_company)} · {x.reason}</p>
        <small>Parte: {x.source_outcome} · {x.source_observation||"Sin observación"} · registrado por {x.creator_name} el {chileDate(x.created_at)}</small>
        <p>Monto neto: <strong>{x.amount_clp?`$${money(x.amount_clp)}`:"Por acordar"}</strong> · Cotización: {x.quote_reference||"Sin referencia"} · OC cliente: {x.client_order_reference||"Sin referencia"}</p>
        {x.decision_note&&<p>Decisión de {x.decider_name}: {x.decision_note}</p>}
        {x.invoice_number&&<p>Factura externa: <strong>{x.invoice_number}</strong> · {day(x.invoiced_on!)} {x.receivable_invoice_id||x.linked_service_invoice_id?"· Conciliada en Cobranza":"· Falta completar vencimiento y total para conciliarla"}</p>}
        {x.status==="propuesto"&&actor.role==="admin"&&<form action={decideExtraChargeAction} className="form-grid detail-form">
          <input type="hidden" name="id" value={x.id}/><input type="hidden" name="company" value={company}/>
          <label>Decisión<select name="status" defaultValue="aprobado"><option value="aprobado">Aprobar cobro</option><option value="descartado">No cobrar</option></select></label>
          <label>Monto neto acordado (CLP; requerido al aprobar)<input name="amount_clp" type="number" min="0.01" step="0.01" defaultValue={x.amount_clp??""}/></label>
          <label className="field-full">Motivo de la decisión<input name="decision_note" minLength={5} maxLength={500} required placeholder="Acuerdo con el cliente o motivo para no cobrar"/></label>
          <div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar decisión</SubmitButton></div>
        </form>}
        {(x.status==="aprobado"||x.status==="facturado"&&!x.receivable_invoice_id&&!x.linked_service_invoice_id)&&actor.role==="admin"&&<details className="reference-control"><summary>{x.status==="facturado"?"Conciliar factura anterior":"Registrar factura externa emitida"}</summary><form action={invoiceExtraChargeAction} className="form-grid detail-form">
          <input type="hidden" name="id" value={x.id}/><input type="hidden" name="company" value={company}/>
          <label>Folio de factura<input name="invoice_number" defaultValue={x.invoice_number??""} minLength={2} maxLength={80} required/></label><label>Fecha de emisión<input name="invoiced_on" type="date" defaultValue={x.invoiced_on?day(x.invoiced_on):""} min={day(x.service_day)} required/></label>
          <label>Vencimiento<input name="due_on" type="date" required/></label><label>Total facturado CLP (incluye impuestos si corresponde)<input name="total_clp" type="number" min="0.01" step="0.01" required/></label>
          <p className="field-full helper-text">Si este folio ya pertenece a una factura del mismo cliente y empresa, los datos deben coincidir; se vinculará sin duplicar el saldo.</p>
          <div className="field-full form-footer"><SubmitButton className="button button-outline">Confirmar factura externa</SubmitButton></div>
        </form></details>}
      </article>)}</div>:<p className="muted">Sin cargos registrados. Abra una solicitud con parte diario para proponerlos.</p>}
    </section>
  </>;
}
