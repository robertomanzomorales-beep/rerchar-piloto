import type {MaterialReceipt} from "@/lib/materials";
import type {OperationFile} from "@/lib/operation-files";
import {recordMaterialClosureNotificationAction,updateMaterialPaymentAction,updateMaterialReferencesAction} from "@/app/operation-actions";
import {SubmitButton} from "@/components/Transition";

const date=(v:Date|string|null)=>!v?"":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);

export default function MaterialAdministrativeFollowup({receipt:r,files,email,contactName}:{
  receipt:MaterialReceipt;files:OperationFile[];email:string|null;contactName:string|null;
}){
  const attached=(kind:string)=>files.find(f=>f.kind===kind);
  const guide=attached("guia_valorizada"),invoice=attached("factura"),proof=attached("comprobante"),certificate=attached("certificado");
  const noticeReady=Boolean(guide&&invoice&&r.valued_guide&&r.valued_guide_received_on&&r.invoice_number&&
    r.invoice_direction&&r.invoice_issued_on&&(!r.certificate_number||certificate));
  const validEmail=email&&/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email);
  const draft=`Estimados ${contactName||r.client_name}:\n\nCompartimos los documentos de la recepción de material del ${date(r.movement_on)} en ${r.site_name}:\n\nGuía valorizada: ${r.valued_guide||"pendiente"}\nFactura: ${r.invoice_number||"pendiente"}\n${r.certificate_number?`Certificado: ${r.certificate_number}\n`:""}Material: ${r.material_name}\nEstado de pago registrado: ${r.payment_status}.\n\nAdjuntaremos manualmente la guía, la factura${r.certificate_number?" y el certificado":""} antes de enviar este correo. Agradecemos confirmar la recepción de los documentos.\n\nSaludos cordiales,\nRERCHAR Chile SpA`;
  const mailto=noticeReady&&validEmail?`mailto:${email}?subject=${encodeURIComponent(`Documentos del ingreso de material · ${r.client_name}`)}&body=${encodeURIComponent(draft)}`:null;
  return <>
    <section className="section-card print-hide">
      <div className="eyebrow">DESPUÉS DE LA GUÍA VALORIZADA</div><h2>1. Factura y documentos</h2>
      <p className="helper-text">La planilla registra N° de factura. Confirme con Carol y Johana quién la emite y quién paga antes de seleccionar la dirección. Adjunte la factura para confirmarla; este registro no emite documentos tributarios.</p>
      <p>Guía valorizada: <strong>{r.valued_guide||"Pendiente"}</strong> · Factura: <strong>{r.invoice_number||"Pendiente"}</strong> · Dirección: <strong>{r.invoice_direction||"Por confirmar"}</strong>.</p>
      <form action={updateMaterialReferencesAction} className="form-grid"><input type="hidden" name="id" value={r.id}/>
        <label>N° hoja de ingreso<input name="entry_sheet" defaultValue={r.entry_sheet??""} maxLength={80}/></label>
        <label>N° factura<input name="invoice_number" defaultValue={r.invoice_number??""} maxLength={80}/></label>
        <label>Dirección de la factura<select name="invoice_direction" defaultValue={r.invoice_direction??""}><option value="">Por confirmar con administración</option><option value="emitida">Emitida por RERCHAR</option><option value="recibida">Recibida por RERCHAR</option></select></label>
        <label>Fecha de factura<input name="invoice_issued_on" type="date" defaultValue={date(r.invoice_issued_on)}/></label>
        <label>N° certificado, si corresponde<input name="certificate_number" defaultValue={r.certificate_number??""} maxLength={80}/></label>
        <div className="field-full form-footer"><SubmitButton className="button button-outline">Guardar factura y referencias</SubmitButton></div>
      </form>
      <p className="helper-text">Factura adjunta: {invoice?<a href={`/api/archivos-operacion/${invoice.id}`}>{invoice.filename}</a>:"pendiente"}. Si cambia la guía, factura o certificado después de registrar el aviso, el aviso vuelve a pendiente.</p>
    </section>
    <div className="supply-columns print-hide"><section className="section-card">
      <h2>2. Seguimiento del pago</h2><p className="helper-text">El responsable de autorizar y pagar queda por confirmar. Para registrar pago parcial o total adjunte primero el comprobante e indique fecha y referencia.</p>
      <form action={updateMaterialPaymentAction} className="form-stack"><input type="hidden" name="id" value={r.id}/>
        <label>Estado<select name="payment_status" defaultValue={r.payment_status}><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagado">Pagado</option><option value="no_aplica">No aplica</option></select></label>
        <label>Fecha del pago o abono<input name="paid_on" type="date" defaultValue={date(r.paid_on)}/></label>
        <label>Referencia de comprobante<input name="payment_reference" maxLength={120} defaultValue={r.payment_reference??""}/></label>
        <SubmitButton className="button button-outline">Guardar estado de pago</SubmitButton>
      </form><p className="helper-text">Comprobante: {proof?<a href={`/api/archivos-operacion/${proof.id}`}>{proof.filename}</a>:"pendiente"}.</p>
    </section><section className="section-card">
      <h2>3. Aviso documental al cliente</h2>
      <p className="helper-text">{r.closure_notified_on?`Aviso registrado el ${date(r.closure_notified_on)} para ${r.closure_recipient}.`:"Aún no consta un aviso de entrega documental."} El estado del pago se sigue por separado.</p>
      <p className="helper-text">Documentos para revisar y adjuntar al correo: {guide?<a href={`/api/archivos-operacion/${guide.id}`}>guía valorizada</a>:"guía pendiente"} · {invoice?<a href={`/api/archivos-operacion/${invoice.id}`}>factura</a>:"factura pendiente"}{r.certificate_number?<> · {certificate?<a href={`/api/archivos-operacion/${certificate.id}`}>certificado</a>:"certificado pendiente"}</>:null}.</p>
      <label>Borrador revisable<textarea readOnly rows={10} value={draft}/></label>
      {mailto&&<a className="button button-outline" href={mailto}>Abrir borrador en correo →</a>}
      <p className="helper-text">El borrador no envía el correo ni adjunta archivos. Descárguelos y agréguelos manualmente. Después de enviarlo, anote la fecha y el destinatario real.</p>
      <form action={recordMaterialClosureNotificationAction} className="form-stack"><input type="hidden" name="id" value={r.id}/>
        <label>Fecha del aviso<input name="notified_on" type="date" required defaultValue={date(r.closure_notified_on)}/></label>
        <label>Destinatario real (correo o nombre)<input name="recipient" maxLength={180} required defaultValue={r.closure_recipient??email??""}/></label>
        <label>Medio y observaciones<textarea name="note" rows={2} maxLength={500} defaultValue={r.closure_note??""}/></label>
        <SubmitButton className="button button-outline" disabled={!noticeReady}>Registrar aviso enviado</SubmitButton>
      </form>{!noticeReady&&<p className="helper-text">Para habilitar el aviso complete número, fecha y dirección de la factura y adjunte guía, factura y certificado si aplica.</p>}
    </section></div>
  </>;
}
