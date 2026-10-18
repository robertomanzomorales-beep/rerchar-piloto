import Link from "next/link";
import {quoteClientOrderAction,quoteDocumentAction} from "@/app/quote-actions";
import {SubmitButton} from "./Transition";
import type {getQuoteFollowup} from "@/lib/quote-followup";

type Followup=Awaited<ReturnType<typeof getQuoteFollowup>>;
const day=(value:Date|string|null)=>value?new Date(value).toLocaleDateString("es-CL",{timeZone:"UTC"}):"—";
const money=(value:string|number)=>`$${Number(value).toLocaleString("es-CL")}`;
export function QuoteFollowupPanel({id,data,editable}:{id:string;data:Followup;editable:boolean}){
  const {quote,documents,services,evidence}=data;
  if(quote.status==="borrador")return null;
  return <section className="section-card"><div className="section-heading"><div><div className="eyebrow">DEL ACUERDO AL COBRO</div><h2>Seguimiento y documentos de esta cotización</h2></div></div>
    <p className="helper-text">Cada respaldo queda asociado al folio. Los documentos de ejecución se cargan desde el servicio y se consultan aquí.</p>
    <div className="facts-grid"><div className="fact"><span>Orden de compra del cliente</span><strong>{quote.client_order_reference??"Pendiente"}</strong>{quote.client_order_on&&<small>{day(quote.client_order_on)}</small>}</div>
      <div className="fact"><span>Servicios vinculados</span><strong>{services.length}</strong></div>
      <div className="fact"><span>Respaldos de operación</span><strong>{evidence.length}</strong></div>
      <div className="fact"><span>Facturas vinculadas</span><strong>{services.filter(service=>service.invoice_number).length}</strong></div></div>
    {editable&&quote.status==="aceptada"&&<details className="quote-line-editor" open={!quote.client_order_reference}><summary><span>{quote.client_order_reference?"Corregir OC del cliente":"Registrar OC recibida del cliente"}</span><strong>OC</strong></summary>
      <form action={quoteClientOrderAction} className="form-grid"><input type="hidden" name="quote_id" value={id}/><label>Número / referencia<input name="reference" required minLength={2} maxLength={80} defaultValue={quote.client_order_reference??""}/></label><label>Fecha de recepción<input name="received_on" type="date" required defaultValue={quote.client_order_on?new Date(quote.client_order_on).toISOString().slice(0,10):""}/></label><div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar OC</SubmitButton></div></form></details>}
    {editable&&["enviada","aceptada"].includes(quote.status)&&<details className="quote-line-editor"><summary><span>Adjuntar OC u otro respaldo comercial</span><strong>Archivo</strong></summary>
      <form action={quoteDocumentAction} className="form-grid"><input type="hidden" name="quote_id" value={id}/><label>Tipo<select name="kind" defaultValue={quote.client_order_reference?"orden_compra":"respaldo"}><option value="respaldo">Otro respaldo comercial</option>{quote.client_order_reference&&<option value="orden_compra">OC del cliente</option>}</select></label><label>PDF o imagen<input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"/></label><div className="field-full form-footer"><SubmitButton className="button button-outline">Adjuntar a cotización</SubmitButton></div></form></details>}
    {documents.length>0&&<ul className="record-list">{documents.map(doc=><li key={doc.id}><a href={`/api/cotizaciones/documentos/${doc.id}`}><strong>{doc.kind==="orden_compra"?"Orden de compra":"Respaldo"}: {doc.filename}</strong></a><small>{day(doc.uploaded_at)}</small></li>)}</ul>}
    {services.length===0?<p className="helper-text">Después de registrar la aceptación y la OC, cree la solicitud de servicio desde esta cotización para iniciar la programación.</p>:services.map(service=>{
      const docs=evidence.filter(item=>item.service_id===service.id);
      const balance=Number(service.invoice_total_clp??0)-Number(service.paid_clp);
      return <div key={service.id} className="dossier-group"><h3><Link href={`/solicitudes/${service.id}`}>Servicio {service.folio}</Link> · {service.status}</h3>
        <div className="order-actions"><Link className="button button-outline" href={`/solicitudes/${service.id}`}>Programación y operación</Link><Link className="button button-outline" href={`/solicitudes/${service.id}/guias`}>Guías y pesos</Link>{editable&&<Link className="button button-outline" href={`/solicitudes/${service.id}`}>Adjuntar respaldo</Link>}{service.certificate_id&&<Link className="button button-outline" href={`/api/certificados/${service.certificate_id}/pdf`}>Certificado</Link>}</div>
        <p className="helper-text">Guía: {service.guide_number??"pendiente"} · Fecha programada: {day(service.scheduled_for)} · Factura: {service.invoice_number??"pendiente"}{service.invoice_number?` · Cobrado ${money(service.paid_clp)} · Saldo ${money(Math.max(0,balance))}`:""}</p>
        {docs.length>0&&<ul className="record-list">{docs.map(doc=><li key={doc.id}><a href={`/api/evidencia/${doc.id}`}>{doc.document_kind.replaceAll("_"," ")} · {doc.original_filename??doc.description}</a></li>)}</ul>}
      </div>;
    })}
  </section>;
}
