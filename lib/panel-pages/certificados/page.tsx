import Link from "next/link";
import {redirect} from "next/navigation";
import {FileBadge2,FileDown,ShieldCheck} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {certificateHistoryCount,listCertificateDrafts,listCertificatePreparation,listCertificates} from "@/lib/certificates";
import {moduleReady} from "@/lib/schema-readiness";
import {chileDate} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {issueCertificateAction,saveCertificateDraftAction} from "@/app/certificate-actions";
import CertificateForm from "@/components/CertificateForm";
import RecordsPagination from "@/components/RecordsPagination";
import {lastRecordPage,recordPage,recordsPerPage} from "@/lib/record-pagination";

export default async function Certificates({searchParams}:{searchParams:Promise<{error?:string;ok?:string;borrador?:string;certificado?:string;service_id?:string;pagina?:string;pagina_borradores?:string;pagina_pendientes?:string;revocar?:string}>}){
  const actor=await requireActor();
  if(actor.role==="conductor")redirect("/");
  const params=await searchParams;
  const requested=recordPage(params.pagina),requestedDrafts=recordPage(params.pagina_borradores),requestedPending=recordPage(params.pagina_pendientes);
  const draftReady=actor.role==="admin"?await moduleReady("certificados_borradores"):false;
  const [certificates,total,services,drafts]=await Promise.all([
    listCertificates(actor,recordsPerPage,(requested-1)*recordsPerPage),certificateHistoryCount(actor),
    actor.role==="admin"?listCertificatePreparation(actor):Promise.resolve([]),
    draftReady?listCertificateDrafts(actor):Promise.resolve([]),
  ]);
  const draftIds=new Set(drafts.map(d=>d.service_id)),preparationById=new Map(services.map(s=>[s.id,s]));
  const candidates=services.filter(service=>service.ready&&!draftIds.has(service.id));
  const pending=services.filter(service=>!service.ready);
  const page=Math.min(requested,lastRecordPage(total)),draftPage=Math.min(requestedDrafts,lastRecordPage(drafts.length)),pendingPage=Math.min(requestedPending,lastRecordPage(pending.length));
  const href=(key:"pagina"|"pagina_borradores"|"pagina_pendientes",value:number,anchor:string,notices=false)=>{
    const query=new URLSearchParams();
    for(const [name,current] of [["pagina",page],["pagina_borradores",draftPage],["pagina_pendientes",pendingPage]] as const){const next=name===key?value:current;if(next>1)query.set(name,String(next));}
    if(notices)for(const name of ["error","ok","borrador","certificado","service_id","revocar"] as const)if(params[name])query.set(name,params[name]);
    return `/certificados${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
  };
  if(page!==requested||draftPage!==requestedDrafts||pendingPage!==requestedPending)redirect(href("pagina",page,"",true));
  const visibleDrafts=drafts.slice((draftPage-1)*recordsPerPage,draftPage*recordsPerPage),visiblePending=pending.slice((pendingPage-1)*recordsPerPage,pendingPage*recordsPerPage);
  const selectedService=candidates.some(service=>service.id===params.service_id)?params.service_id:"";
  const activeCertificates=certificates.filter(x=>x.status==="vigente");
  return <>
    <div className="page-title-row"><div><div className="eyebrow">PORTAL Y DOCUMENTOS</div><h1>Certificados de servicio</h1><p className="page-intro">PDF con código QR para verificar su vigencia. Cada cliente ve únicamente certificados vigentes de sus propios servicios.</p></div><span className="title-icon"><FileBadge2 size={23}/></span></div>
    {params.error&&<p className="form-error" role="alert">{params.error}</p>}{params.borrador&&<p className="form-success">Borrador guardado. Revise los datos antes de emitir.</p>}{params.ok&&<p className="form-success">Cambio registrado. {params.certificado&&<Link href={`/api/certificados/${params.certificado}/pdf`}>Descargar certificado recién emitido</Link>}</p>}
    {actor.role==="admin"&&!draftReady&&<p className="notice notice-error" role="status">La preparación de certificados se habilitará cuando administración aplique la migración 042. El historial emitido sigue disponible.</p>}
    {actor.role==="admin"&&draftReady&&<section id="preparar-certificado" className="section-card certificate-section"><div className="section-heading"><div><div className="eyebrow">PREPARACIÓN</div><h2><ShieldCheck size={19}/> Guardar sin emitir</h2></div></div>
      <p className="helper-text">El servicio debe estar cerrado, con pesaje, evidencia y ficha ambiental revisada. Guardar el borrador no crea versión, PDF ni QR público. La corrección de la ficha revoca un certificado emitido; este documento no sustituye una declaración oficial.</p>
      <CertificateForm key={`prepare:${selectedService}:${candidates.map(s=>s.id).join(",")}`} kind="prepare" serviceId={selectedService} choices={candidates.map(s=>({id:s.id,label:`RER-${String(s.folio).padStart(5,"0")} · ${s.client_name} · ${s.site_name}`}))}/>
      {!candidates.length&&<p className="certificate-waiting" role="status">No hay nuevos folios listos para preparar. {pending.length?"Complete el paso pendiente indicado para cada servicio.":"Primero cierre un servicio con pesaje y evidencia."} {!pending.length&&<Link href="/solicitudes">Ver solicitudes →</Link>}</p>}
    </section>}
    {actor.role==="admin"&&draftReady&&drafts.length>0&&<section id="borradores-certificados" className="section-card certificate-section"><div className="section-heading"><div><div className="eyebrow">REVISIÓN PREVIA</div><h2>Borradores sin emitir</h2></div><span className="count-pill">{drafts.length}</span></div>
      {visibleDrafts.map(d=>{const preparation=preparationById.get(d.service_id);return <article key={d.service_id} className="certificate-draft"><div><strong>{d.snapshot.folio} · {d.client_name} · {d.site_name}</strong><p className="helper-text">{d.snapshot.document_type==="disposicion_final"?"Certificado de disposición final":"Certificado de servicio"}. Preparado el {chileDate(d.prepared_at)}. Aún no tiene versión ni código de verificación.</p>
        <div className="facts-grid"><div className="fact"><span>Servicio / residuo</span><strong>{d.snapshot.service_type} · {d.snapshot.waste_type}</strong></div><div className="fact"><span>Categoría / clasificación</span><strong>{d.snapshot.category.replaceAll("_"," ")} · {d.snapshot.classification}</strong></div><div className="fact"><span>Peso neto</span><strong>{Number(d.snapshot.quantity_kg).toLocaleString("es-CL")} kg</strong></div><div className="fact"><span>Guía / ticket</span><strong>{d.snapshot.guide_number} · {d.snapshot.weight_ticket??"Sin ticket"}</strong></div><div className="fact"><span>Generador / receptor</span><strong>{d.snapshot.generator_name} / {d.snapshot.receiver_name}</strong></div><div className="fact"><span>Transportista / destino</span><strong>{d.snapshot.transporter_name} / {d.snapshot.treatment}</strong></div><div className="fact"><span>Patente / factura</span><strong>{d.snapshot.plate??"Sin patente"} / {d.snapshot.invoice_number??"Sin factura"}</strong></div><div className="fact"><span>Fecha de cierre</span><strong>{chileDate(d.snapshot.closed_at)}</strong></div></div>
        {preparation?.ready?<div className="form-grid detail-form"><form action={saveCertificateDraftAction}><input type="hidden" name="service_id" value={d.service_id}/><input type="hidden" name="document_type" value={d.snapshot.document_type??"servicio"}/><SubmitButton className="button button-outline">Actualizar borrador</SubmitButton></form><form action={issueCertificateAction}><input type="hidden" name="service_id" value={d.service_id}/><label>Confirmar emisión<input name="confirmation" required pattern="EMITIR" title="Escriba EMITIR" placeholder="Escriba EMITIR" autoComplete="off"/></label><SubmitButton className="button button-primary">Emitir versión y habilitar PDF</SubmitButton></form></div>
          :<p className="notice notice-error">Este servicio requiere nueva revisión antes de emitir. {preparation?.reason??"Revise el servicio y su ficha ambiental."} {preparation&&<Link href={preparation.nextHref}>{preparation.nextLabel} →</Link>}</p>}
      </div></article>;})}
      <RecordsPagination page={draftPage} total={drafts.length} href={value=>href("pagina_borradores",value,"borradores-certificados")} label="Páginas de borradores de certificados"/>
    </section>}
    {actor.role==="admin"&&pending.length>0&&<section id="pendientes-certificados" className="section-card certificate-section"><div className="section-heading"><div><div className="eyebrow">PASOS PENDIENTES</div><h2>Servicios cerrados pendientes de certificado</h2></div><span className="count-pill">{pending.length}</span></div>
      <ul className="certificate-pending-list">{visiblePending.map(s=><li key={s.id}><div><strong>RER-{String(s.folio).padStart(5,"0")} · {s.client_name}</strong><small>{s.site_name}</small><p>{s.reason}</p></div><Link className="button button-outline" href={s.nextHref}>{s.nextLabel} →</Link></li>)}</ul>
      <RecordsPagination page={pendingPage} total={pending.length} href={value=>href("pagina_pendientes",value,"pendientes-certificados")} label="Páginas de servicios pendientes de certificado"/>
    </section>}
    <section id="historial-certificados" className="section-card certificate-section"><div className="section-heading"><div><div className="eyebrow">HISTORIAL DE VERSIONES</div><h2>Documentos {actor.role==="cliente"?"de su empresa":"emitidos"}</h2></div><span className="count-pill">{total}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Versión</th><th>Emitido</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{certificates.map(x=><tr key={x.id}><td><Link className="table-main" href={`/solicitudes/${x.service_id}`}>RER-{String(x.folio).padStart(5,"0")}</Link></td><td>{x.client_name}<small className="table-sub">{x.site_name}</small></td><td>{x.version}</td><td>{chileDate(x.issued_at)}</td><td>{x.status}{x.revocation_reason&&<small className="table-sub">{x.revocation_reason}</small>}</td><td>{x.status==="vigente"&&<Link className="button button-outline" href={`/api/certificados/${x.id}/pdf`}><FileDown size={16}/> PDF + QR</Link>}</td></tr>)}</tbody></table>{!certificates.length&&<p className="report-empty">Todavía no hay certificados disponibles.</p>}</div>
      <RecordsPagination page={page} total={total} href={value=>href("pagina",value,"historial-certificados")} label="Páginas del historial de certificados"/>
      {actor.role==="admin"&&total>0&&<details id="revocar-certificado" className="section-card certificate-section" open={params.revocar==="1"}><summary>Revocar un certificado vigente</summary><p className="helper-text">Seleccione un certificado vigente de esta página del historial. Para encontrar otra versión, cambie de página antes de iniciar la revocación.</p><CertificateForm key={`revoke:${page}:${activeCertificates.map(x=>x.id).join(",")}`} kind="revoke" page={page} choices={activeCertificates.map(x=>({id:x.id,label:`RER-${String(x.folio).padStart(5,"0")} · v${x.version}`}))}/>{!activeCertificates.length&&<p className="helper-text">Esta página no contiene certificados vigentes.</p>}</details>}
    </section>
  </>;
}
