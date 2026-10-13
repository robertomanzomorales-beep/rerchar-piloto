import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {PaymentStatementError,getPaymentStatement,type Operation,type Charge} from "@/lib/payment-statements";
import {saveStatementOperationAction,saveStatementChargeAction,deleteStatementLineAction,setStatementStatusAction} from "@/app/payment-statement-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import PrintButton from "@/components/PrintButton";

const money=(value:number|null)=>value==null?"Pendiente":`$${value.toLocaleString("es-CL")}`;
const number=(value:string|number|null)=>value==null?"—":Number(value).toLocaleString("es-CL",{maximumFractionDigits:3});
const iso=(v:Date|string|null)=>!v?"":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const date=(v:Date|string|null)=>!v?"—":new Intl.DateTimeFormat("es-CL",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(v));
const month=(v:Date|string)=>new Intl.DateTimeFormat("es-CL",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(v));

function OperationFields({type,item,next}:{type:"residuos"|"arriendo";item?:Operation;next:number}){
  return <>
    <input type="hidden" name="line_id" value={item?.id??""}/><label>N° ítem<input name="line_number" type="number" min="1" max="200" required defaultValue={item?.line_number??next}/></label>
    <label className="field-full">Descripción<input name="description" required minLength={4} maxLength={500} defaultValue={item?.description??""}/></label>
    {type==="residuos"?<>
      <label>Fecha<input name="operation_on" type="date" required defaultValue={iso(item?.operation_on??null)}/></label>
      <label>Peso kg<input name="weight_kg" type="number" min="0.01" step="0.01" required defaultValue={item?.weight_kg??""}/></label>
      <label>Ticket de pesaje<input name="weighing_ticket" maxLength={80} defaultValue={item?.weighing_ticket??""}/></label>
      <label>Hoja de servicio<input name="service_sheet" maxLength={80} defaultValue={item?.service_sheet??""}/></label>
      <label>Guía de despacho<input name="guide_number" maxLength={80} defaultValue={item?.guide_number??""}/></label>
      <label>SIDREP<input name="sidrep" maxLength={80} defaultValue={item?.sidrep??""}/></label>
      <label>Tipo de ítem<select name="is_disposal" defaultValue={item?.is_disposal?"1":"0"}><option value="0">Transporte u otro servicio</option><option value="1">Disposición final (suma toneladas)</option></select></label>
    </>:<><label>Desde<input name="rental_from" type="date" required defaultValue={iso(item?.rental_from??null)}/></label><label>Hasta<input name="rental_to" type="date" required defaultValue={iso(item?.rental_to??null)}/></label><input type="hidden" name="is_disposal" value="0"/></>}
  </>;
}
function ChargeFields({item,next,type}:{item?:Charge;next:number;type:"residuos"|"arriendo"}){
  return <>
    <input type="hidden" name="line_id" value={item?.id??""}/><label>N° concepto<input name="line_number" type="number" min="1" max="100" required defaultValue={item?.line_number??next}/></label>
    <label className="field-full">Descripción del cobro<input name="description" minLength={4} maxLength={500} required defaultValue={item?.description??""}/></label>
    <label>Tarifa<select name="pricing" defaultValue={item?.pricing??(type==="arriendo"?"uf_unidad":"clp_servicio")}><option value="clp_servicio">CLP × cantidad de servicios</option>{type==="residuos"&&<option value="uf_ton">UF × toneladas de disposición</option>}<option value="uf_unidad">UF × cantidad de unidades</option></select></label>
    <label>Valor unitario (CLP o UF)<input name="unit_value" type="number" min="0.01" step="0.01" required defaultValue={item?.unit_value??""}/></label>
    <label>Cantidad (vacío si UF/ton)<input name="quantity" type="number" min="0.001" step="0.001" defaultValue={item?.quantity??""}/></label>
    <label>Valor UF en CLP (sólo cobros en UF)<input name="uf_value_clp" type="number" min="0.01" step="0.01" defaultValue={item?.uf_value_clp??""}/></label>
    <label>Fecha del valor UF<input name="uf_on" type="date" defaultValue={iso(item?.uf_on??null)}/></label>
  </>;
}

export default async function StatementDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const {id}=await params;
  let detail;try{detail=await getPaymentStatement(actor,id);}catch(error){if(error instanceof PaymentStatementError)notFound();throw error;}
  const query=await searchParams,{statement:s,operations,charges,totals}=detail;
  const edit=actor.role==="admin"&&["borrador","observado"].includes(s.status);
  return <>
    <div className="order-actions print-hide"><Link href="/estados-pago" className="back-link">← Estados de pago</Link><PrintButton label="Imprimir EDP / guardar PDF"/></div>
    <div className="print-hide"><Notice error={query.error} ok={query.ok}/></div>
    <article className="order-sheet edp-sheet"><header className="edp-header"><div><strong>EMPRESA DE SERVICIOS INTEGRALES E Y J LTDA.</strong><span>RUT 76.347.909-9{s.issuer_contact&&` · Contacto: ${s.issuer_contact}`}</span></div><div><small>ESTADO DE PAGO</small><strong>N° {s.number}</strong></div></header>
      <div className="edp-recipient"><div><small>Empresa</small><strong>{s.client_name}</strong></div><div><small>RUT</small><strong>{s.client_tax_id}</strong></div><div><small>Domicilio</small><strong>{s.client_address}</strong></div><div><small>Contacto</small><strong>{s.client_contact}</strong></div><div><small>Período</small><strong>{month(s.period_on)}</strong></div>{s.contract_reference&&<div><small>Contrato</small><strong>{s.contract_reference}</strong></div>}</div>
      <section className="edp-section"><h2>{s.statement_type==="residuos"?"Servicios y respaldo operativo":"Detalle de arriendo"}</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Ítem</th>{s.statement_type==="residuos"?<><th>Fecha</th><th>Descripción</th><th>Peso kg</th><th>Ticket</th><th>Hoja de servicio</th><th>Guía</th><th>SIDREP</th></>:<><th>Descripción</th><th>Desde</th><th>Hasta</th></>}</tr></thead><tbody>{operations.map(o=><tr key={o.id}><td>{o.line_number}</td>{s.statement_type==="residuos"?<><td>{date(o.operation_on)}</td><td>{o.description}{o.is_disposal&&<small className="table-sub">Disposición final</small>}</td><td>{number(o.weight_kg)}</td><td>{o.weighing_ticket||"—"}</td><td>{o.service_sheet||"—"}</td><td>{o.guide_number||"—"}</td><td>{o.sidrep||"—"}</td></>:<><td>{o.description}</td><td>{date(o.rental_from)}</td><td>{date(o.rental_to)}</td></>}</tr>)}</tbody></table>{!operations.length&&<p className="muted">Faltan los ítems del respaldo operativo.</p>}</div></section>
      <section className="edp-section"><h2>Valorización</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Descripción</th><th>Valor unitario</th><th>Valor UF / fecha</th><th>Cantidad</th><th>Total CLP</th></tr></thead><tbody>{totals.lines.map(({charge,quantity,total_clp})=><tr key={charge.id}><td>{charge.description}</td><td>{number(charge.unit_value)} {charge.pricing==="clp_servicio"?"CLP":"UF"}</td><td>{charge.uf_value_clp?`${money(Number(charge.uf_value_clp))} · ${date(charge.uf_on)}`:"—"}</td><td>{quantity==null?"Pendiente peso disposición":`${number(quantity)} ${charge.pricing==="uf_ton"?"ton":"un."}`}</td><td>{money(total_clp)}</td></tr>)}</tbody></table>{!charges.length&&<p className="muted">Faltan los conceptos valorizados.</p>}</div>
        <div className="edp-totals"><div><span>Total neto estado de pago</span><strong>{money(totals.net_clp)}</strong></div><div><span>IVA 19%</span><strong>{money(totals.vat_clp)}</strong></div><div><span>Total estado de pago</span><strong>{money(totals.total_clp)}</strong></div></div>
        {totals.disposal_tons!=null&&<p className="helper-text">Toneladas de disposición: {number(totals.disposal_tons)} ton, calculadas con los kg de ítems marcados «Disposición final».</p>}
      </section>{s.notes&&<p className="edp-notes">{s.notes}</p>}
      <footer className="edp-footer"><span>Administrador de contrato: {s.contract_manager||"Pendiente de informar"}</span><span>Registro {s.status} · no sustituye factura tributaria.</span></footer>
    </article>
    <div className="print-hide edp-controls"><section className="section-card"><div className="section-heading"><div><div className="eyebrow">CONTROL ADMINISTRATIVO</div><h2>Estado: <span className={`edp-status edp-status-${s.status}`}>{s.status}</span></h2></div></div>
      <p className="helper-text">Un borrador se envía después de registrar operaciones y cobros. «Aprobado» cierra el documento interno; las facturas y pagos se gestionan aparte.</p>
      {actor.role==="admin"&&<div className="edp-status-actions">{(["borrador","observado"].includes(s.status))&&<form action={setStatementStatusAction}><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="status" value="enviado"/><SubmitButton className="button button-primary">Marcar enviado</SubmitButton></form>}{s.status==="enviado"&&<><form action={setStatementStatusAction}><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="status" value="aprobado"/><SubmitButton className="button button-primary">Marcar aprobado</SubmitButton></form><form action={setStatementStatusAction}><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="status" value="observado"/><SubmitButton className="button button-outline">Marcar observado</SubmitButton></form></>}{s.status==="observado"&&<form action={setStatementStatusAction}><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="status" value="borrador"/><SubmitButton className="button button-outline">Volver a borrador</SubmitButton></form>}</div>}
    </section>
    {edit&&<><section className="section-card"><div className="section-heading"><div><div className="eyebrow">RESPALDO</div><h2>Agregar ítem operativo</h2></div></div><form action={saveStatementOperationAction} className="form-grid"><input type="hidden" name="statement_id" value={id}/><OperationFields type={s.statement_type} next={operations.length+1}/><div className="field-full form-footer"><SubmitButton className="button button-primary">Agregar ítem</SubmitButton></div></form>
      {operations.map(o=><details key={o.id} className="edp-edit"><summary>Corregir ítem {o.line_number} · {o.description}</summary><form action={saveStatementOperationAction} className="form-grid"><input type="hidden" name="statement_id" value={id}/><OperationFields type={s.statement_type} item={o} next={o.line_number}/><div className="field-full form-footer"><SubmitButton className="button button-outline">Guardar corrección</SubmitButton></div></form><form action={deleteStatementLineAction} className="edp-delete-form"><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="kind" value="operation"/><input type="hidden" name="line_id" value={o.id}/><SubmitButton className="button button-outline">Eliminar ítem</SubmitButton></form></details>)}</section>
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">COBRO</div><h2>Agregar concepto valorizado</h2></div></div><p className="helper-text">Para disposición en UF por tonelada, deje cantidad vacía: se calcula desde los kg de disposición. Para arriendo, registre el valor UF contratado y la cantidad de unidades.</p><form action={saveStatementChargeAction} className="form-grid"><input type="hidden" name="statement_id" value={id}/><ChargeFields type={s.statement_type} next={charges.length+1}/><div className="field-full form-footer"><SubmitButton className="button button-primary">Agregar cobro</SubmitButton></div></form>
      {charges.map(c=><details key={c.id} className="edp-edit"><summary>Corregir cobro {c.line_number} · {c.description}</summary><form action={saveStatementChargeAction} className="form-grid"><input type="hidden" name="statement_id" value={id}/><ChargeFields type={s.statement_type} item={c} next={c.line_number}/><div className="field-full form-footer"><SubmitButton className="button button-outline">Guardar corrección</SubmitButton></div></form><form action={deleteStatementLineAction} className="edp-delete-form"><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="kind" value="charge"/><input type="hidden" name="line_id" value={c.id}/><SubmitButton className="button button-outline">Eliminar cobro</SubmitButton></form></details>)}</section></>}
    </div>
  </>;
}
