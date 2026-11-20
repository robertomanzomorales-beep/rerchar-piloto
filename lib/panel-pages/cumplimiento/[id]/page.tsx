import Link from "next/link";
import {ArrowLeft,FileCheck2,ExternalLink} from "lucide-react";
import {notFound,redirect} from "next/navigation";
import {canManage,requireActor} from "@/lib/auth";
import {ComplianceError,getWasteRecord} from "@/lib/compliance";
import {chileDate} from "@/components/UI";
import ComplianceForm from "@/components/ComplianceForm";
import {complianceContext,complianceHref,complianceFields,complianceDay,complianceId,wasteStatusNames,type ComplianceContext,type ComplianceKind} from "@/lib/compliance-state";
import {companyName,serviceFolio} from "@/lib/companies";

export default async function WasteRecordDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<ComplianceContext&{error?:string;ok?:string;formulario?:string;guardado?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const {id}=await params;
  let data;try{data=await getWasteRecord(actor,id);}catch(error){if(error instanceof ComplianceError)notFound();throw error;}
  const {record:r,events}=data,notice=await searchParams,context=complianceContext(notice),saved=complianceId(notice.guardado);
  const defaults=Object.fromEntries(complianceFields.save.map(field=>[field,String(r[field]??"")]));
  const form=(kind:ComplianceKind,disabled=false)=><ComplianceForm key={`${kind}-${notice.formulario===kind?saved:""}`} kind={kind} id={r.id} context={context} defaults={kind==="save"?defaults:{}} disabled={disabled} system={r.category==="peligroso"?"SIDREP":"SINADER"}/>;
  const failed=(kind:ComplianceKind)=>notice.formulario===kind&&!saved;
  const editable=r.status==="borrador"||r.status==="observado";
  return <>
    <div className="page-title-row"><div><div className="eyebrow">REGISTRO AMBIENTAL · {companyName(r.operating_company)}</div><h1>{serviceFolio(r)} · {r.client_name}</h1><p className="page-intro">{r.site_name} · {r.waste_type} · {r.quantity_kg} kg netos · Estado: {wasteStatusNames[r.status]??r.status}</p></div><Link className="button button-outline" href={`/solicitudes/${r.service_id}`}>Ver servicio <ExternalLink size={16}/></Link></div>
    {notice.error&&<p className="form-error" role="alert">{notice.error}</p>}{notice.ok&&<p className="form-success">Registro actualizado.</p>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">FICHA</div><h2><FileCheck2 size={18}/> Información para revisión</h2></div></div>
      <p className="helper-text">Categoría y datos registrados por el equipo; deben verificarse con los documentos de la operación. {r.evidence_count} evidencia(s) adjunta(s) al servicio. La ficha no realiza ningún envío oficial.</p>
      {editable||failed("save")?form("save",!editable):<div className="facts-grid"><div className="fact"><span>Categoría</span><strong>{r.category.replaceAll("_"," ")}</strong></div><div className="fact"><span>Clasificación</span><strong>{r.classification}</strong></div><div className="fact"><span>Generador</span><strong>{r.generator_name}</strong></div><div className="fact"><span>Transportista</span><strong>{r.transporter_name}</strong></div><div className="fact"><span>Receptor</span><strong>{r.receiver_name}</strong></div><div className="fact"><span>Tratamiento / destino</span><strong>{r.treatment}</strong></div><div className="fact"><span>Guía</span><strong>{r.guide_number}</strong></div><div className="fact"><span>Declaración registrada</span><strong>{r.external_system&&r.external_reference?`${r.external_system} · ${r.external_reference}`:"Pendiente"}</strong></div><div className="fact"><span>Fecha de declaración</span><strong>{complianceDay(r.reported_on)||"—"}</strong></div></div>}
    </section>
    {r.review_note&&<section className="section-card"><h2>Observación pendiente</h2><p>{r.review_note}</p></section>}
    {actor.role==="admin"&&<section className="section-card"><div className="eyebrow">CONTROL INTERNO</div><h2>Revisión y declaración</h2>
      {(r.status==="borrador"||failed("review"))&&form("review",r.status!=="borrador")}
      {(r.status==="revisado"||failed("declare"))&&form("declare",r.status!=="revisado")}
      {(["revisado","declarado"].includes(r.status)||failed("observe"))&&form("observe",!["revisado","declarado"].includes(r.status))}
      {r.status==="observado"&&<p className="helper-text">Corrija y guarde la ficha para volver a enviarla a revisión.</p>}
      {r.operating_company==="rerchar"&&(r.status==="revisado"||r.status==="declarado")&&<Link className="button button-primary" href={`/certificados?service_id=${r.service_id}`}>Continuar a certificados →</Link>}
    </section>}
    <section className="section-card"><div className="eyebrow">HISTORIAL INALTERABLE</div><h2>Movimientos de la ficha</h2><ol className="timeline">{events.map(e=><li key={e.id}><span className="timeline-marker"/><strong>{e.action} · {e.actor_name}</strong><small>{chileDate(e.created_at)}{e.reason?` · ${e.reason}`:""}</small></li>)}</ol></section>
    <Link className="back-link" href={complianceHref(context)}><ArrowLeft size={16}/> Volver a registros</Link>
  </>;
}
