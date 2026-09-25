import Link from "next/link";
import {ArrowLeft,FileCheck2,ExternalLink} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {getWasteRecord} from "@/lib/compliance";
import {chileDate} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {observeWasteAction,recordDeclarationAction,reviewWasteAction,saveWasteAction} from "@/app/compliance-actions";

export default async function WasteRecordDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor();
  const {id}=await params;
  const [{record:r,events},notice]=await Promise.all([getWasteRecord(actor,id),searchParams]);
  const editable=r.status==="borrador"||r.status==="observado";
  return <>
    <div className="page-title-row"><div><div className="eyebrow">REGISTRO AMBIENTAL INTERNO</div><h1>RER-{String(r.folio).padStart(5,"0")} · {r.client_name}</h1><p className="page-intro">{r.site_name} · {r.waste_type} · {r.quantity_kg} kg netos · Estado: {r.status}</p></div><Link className="button button-outline" href={`/solicitudes/${r.service_id}`}>Ver servicio <ExternalLink size={16}/></Link></div>
    {notice.error&&<p className="form-error" role="alert">{notice.error}</p>}{notice.ok&&<p className="form-success">Registro actualizado.</p>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">FICHA</div><h2><FileCheck2 size={18}/> Información para revisión</h2></div></div>
      <p className="helper-text">Categoría y datos registrados por el equipo; deben verificarse con los documentos de la operación. {r.evidence_count} evidencia(s) adjunta(s) al servicio. La ficha no realiza ningún envío oficial.</p>
      {editable?<form action={saveWasteAction} className="form-grid detail-form"><input type="hidden" name="service_id" value={r.service_id}/>
        <label>Categoría<select name="category" defaultValue={r.category}><option value="no_peligroso">No peligroso</option><option value="peligroso">Peligroso</option></select></label>
        <label>Clasificación<input name="classification" defaultValue={r.classification} required maxLength={120}/></label>
        <label>Generador<input name="generator_name" defaultValue={r.generator_name} required maxLength={160}/></label>
        <label>Transportista<input name="transporter_name" defaultValue={r.transporter_name} required maxLength={160}/></label>
        <label>Receptor<input name="receiver_name" defaultValue={r.receiver_name} required maxLength={160}/></label>
        <label>Tratamiento / destino<input name="treatment" defaultValue={r.treatment} required maxLength={160}/></label>
        <label>Guía / documento<input name="guide_number" defaultValue={r.guide_number} required maxLength={80}/></label>
        <div className="field-full form-footer"><SubmitButton className="button button-outline">Guardar cambios</SubmitButton></div>
      </form>:<div className="facts-grid"><div className="fact"><span>Categoría</span><strong>{r.category.replaceAll("_"," ")}</strong></div><div className="fact"><span>Clasificación</span><strong>{r.classification}</strong></div><div className="fact"><span>Generador</span><strong>{r.generator_name}</strong></div><div className="fact"><span>Transportista</span><strong>{r.transporter_name}</strong></div><div className="fact"><span>Receptor</span><strong>{r.receiver_name}</strong></div><div className="fact"><span>Tratamiento / destino</span><strong>{r.treatment}</strong></div><div className="fact"><span>Guía</span><strong>{r.guide_number}</strong></div><div className="fact"><span>Declaración registrada</span><strong>{r.external_system&&r.external_reference?`${r.external_system} · ${r.external_reference}`:"Pendiente"}</strong></div></div>}
    </section>
    {r.review_note&&<section className="section-card"><h2>Observación pendiente</h2><p>{r.review_note}</p></section>}
    {actor.role==="admin"&&<section className="section-card"><div className="eyebrow">CONTROL INTERNO</div><h2>Revisión y declaración</h2>
      {r.status==="borrador"&&<form action={reviewWasteAction} className="form-stack"><input type="hidden" name="id" value={id}/><p className="helper-text">Compruebe clasificación, pesaje, guía, receptor y evidencia antes de revisar.</p><SubmitButton className="button button-primary">Marcar revisado</SubmitButton></form>}
      {r.status==="revisado"&&<form action={recordDeclarationAction} className="form-grid detail-form"><input type="hidden" name="id" value={id}/><p className="field-full helper-text">Ingrese el folio sólo después de registrar la declaración en {r.category==="peligroso"?"SIDREP":"SINADER"}. Este formulario no se comunica con el portal.</p><label>Referencia externa<input name="external_reference" minLength={2} maxLength={120} required/></label><label>Fecha de declaración<input name="reported_on" type="date" required/></label><div className="field-full form-footer"><SubmitButton className="button button-primary">Registrar constancia manual</SubmitButton></div></form>}
      {(r.status==="revisado"||r.status==="declarado")&&<form action={observeWasteAction} className="form-stack"><input type="hidden" name="id" value={id}/><label>Motivo de corrección u observación<textarea name="reason" minLength={5} maxLength={500} required rows={2}/></label><SubmitButton className="button button-outline">Observar y abrir corrección</SubmitButton></form>}
      {r.status==="observado"&&<p className="helper-text">Corrija y guarde la ficha para volver a enviarla a revisión.</p>}
      {(r.status==="revisado"||r.status==="declarado")&&<Link className="button button-primary" href={`/certificados?service_id=${r.service_id}`}>Continuar a certificados →</Link>}
    </section>}
    <section className="section-card"><div className="eyebrow">HISTORIAL INALTERABLE</div><h2>Movimientos de la ficha</h2><ol className="timeline">{events.map(e=><li key={e.id}><span className="timeline-marker"/><strong>{e.action} · {e.actor_name}</strong><small>{chileDate(e.created_at)}{e.reason?` · ${e.reason}`:""}</small></li>)}</ol></section>
    <Link className="back-link" href="/cumplimiento"><ArrowLeft size={16}/> Volver a registros</Link>
  </>;
}
