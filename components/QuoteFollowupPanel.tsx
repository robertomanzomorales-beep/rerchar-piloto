import Link from "next/link";
import {quoteClientOrderAction,quoteDocumentAction,quoteOrderExceptionAction} from "@/app/quote-actions";
import {SubmitButton} from "./Transition";
import type {getQuoteFollowup} from "@/lib/quote-followup";

type Followup=Awaited<ReturnType<typeof getQuoteFollowup>>;
const day=(value:Date|string|null)=>value?new Date(value).toLocaleDateString("es-CL",{timeZone:"UTC"}):"—";
const money=(value:string|number)=>`$${Number(value).toLocaleString("es-CL")}`;
export function QuoteFollowupPanel({id,data,editable,canAuthorizeException=false}:{id:string;data:Followup;editable:boolean;canAuthorizeException?:boolean}){
  const {quote,documents,services,statements,evidence}=data;
  const purchase=quote.commercial_kind==="compra_material";
  const statementByService=new Map<string,typeof statements>();
  for(const statement of statements){
    const group=statementByService.get(statement.service_id)??[];
    group.push(statement);
    statementByService.set(statement.service_id,group);
  }
  const invoiceCount=new Set([...services.map(service=>service.invoice_id),...statements.map(statement=>statement.invoice_id)].filter(Boolean)).size;
  const consolidatedInvoices=[...new Map(statements.filter(statement=>statement.invoice_id&&statement.invoice_total_clp!==null)
    .map(statement=>[statement.invoice_id,statement] as const)).values()];
  if(quote.status==="borrador")return null;
  return <section className="section-card"><div className="section-heading"><div><div className="eyebrow">DEL ACUERDO AL COBRO</div><h2>Seguimiento y documentos de esta cotización</h2></div></div>
    <p className="helper-text">Cada respaldo queda asociado al folio. Los documentos de ejecución se cargan desde el servicio y se consultan aquí.</p>
    <div className="facts-grid"><div className="fact">{purchase?<><span>Siguiente etapa de compra</span><strong>Recepción y guía valorizada</strong></>:<><span>Orden de compra del cliente</span><strong>{quote.client_order_reference??(quote.client_order_exception?"Excepción autorizada":"Pendiente")}</strong>{quote.client_order_on&&<small>{day(quote.client_order_on)}</small>}{quote.client_order_exception&&<small>{quote.client_order_exception}</small>}</>}</div>
      <div className="fact"><span>Servicios vinculados</span><strong>{services.length}</strong></div>
      <div className="fact"><span>Respaldos de operación</span><strong>{evidence.length}</strong></div>
      <div className="fact"><span>Facturas vinculadas</span><strong>{invoiceCount}</strong></div></div>
    {editable&&!purchase&&quote.status==="aceptada"&&<details className="quote-line-editor" open={!quote.client_order_reference}><summary><span>{quote.client_order_reference?"Corregir OC del cliente":"Registrar OC recibida del cliente"}</span><strong>OC</strong></summary>
      <form action={quoteClientOrderAction} className="form-grid"><input type="hidden" name="quote_id" value={id}/><label>Número / referencia<input name="reference" required minLength={2} maxLength={80} defaultValue={quote.client_order_reference??""}/></label><label>Fecha de recepción<input name="received_on" type="date" required defaultValue={quote.client_order_on?new Date(quote.client_order_on).toISOString().slice(0,10):""}/></label><p className="field-full helper-text">Si corrige el número o la fecha, adjunte nuevamente la OC que corresponde a esos datos antes de programar.</p><div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar OC</SubmitButton></div></form></details>}
    {!purchase&&quote.status==="aceptada"&&quote.client_order_reference&&!documents.some(doc=>doc.kind==="orden_compra"&&doc.is_current)&&<p className="resource-alert">Falta el respaldo de la OC vigente. El servicio se puede registrar, pero no programar hasta adjuntarlo.</p>}
    {canAuthorizeException&&!purchase&&quote.status==="aceptada"&&<details className="quote-line-editor"><summary><span>Cliente sin OC según acuerdo</span><strong>Excepción</strong></summary><p className="helper-text">Use esta opción sólo cuando el cliente no emita OC para este servicio puntual. La justificación y el responsable quedan en Auditoría; una OC registrada después sustituye la excepción.</p><form action={quoteOrderExceptionAction} className="form-grid"><input type="hidden" name="quote_id" value={id}/><label className="field-full">Acuerdo o motivo verificable<textarea name="reason" required minLength={10} maxLength={500} rows={2} defaultValue={quote.client_order_exception??""}/></label><div className="field-full form-footer"><SubmitButton className="button button-outline">Autorizar sin OC</SubmitButton></div></form></details>}
    {editable&&["enviada","aceptada"].includes(quote.status)&&<details className="quote-line-editor"><summary><span>{purchase?"Adjuntar respaldo comercial":"Adjuntar OC u otro respaldo comercial"}</span><strong>Archivo</strong></summary>
      <form action={quoteDocumentAction} className="form-grid"><input type="hidden" name="quote_id" value={id}/><label>Tipo<select name="kind" defaultValue={!purchase&&quote.client_order_reference?"orden_compra":"respaldo"}><option value="respaldo">Otro respaldo comercial</option>{!purchase&&quote.client_order_reference&&<option value="orden_compra">OC del cliente</option>}</select></label><label>PDF o imagen<input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"/></label><div className="field-full form-footer"><SubmitButton className="button button-outline">Adjuntar a cotización</SubmitButton></div></form></details>}
    {documents.length>0&&<ul className="record-list">{documents.map(doc=><li key={doc.id}><a href={`/api/cotizaciones/documentos/${doc.id}`}><strong>{doc.kind==="orden_compra"?"Orden de compra":"Respaldo"}: {doc.filename}</strong></a><small>{day(doc.uploaded_at)}{!doc.is_current&&" · OC anterior; adjunte la versión vigente"}</small></li>)}</ul>}
    {services.length===0?<p className="helper-text">{purchase?"Después de la aceptación, cree la solicitud de compra desde esta cotización. Registre la recepción y continúe con la solicitud de guía valorizada.":"Después de registrar la aceptación, cree la solicitud de servicio desde esta cotización. La programación exigirá la OC con su respaldo, o una excepción justificada."}</p>:services.map(service=>{
      const docs=evidence.filter(item=>item.service_id===service.id);
      const relatedStatements=statementByService.get(service.id)??[];
      const balance=Number(service.invoice_total_clp??0)-Number(service.paid_clp);
      return <div key={service.id} className="dossier-group"><h3><Link href={`/solicitudes/${service.id}`}>Servicio {service.folio}</Link> · {service.status}</h3>
        <div className="order-actions"><Link className="button button-outline" href={`/solicitudes/${service.id}`}>Programación y operación</Link>{service.service_type!=="arriendo"&&<Link className="button button-outline" href={`/solicitudes/${service.id}/guias`}>Guías y pesos</Link>}{editable&&<Link className="button button-outline" href={`/solicitudes/${service.id}`}>Adjuntar respaldo</Link>}{service.certificate_id&&<Link className="button button-outline" href={`/api/certificados/${service.certificate_id}/pdf`}>Certificado</Link>}</div>
        <p className="helper-text">{service.service_type==="arriendo"?"Arriendo sin pesaje":`Guía: ${service.guide_number??"pendiente"}`} · Fecha programada: {day(service.scheduled_for)} · Factura individual: {service.invoice_number??(relatedStatements.length?"gestionada en EDP":"pendiente")}{service.invoice_number?` · Cobrado ${money(service.paid_clp)} · Saldo ${money(Math.max(0,balance))}`:""}</p>
        {relatedStatements.length>0&&<ul className="record-list">{relatedStatements.map(statement=><li key={statement.id}><div><strong>Estado de pago {editable?<Link href={`/estados-pago/${statement.id}`}>N° {statement.number}</Link>:`N° ${statement.number}`}</strong><small>{statement.status} · Factura {statement.invoice_number??"pendiente"}</small></div></li>)}</ul>}
        {docs.length>0&&<ul className="record-list">{docs.map(doc=><li key={doc.id}><a href={`/api/evidencia/${doc.id}`}>{doc.document_kind.replaceAll("_"," ")} · {doc.original_filename??doc.description}</a></li>)}</ul>}
      </div>;
    })}
    {consolidatedInvoices.length>0&&<div className="dossier-group"><h3>Facturas consolidadas de E y J</h3><p className="helper-text">Cada importe corresponde a la factura completa del EDP y se muestra una sola vez, aunque cubra varios servicios o cotizaciones.</p><ul className="record-list">{consolidatedInvoices.map(invoice=><li key={invoice.invoice_id}><div><strong>Factura {invoice.invoice_number} · Total {money(invoice.invoice_total_clp??0)}</strong><small>Abonado {money(invoice.paid_clp)} · Saldo {money(Math.max(0,Number(invoice.invoice_total_clp)-Number(invoice.paid_clp)))}</small></div></li>)}</ul></div>}
  </section>;
}
