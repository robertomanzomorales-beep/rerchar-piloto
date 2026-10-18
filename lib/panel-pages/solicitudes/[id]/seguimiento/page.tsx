import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {getService,PilotError} from "@/lib/pilot";
import {getServiceLedger,LedgerError} from "@/lib/service-ledger";
import {saveGuideFollowupAction,saveCommercialAction} from "@/app/operation-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import PrintButton from "@/components/PrintButton";
import {companyName,serviceFolio} from "@/lib/companies";

const date=(v:Date|string|null|undefined)=>!v?"":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
export default async function ServiceFollowup({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor(),{id}=await params;
  let s;try{s=await getService(actor,id);}catch(e){if(e instanceof PilotError)notFound();throw e;}
  let ledger;try{ledger=await getServiceLedger(actor,id);}catch(e){if(e instanceof LedgerError)notFound();throw e;}
  const {followup:f,commercial:c}=ledger,query=await searchParams,isEyj=s.operating_company==="e_y_j";
  return <><div className="order-actions print-hide"><Link href={`/solicitudes/${id}`} className="back-link">← Servicio</Link>{s.operating_company&&<PrintButton label="Imprimir ficha comercial / PDF"/>}</div><div className="print-hide"><Notice error={query.error} ok={query.ok}/></div>
    {!s.operating_company&&<p role="alert" className="notice notice-error print-hide">Confirme la empresa operadora antes de imprimir esta ficha.</p>}
    <article className="order-sheet"><header className="order-header"><div><div className="order-system">{companyName(s.operating_company)}</div><h1>{isEyj?"Seguimiento comercial y documental":"Seguimiento del servicio y guías"}</h1></div><div className="order-number"><small>SERVICIO</small><h1>{serviceFolio(s)}</h1></div></header>
      <div className="order-section"><div className="order-grid">{([
        ["Cliente / faena",`${s.client_name} · ${s.site_name}`],["Ruta",`${s.origin} → ${s.destination}`],
        ["Cotización",c?.quote_reference||"—"],["Orden de compra cliente",c?.order_reference||"—"],
        ["Hoja de servicio",c?.service_sheet||"—"],["Guía E y J",c?.eyj_guide||"—"],
        ["Guía del cliente",c?.client_guide||"—"],["SIDREP",c?.sidrep||"—"],
        ["Días arriendo",c?.rental_days||"—"],["Cantidad",c?.quantity||"—"],
        ["Valor informado",c?.service_value_clp?`$${Number(c.service_value_clp).toLocaleString("es-CL")}`:"—"],
        ["Guía de despacho enviada",f?.dispatch_guide_status==="enviada"?"Sí":f?.dispatch_guide_status==="pendiente"?"Pendiente":f?.dispatch_guide_status==="no_aplica"?"No aplica":"Sin registrar"],
        ...(!isEyj?[["Guía valorizada solicitada",date(f?.requested_on)||"—"],["Recibida",date(f?.received_on)||"—"]] as [string,string][]:[]),
        ["Documentos enviados",date(f?.documents_sent_on)||"—"]] as [string,string][]).map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
        {c?.notes&&<p>Comercial: {c.notes}</p>}{f?.notes&&<p>Seguimiento: {f.notes}</p>}</div>
      <footer className="order-footer">Control operativo de propuestas, órdenes, guías, SIDREP y cierre documental.</footer></article>
    {canManage(actor)&&<div className="supply-columns print-hide"><section className="section-card"><h2>{isEyj?"Guía de despacho y cierre documental":"Guías y cierre documental"}</h2><form action={saveGuideFollowupAction} className="form-stack"><input type="hidden" name="service_id" value={id}/><label>Envío de guía de despacho<select name="dispatch_guide_status" defaultValue={f?.dispatch_guide_status??""}><option value="">Sin registrar</option><option value="pendiente">Pendiente</option><option value="enviada">Enviada</option><option value="no_aplica">No aplica</option></select></label>{!isEyj&&<><label>Guía valorizada solicitada<input type="date" name="requested_on" defaultValue={date(f?.requested_on)}/></label><label>Guía valorizada recibida<input type="date" name="received_on" defaultValue={date(f?.received_on)}/></label></>}<label>Documentos enviados al cierre<input type="date" name="documents_sent_on" defaultValue={date(f?.documents_sent_on)}/></label><label>Notas<textarea name="notes" rows={2} maxLength={500} defaultValue={f?.notes??""}/></label><SubmitButton className="button button-outline">Guardar seguimiento</SubmitButton></form></section>
      <section className="section-card"><h2>Datos comerciales y transporte</h2><form action={saveCommercialAction} className="form-stack"><input type="hidden" name="service_id" value={id}/><label>Cotización / propuesta<input name="quote_reference" maxLength={100} defaultValue={c?.quote_reference??""}/></label><label>Fecha cotización<input type="date" name="quote_on" defaultValue={date(c?.quote_on)}/></label><label>Orden de compra cliente<input name="order_reference" maxLength={100} defaultValue={c?.order_reference??""}/></label><label>Fecha orden<input type="date" name="order_on" defaultValue={date(c?.order_on)}/></label><label>Hoja de servicio<input name="service_sheet" maxLength={100} defaultValue={c?.service_sheet??""}/></label><label>Guía E y J<input name="eyj_guide" maxLength={100} defaultValue={c?.eyj_guide??""}/></label><label>Guía del cliente<input name="client_guide" maxLength={100} defaultValue={c?.client_guide??""}/></label><label>SIDREP<input name="sidrep" maxLength={100} defaultValue={c?.sidrep??""}/></label><label>Días de arriendo<input type="number" min="0" step="0.01" name="rental_days" defaultValue={c?.rental_days??""}/></label><label>Cantidad<input type="number" min="0" step="0.001" name="quantity" defaultValue={c?.quantity??""}/></label><label>Valor servicio ($)<input type="number" min="0" step="0.01" name="service_value_clp" defaultValue={c?.service_value_clp??""}/></label><label>Notas<textarea name="notes" rows={2} maxLength={700} defaultValue={c?.notes??""}/></label><SubmitButton className="button button-outline">Guardar datos comerciales</SubmitButton></form></section></div>}
  </>;
}
