import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {PaymentStatementError,getPaymentStatement,getStatementInvoice,listStatementServices,latestStatementDelivery,statementMailConfigured,type Operation,type Charge} from "@/lib/payment-statements";
import {deleteStatementLineAction,setStatementStatusAction} from "@/app/payment-statement-actions";
import StatementDetailForm from "@/components/StatementDetailForm";
import {nextStatementLine,statementDetailFields,type StatementDetailKind,type StatementDetailValues} from "@/lib/statement-detail-state";
import {chileCsvDay} from "@/lib/chile-csv";
import {serviceFolio} from "@/lib/companies";
import {Notice} from "@/components/UI";
import WorkflowNavigation from "@/components/WorkflowNavigation";
import {SubmitButton} from "@/components/Transition";
import PrintButton from "@/components/PrintButton";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

const money=(value:number|null)=>value==null?"Pendiente":`$${value.toLocaleString("es-CL")}`;
const number=(value:string|number|null)=>value==null?"—":Number(value).toLocaleString("es-CL",{maximumFractionDigits:3});
const iso=(v:Date|string|null)=>!v?"":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const date=(v:Date|string|null)=>!v?"—":new Intl.DateTimeFormat("es-CL",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(v));
const month=(v:Date|string)=>new Intl.DateTimeFormat("es-CL",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(v));

function operationDefaults(item:Operation):StatementDetailValues{
  return Object.fromEntries(statementDetailFields.operation.map(key=>[key,key==="line_id"?item.id:key==="is_disposal"?item.is_disposal?"1":"0":["operation_on","rental_from","rental_to"].includes(key)?iso(item[key as keyof Operation] as Date|string|null):String(item[key as keyof Operation]??"")]));
}
function chargeDefaults(item:Charge):StatementDetailValues{
  return Object.fromEntries(statementDetailFields.charge.map(key=>[key,key==="line_id"?item.id:key==="uf_on"?iso(item.uf_on):String(item[key as keyof Charge]??"")]));
}

export default async function StatementDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string;formulario_edp?:string;origen_edp?:string;item?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  if(!await moduleReady("edp"))return <ModuleUnavailable title="Estado de pago" company="e_y_j"/>;
  const {id}=await params;
  let detail;try{detail=await getPaymentStatement(actor,id);}catch(error){if(error instanceof PaymentStatementError)notFound();throw error;}
  const query=await searchParams,{statement:s,operations,charges,totals}=detail;
  const activeKind=typeof query.formulario_edp==="string"&&Object.hasOwn(statementDetailFields,query.formulario_edp)?query.formulario_edp as StatementDetailKind:undefined;
  const sourceKind=activeKind??(typeof query.origen_edp==="string"&&Object.hasOwn(statementDetailFields,query.origen_edp)?query.origen_edp as StatementDetailKind:undefined);
  const formKey=(kind:StatementDetailKind,line="")=>`${kind}:${line}:${query.origen_edp===kind?query.ok??"":""}`;
  const deliveryReady=await moduleReady("edp_delivery");
  const delivery=deliveryReady?await latestStatementDelivery(actor,id):null;
  const pendingDelivery=delivery?.status==="enviando"||delivery?.status==="verificar";
  const canResolveDelivery=delivery?.status==="verificar"||delivery?.status==="enviando"&&Date.now()-new Date(delivery.created_at).getTime()>=120_000;
  const edit=actor.role==="admin"&&["borrador","observado"].includes(s.status)&&!pendingDelivery;
  const showEditControls=actor.role==="admin"&&(edit||!!activeKind&&["operation","service","charge"].includes(activeKind));
  const importReady=showEditControls&&await moduleReady("edp_service_import");
  const available=importReady?await listStatementServices(actor,id):[];
  const billingReady=await moduleReady("edp_billing");
  const orderReady=await moduleReady("edp_client_order");
  const invoice=billingReady?await getStatementInvoice(actor,s):null;
  const nextOperation=nextStatementLine(operations,200),nextCharge=nextStatementLine(charges,100);
  const formProps={statementId:id,format:s.statement_type,today:chileCsvDay()};
  const importable=(service:typeof available[number])=>s.statement_type==="residuos"?Boolean(service.operation_on&&service.weight_kg&&Number(service.weight_kg)>0):Boolean(service.rental_from&&service.rental_to);
  const unavailable=available.filter(service=>!importable(service));
  const hasImportable=available.some(importable);
  const serviceChoices=available.map(service=>({id:service.id,disabled:!importable(service),label:`${serviceFolio({folio:service.folio,operating_company:"e_y_j"})} · ${service.service_type} · ${service.waste_type} · ${s.statement_type==="residuos"?`${iso(service.operation_on)} · ${number(service.weight_kg)} kg`:`${iso(service.rental_from)} al ${iso(service.rental_to)}`}${service.transport_used?" · transporte incorporado":""}${service.disposal_used?" · disposición incorporada":""}${!importable(service)?" · requiere revisión":""}`}));
  return <>
    <div className="order-actions print-hide"><Link href="/estados-pago" className="back-link">← Estados de pago</Link><a href={`/api/estados-pago/${id}/pdf`} className="button button-primary">Descargar EDP en PDF</a><PrintButton label="Imprimir vista"/></div>
    <div className="print-hide"><Notice error={query.error} ok={query.ok}/></div>
    <WorkflowNavigation label={`Estado de pago N° ${s.number}`} items={[{id:"resumen-edp",label:"Documento",detail:month(s.period_on)},...(edit?[{id:importReady?"servicios-edp":"operaciones-edp",label:"Operaciones",detail:`${operations.length} ${operations.length===1?"ítem":"ítems"}`},{id:"cobros-edp",label:"Valorización",detail:`${charges.length} ${charges.length===1?"concepto":"conceptos"}`}]:[]),{id:"control-edp",label:"Entrega y estado",detail:s.status.charAt(0).toUpperCase()+s.status.slice(1)},...(orderReady?[{id:"oc-edp",label:"OC del cliente",detail:s.client_order_reference||"Seguimiento"}]:[]),...(billingReady?[{id:"factura-edp",label:"Factura y cobro",detail:invoice?.invoice_number||"Seguimiento"}]:[])]}/>
    <article id="resumen-edp" className="order-sheet edp-sheet"><header className="edp-header"><div><strong>EMPRESA DE SERVICIOS INTEGRALES E Y J LTDA.</strong><span>RUT 76.347.909-9{s.issuer_contact&&` · Contacto: ${s.issuer_contact}`}</span></div><div><small>ESTADO DE PAGO</small><strong>N° {s.number}</strong></div></header>
      <div className="edp-recipient"><div><small>Empresa</small><strong>{s.client_name}</strong></div><div><small>RUT</small><strong>{s.client_tax_id}</strong></div><div><small>Domicilio</small><strong>{s.client_address}</strong></div><div><small>Contacto</small><strong>{s.client_contact}</strong></div><div><small>Período</small><strong>{month(s.period_on)}</strong></div>{s.contract_reference&&<div><small>Contrato</small><strong>{s.contract_reference}</strong></div>}</div>
      <section className="edp-section"><h2>{s.statement_type==="residuos"?"Servicios y respaldo operativo":"Detalle de arriendo"}</h2><div className="table-wrap" role="region" aria-label="Respaldo operativo del EDP" tabIndex={0}><table className="data-table"><thead><tr><th>Ítem</th>{s.statement_type==="residuos"?<><th>Fecha</th><th>Descripción</th><th>Peso kg</th><th>Ticket</th><th>Hoja de servicio</th><th>Guía</th><th>SIDREP</th></>:<><th>Descripción</th><th>Desde</th><th>Hasta</th></>}</tr></thead><tbody>{operations.map(o=><tr key={o.id}><td>{o.line_number}</td>{s.statement_type==="residuos"?<><td>{date(o.operation_on)}</td><td>{o.description}{o.is_disposal&&<small className="table-sub">Disposición final</small>}</td><td>{number(o.weight_kg)}</td><td>{o.weighing_ticket||"—"}</td><td>{o.service_sheet||"—"}</td><td>{o.guide_number||"—"}</td><td>{o.sidrep||"—"}</td></>:<><td>{o.description}</td><td>{date(o.rental_from)}</td><td>{date(o.rental_to)}</td></>}</tr>)}</tbody></table>{!operations.length&&<p className="muted">Faltan los ítems del respaldo operativo.</p>}</div></section>
      <section className="edp-section"><h2>Valorización</h2><div className="table-wrap" role="region" aria-label="Valorización del EDP" tabIndex={0}><table className="data-table"><thead><tr><th>Descripción</th><th>Valor unitario</th><th>Valor UF / fecha</th><th>Cantidad</th><th>Total CLP</th></tr></thead><tbody>{totals.lines.map(({charge,quantity,total_clp})=><tr key={charge.id}><td>{charge.description}</td><td>{number(charge.unit_value)} {charge.pricing==="clp_servicio"?"CLP":"UF"}</td><td>{charge.uf_value_clp?`${money(Number(charge.uf_value_clp))} · ${date(charge.uf_on)}`:"—"}</td><td>{quantity==null?"Pendiente peso disposición":`${number(quantity)} ${charge.pricing==="uf_ton"?"ton":"un."}`}</td><td>{money(total_clp)}</td></tr>)}</tbody></table>{!charges.length&&<p className="muted">Faltan los conceptos valorizados.</p>}</div>
        <div className="edp-totals"><div><span>Total neto estado de pago</span><strong>{money(totals.net_clp)}</strong></div><div><span>IVA 19%</span><strong>{money(totals.vat_clp)}</strong></div><div><span>Total estado de pago</span><strong>{money(totals.total_clp)}</strong></div></div>
        {totals.disposal_tons!=null&&<p className="helper-text">Toneladas de disposición: {number(totals.disposal_tons)} ton, calculadas con los kg de ítems marcados «Disposición final».</p>}
      </section>{s.notes&&<p className="edp-notes">{s.notes}</p>}
      <footer className="edp-footer"><span>Administrador de contrato: {s.contract_manager||"Pendiente de informar"}</span><span>Registro {s.status} · no sustituye factura tributaria.</span></footer>
    </article>
    <div className="print-hide edp-controls"><section id="control-edp" className="section-card"><div className="section-heading"><div><div className="eyebrow">CONTROL ADMINISTRATIVO</div><h2>Estado: <span className={`edp-status edp-status-${s.status}`}>{s.status}</span></h2></div></div>
      <p className="helper-text">Un borrador se entrega después de registrar operaciones y cobros. «Aprobado» cierra el documento interno; las facturas y pagos se gestionan aparte.</p>
      {delivery&&<p className="helper-text">Última entrega: {delivery.channel==="smtp"?"correo del sistema":delivery.channel==="correo_manual"?"correo manual":delivery.channel} · {delivery.status}{delivery.recipient?` · ${delivery.recipient}`:""}{delivery.reference?` · ${delivery.reference}`:""}.</p>}
      {!deliveryReady&&<p role="status" className="helper-text">La entrega de EDP estará disponible al aplicar la migración de correo y respaldo PDF.</p>}
      {actor.role==="admin"&&deliveryReady&&(edit||activeKind==="send"||activeKind==="manual")&&<div className="edp-delivery-forms">
        {(statementMailConfigured()||activeKind==="send")?<StatementDetailForm key={formKey("send")} kind="send" {...formProps} defaults={{recipient:s.client_contact.includes("@")?s.client_contact:""}} disabled={!edit||!statementMailConfigured()}/>:<p className="helper-text">El envío automático se habilita al configurar SMTP. Puede entregar el PDF por el medio acordado y registrar la constancia abajo.</p>}
        <StatementDetailForm key={formKey("manual")} kind="manual" {...formProps} defaults={{recipient:s.client_contact.includes("@")?s.client_contact:""}} disabled={!edit}/>
      </div>}
      {actor.role==="admin"&&(pendingDelivery||activeKind==="resolve")&&<div className="edp-delivery-forms">{pendingDelivery&&<p role="alert" className="resource-alert">El correo no tiene confirmación definitiva. Compruebe la bandeja de salida antes de repetirlo. La edición está pausada mientras se verifica.</p>}{(canResolveDelivery||activeKind==="resolve")&&<StatementDetailForm key={formKey("resolve")} kind="resolve" {...formProps} disabled={!canResolveDelivery}/>}</div>}
      {actor.role==="admin"&&<div className="edp-status-actions">{s.status==="enviado"&&<><form action={setStatementStatusAction}><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="status" value="aprobado"/><SubmitButton className="button button-primary">Marcar aprobado</SubmitButton></form><form action={setStatementStatusAction}><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="status" value="observado"/><SubmitButton className="button button-outline">Marcar observado</SubmitButton></form></>}{s.status==="observado"&&!pendingDelivery&&<form action={setStatementStatusAction}><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="status" value="borrador"/><SubmitButton className="button button-outline">Volver a borrador</SubmitButton></form>}</div>}
    </section>
    {orderReady&&<section id="oc-edp" className="section-card"><div className="section-heading"><div><div className="eyebrow">CONTRATO MENSUAL · E Y J</div><h2>OC del cliente después del EDP</h2></div></div>
      <p className="helper-text">Para servicios de contrato se consolidan las operaciones del mes, se envía el estado de pago y después se registra la OC recibida del cliente. Francisco emite la factura fuera del sistema y la asocia aquí. Los servicios puntuales conservan su OC previa en la ficha del servicio.</p>
      {s.client_order_reference?<p>OC del cliente <strong>{s.client_order_reference}</strong> · Recibida {date(s.client_order_on)}</p>:s.client_order_exception?<p>Sin OC emitida por el cliente: <strong>{s.client_order_exception}</strong></p>:<p role="status" className="helper-text">OC pendiente de recibir o excepción pendiente de justificar.</p>}
      {actor.role==="admin"&&(["enviado","aprobado"].includes(s.status)&&!invoice||activeKind==="order")&&<StatementDetailForm key={formKey("order")} kind="order" {...formProps} defaults={{client_order_reference:s.client_order_reference??"",client_order_on:iso(s.client_order_on),client_order_exception:s.client_order_exception??""}} disabled={!["enviado","aprobado"].includes(s.status)||!!invoice}/>}
    </section>}
    {billingReady&&<section id="factura-edp" className="section-card"><div className="section-heading"><div><div className="eyebrow">FACTURA EXTERNA · E Y J</div><h2>EDP a cobranza</h2></div></div>
      {invoice?<><p>Factura <strong>{invoice.invoice_number}</strong> · {invoice.status} · Emisión {date(invoice.issued_on)} · Vencimiento {date(invoice.due_on)}</p>
        <p>Total de factura <strong>{money(Number(invoice.total_clp))}</strong> · Abonado {money(Number(invoice.paid_clp))} · Saldo <strong>{money(Math.max(0,Number(invoice.total_clp)-Number(invoice.paid_clp)))}</strong></p>
        {s.invoice_variance_note&&<p className="helper-text">Diferencia respecto del EDP: {s.invoice_variance_note}</p>}
        <Link className="text-link" href={invoice.source==="servicio"&&invoice.service_id?`/finanzas/${invoice.service_id}`:"/cobranzas?empresa=e_y_j"}>Abrir cobranza y pagos →</Link></>:
        s.status==="aprobado"&&actor.role==="admin"?<p className="helper-text">Registre primero la OC del cliente (o una excepción justificada). Después asocie el folio, fechas y total real de la factura emitida fuera del sistema. Si el folio ya existe en Finanzas o Cobranza para este cliente, se vinculará sin sumar otra factura. Explique cualquier diferencia con el EDP ({money(totals.total_clp)}).</p>:<p className="helper-text">Este EDP todavía no tiene una factura asociada. Se habilita al aprobarlo.</p>}
      {actor.role==="admin"&&(!invoice&&s.status==="aprobado"||activeKind==="invoice")&&<StatementDetailForm key={formKey("invoice")} kind="invoice" {...formProps} disabled={!!invoice||s.status!=="aprobado"||!orderReady||!s.client_order_reference&&!s.client_order_exception}/>}
    </section>}
    {showEditControls&&<>{importReady&&<section id="servicios-edp" className="section-card"><div className="section-heading"><div><div className="eyebrow">DESDE OPERACIONES</div><h2>Incorporar servicio ejecutado</h2></div></div>
      <p className="helper-text">Se copian fecha, peso y respaldos del servicio de E y J para revisión. El transporte y la disposición pueden ser dos ítems del mismo servicio. Los valores comerciales se registran en «Cobro».</p>
      {available.length||activeKind==="service"?<StatementDetailForm key={formKey("service")+":"+nextOperation} kind="service" {...formProps} next={nextOperation} services={serviceChoices} disabled={!edit||!hasImportable}/>:<p className="muted">No hay servicios completados disponibles para este cliente y formato. Revise la empresa, el cierre y el pesaje en Operaciones.</p>}
      {unavailable.length>0&&<div className="workflow-review-note"><p>Antes de incorporar estos servicios, revise su fecha y pesaje. Se conserva el peso registrado, incluido cero.</p><ul>{unavailable.map(service=><li key={service.id}><Link href={`/solicitudes/${service.id}`}>Revisar servicio EYJ-{String(service.folio).padStart(5,"0")}</Link><span>{s.statement_type==="residuos"?`${number(service.weight_kg)} kg` : "Período incompleto"}</span></li>)}</ul></div>}</section>}
      <section id="operaciones-edp" className="section-card"><div className="section-heading"><div><div className="eyebrow">RESPALDO</div><h2>Agregar ítem operativo manual</h2></div></div><StatementDetailForm key={formKey("operation")+":"+nextOperation} kind="operation" {...formProps} next={nextOperation} disabled={!edit}/>
      {operations.map(o=><details key={o.id} id={`item-operativo-${o.id}`} className="edp-edit finance-section" open={query.item===o.id&&(sourceKind==="operation"||sourceKind==="service")}><summary>Corregir ítem {o.line_number} · {o.description}{o.service_id?" · vinculado a servicio":""}</summary>{o.service_id&&<p className="helper-text">Fuente: <Link href={`/solicitudes/${o.service_id}`}>ver servicio original</Link>. Esta fila conserva una copia editable del respaldo.</p>}<StatementDetailForm key={formKey("operation",o.id)} kind="operation" {...formProps} lineId={o.id} defaults={operationDefaults(o)} disabled={!edit}/><form action={deleteStatementLineAction} className="edp-delete-form"><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="kind" value="operation"/><input type="hidden" name="line_id" value={o.id}/><SubmitButton className="button button-outline">Eliminar ítem</SubmitButton></form></details>)}</section>
      <section id="cobros-edp" className="section-card"><div className="section-heading"><div><div className="eyebrow">COBRO</div><h2>Agregar concepto valorizado</h2></div></div><p className="helper-text">Para disposición en UF por tonelada, deje cantidad vacía: se calcula desde los kg de disposición. Para arriendo, registre el valor UF contratado y la cantidad de unidades.</p><StatementDetailForm key={formKey("charge")+":"+nextCharge} kind="charge" {...formProps} next={nextCharge} disabled={!edit}/>
      {charges.map(c=><details key={c.id} id={`cobro-edp-${c.id}`} className="edp-edit finance-section" open={query.item===c.id&&sourceKind==="charge"}><summary>Corregir cobro {c.line_number} · {c.description}</summary><StatementDetailForm key={formKey("charge",c.id)} kind="charge" {...formProps} lineId={c.id} defaults={chargeDefaults(c)} disabled={!edit}/><form action={deleteStatementLineAction} className="edp-delete-form"><input type="hidden" name="statement_id" value={id}/><input type="hidden" name="kind" value="charge"/><input type="hidden" name="line_id" value={c.id}/><SubmitButton className="button button-outline">Eliminar cobro</SubmitButton></form></details>)}</section></>}
    </div>
  </>;
}
