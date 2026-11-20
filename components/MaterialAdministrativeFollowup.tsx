import type {MaterialReceipt} from "@/lib/materials";
import {materialInvoiceLabel,materialPaymentLabel} from "@/lib/material-labels";
import type {OperationFile} from "@/lib/operation-files";
import MaterialFollowupForm from "./MaterialFollowupForm";

const date=(v:Date|string|null)=>!v?"":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);

export default function MaterialAdministrativeFollowup({receipt:r,files,email,contactName}:{
  receipt:MaterialReceipt;files:OperationFile[];email:string|null;contactName:string|null;
}){
  const attached=(kind:string)=>files.find(f=>f.kind===kind);
  const guide=attached("guia_valorizada"),invoice=attached("factura"),proof=attached("comprobante"),certificate=attached("certificado");
  const noticeReady=Boolean(guide&&invoice&&r.valued_guide&&r.valued_guide_received_on&&r.invoice_number&&
    r.invoice_direction&&r.invoice_issued_on&&(!r.certificate_number||certificate));
  const validEmail=email&&/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email);
  const draft=`Estimados ${contactName||r.client_name}:\n\nCompartimos los documentos de la recepción de material del ${date(r.movement_on)} en ${r.site_name}:\n\nGuía valorizada: ${r.valued_guide||"pendiente"}\nFactura: ${r.invoice_number||"pendiente"}\n${r.certificate_number?`Certificado: ${r.certificate_number}\n`:""}Material: ${r.material_name}\nEstado de pago registrado: ${materialPaymentLabel(r.payment_status)}.\n\nAdjuntaremos manualmente la guía, la factura${r.certificate_number?" y el certificado":""} antes de enviar este correo. Agradecemos confirmar la recepción de los documentos.\n\nSaludos cordiales,\nRERCHAR Chile SpA`;
  const mailto=noticeReady&&validEmail?`mailto:${email}?subject=${encodeURIComponent(`Documentos del ingreso de material · ${r.client_name}`)}&body=${encodeURIComponent(draft)}`:null;
  const referenceValues={entry_sheet:r.entry_sheet??"",invoice_number:r.invoice_number??"",invoice_direction:r.invoice_direction??"",
    invoice_issued_on:date(r.invoice_issued_on),certificate_number:r.certificate_number??""};
  const paymentValues={payment_status:r.payment_status,paid_on:date(r.paid_on),payment_reference:r.payment_reference??""};
  const noticeValues={notified_on:date(r.closure_notified_on),recipient:r.closure_recipient??email??"",note:r.closure_note??""};
  const minimumNoticeDate=[date(r.valued_guide_received_on),date(r.invoice_issued_on)].sort().at(-1);
  return <>
    <section id="factura-documentos" className="section-card print-hide material-followup-section">
      <div className="eyebrow">DESPUÉS DE LA GUÍA VALORIZADA</div><h2>1. Factura y documentos</h2>
      <p className="helper-text">La planilla registra N° de factura. Confirme con Carol y Johana quién la emite y quién paga antes de seleccionar la dirección. Adjunte la factura para confirmarla; este registro no emite documentos tributarios.</p>
      <p>Guía valorizada: <strong>{r.valued_guide||"Pendiente"}</strong> · Factura: <strong>{r.invoice_number||"Pendiente"}</strong> · Dirección: <strong>{materialInvoiceLabel(r.invoice_direction)}</strong>.</p>
      <MaterialFollowupForm key={JSON.stringify(referenceValues)} kind="references" id={r.id} values={referenceValues}/>
      <p className="helper-text">Factura adjunta: {invoice?<a href={`/api/archivos-operacion/${invoice.id}`}>{invoice.filename}</a>:"pendiente"}. Si cambia la guía, factura o certificado, o adjunta una versión corregida después de registrar el aviso, el aviso vuelve a pendiente.</p>
    </section>
    <div className="supply-columns print-hide"><section id="pago-material" className="section-card material-followup-section">
      <h2>2. Seguimiento del pago</h2><p className="helper-text">El responsable de autorizar y pagar queda por confirmar. Para registrar pago parcial o total adjunte primero el comprobante e indique fecha y referencia.</p>
      <MaterialFollowupForm key={JSON.stringify(paymentValues)} kind="payment" id={r.id} values={paymentValues}/><p className="helper-text">Comprobante: {proof?<a href={`/api/archivos-operacion/${proof.id}`}>{proof.filename}</a>:"pendiente"}.</p>
    </section><section id="aviso-documental" className="section-card material-followup-section">
      <h2>3. Aviso documental al cliente</h2>
      <p className="helper-text">{r.closure_notified_on?`Aviso registrado el ${date(r.closure_notified_on)} para ${r.closure_recipient}.`:"Aún no consta un aviso de entrega documental."} El estado del pago se sigue por separado.</p>
      <p className="helper-text">Documentos para revisar y adjuntar al correo: {guide?<a href={`/api/archivos-operacion/${guide.id}`}>guía valorizada</a>:"guía pendiente"} · {invoice?<a href={`/api/archivos-operacion/${invoice.id}`}>factura</a>:"factura pendiente"}{r.certificate_number?<> · {certificate?<a href={`/api/archivos-operacion/${certificate.id}`}>certificado</a>:"certificado pendiente"}</>:null}.</p>
      <label>Borrador revisable<textarea readOnly rows={10} value={draft}/></label>
      {mailto&&<a className="button button-outline" href={mailto}>Abrir borrador en correo →</a>}
      <p className="helper-text">El borrador no envía el correo ni adjunta archivos. Descárguelos y agréguelos manualmente. Después de enviarlo, anote la fecha y el destinatario real.</p>
      <MaterialFollowupForm key={JSON.stringify(noticeValues)} kind="notice" id={r.id} values={noticeValues} disabled={!noticeReady} minimumNoticeDate={minimumNoticeDate}/>{!noticeReady&&<p className="helper-text">Para habilitar el aviso complete número, fecha y dirección de la factura y adjunte guía, factura y certificado si aplica.</p>}
    </section></div>
  </>;
}
