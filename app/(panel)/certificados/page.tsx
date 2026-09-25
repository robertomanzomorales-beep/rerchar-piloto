import Link from "next/link";
import {FileBadge2,FileDown,ShieldCheck} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {listCertificatePreparation,listCertificates} from "@/lib/certificates";
import {chileDate} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {issueCertificateAction,revokeCertificateAction} from "@/app/certificate-actions";

export default async function Certificates({searchParams}:{searchParams:Promise<{error?:string;ok?:string;certificado?:string;service_id?:string}>}){
  const actor=await requireActor();
  const params=await searchParams;
  const [certificates,services]=await Promise.all([
    listCertificates(actor),
    actor.role==="admin"?listCertificatePreparation(actor):Promise.resolve([]),
  ]);
  const candidates=services.filter(service=>service.ready);
  const pending=services.filter(service=>!service.ready);
  const selectedService=candidates.some(service=>service.id===params.service_id)?params.service_id:"";
  return <>
    <div className="page-title-row"><div><div className="eyebrow">PORTAL Y DOCUMENTOS</div><h1>Certificados de servicio</h1><p className="page-intro">PDF con código QR para verificar su vigencia. Cada cliente ve únicamente certificados vigentes de sus propios servicios.</p></div><span className="title-icon"><FileBadge2 size={23}/></span></div>
    {params.error&&<p className="form-error" role="alert">{params.error}</p>}{params.ok&&<p className="form-success">Cambio registrado. {params.certificado&&<Link href={`/api/certificados/${params.certificado}/pdf`}>Descargar certificado recién emitido</Link>}</p>}
    {actor.role==="admin"&&<section className="section-card"><div className="section-heading"><div><div className="eyebrow">EMISIÓN CONTROLADA</div><h2><ShieldCheck size={19}/> Emitir certificado</h2></div></div>
      <p className="helper-text">Exige servicio cerrado con pesaje, evidencia y ficha ambiental revisada. La corrección de esa ficha revoca el certificado vigente. Este documento no sustituye una declaración oficial.</p>
      {candidates.length>0?<form action={issueCertificateAction} className="form-grid detail-form"><label className="field-full">Servicio habilitado<select name="service_id" required defaultValue={selectedService}><option value="">Seleccione un servicio</option>{candidates.map(s=><option value={s.id} key={s.id}>RER-{String(s.folio).padStart(5,"0")} · {s.client_name} · {s.site_name}</option>)}</select></label><div className="field-full form-footer"><SubmitButton className="button button-primary">Emitir versión y habilitar PDF</SubmitButton></div></form>
        :<p className="certificate-waiting" role="status">No hay folios listos para emitir. {pending.length?"Complete el paso pendiente indicado para cada servicio.":"Primero cierre un servicio con pesaje y evidencia."} {!pending.length&&<Link href="/solicitudes">Ver solicitudes →</Link>}</p>}
    </section>}
    {actor.role==="admin"&&pending.length>0&&<section className="section-card"><div className="section-heading"><div><div className="eyebrow">PASOS PENDIENTES</div><h2>Servicios cerrados pendientes de certificado</h2></div><span className="count-pill">{pending.length}</span></div>
      <ul className="certificate-pending-list">{pending.map(s=><li key={s.id}><div><strong>RER-{String(s.folio).padStart(5,"0")} · {s.client_name}</strong><small>{s.site_name}</small><p>{s.reason}</p></div><Link className="button button-outline" href={s.nextHref}>{s.nextLabel} →</Link></li>)}</ul>
    </section>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">HISTORIAL DE VERSIONES</div><h2>Documentos {actor.role==="cliente"?"de su empresa":"emitidos"}</h2></div><span className="count-pill">{certificates.length}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Versión</th><th>Emitido</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{certificates.map(x=><tr key={x.id}><td><Link className="table-main" href={`/solicitudes/${x.service_id}`}>RER-{String(x.folio).padStart(5,"0")}</Link></td><td>{x.client_name}<small className="table-sub">{x.site_name}</small></td><td>{x.version}</td><td>{chileDate(x.issued_at)}</td><td>{x.status}{x.revocation_reason&&<small className="table-sub">{x.revocation_reason}</small>}</td><td>{x.status==="vigente"&&<Link className="button button-outline" href={`/api/certificados/${x.id}/pdf`}><FileDown size={16}/> PDF + QR</Link>}</td></tr>)}</tbody></table>{!certificates.length&&<p className="report-empty">Todavía no hay certificados disponibles.</p>}</div>
      {actor.role==="admin"&&certificates.some(x=>x.status==="vigente")&&<details className="section-card"><summary>Revocar un certificado vigente</summary><form action={revokeCertificateAction} className="form-grid detail-form"><label>Certificado<select name="id" required defaultValue=""><option value="">Seleccione folio y versión</option>{certificates.filter(x=>x.status==="vigente").map(x=><option value={x.id} key={x.id}>RER-{String(x.folio).padStart(5,"0")} · v{x.version}</option>)}</select></label><label>Motivo<input name="reason" minLength={5} maxLength={500} required placeholder="Corrección documentada"/></label><div className="field-full form-footer"><SubmitButton className="button button-outline">Revocar y conservar historial</SubmitButton></div></form></details>}
    </section>
  </>;
}
