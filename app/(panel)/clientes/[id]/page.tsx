import Link from "next/link";
import {notFound} from "next/navigation";
import {z} from "zod";
import {Building2,FileText} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {chileDate} from "@/components/UI";

type Client={id:string;name:string;tax_id:string|null;contact_name:string|null;email:string|null;address:string|null};
type Service={id:string;folio:string;service_type:string;site_name:string;waste_type:string;status:string;guide_number:string|null;gross_kg:string|null;tare_kg:string|null;scheduled_for:Date|null;created_at:Date};
type Document={id:string;service_id:string;folio:string;kind:string;description:string;filename:string|null;created_at:Date};
function dateOnly(value:Date|string){return value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);}
export default async function ClientDossier({params}:{params:Promise<{id:string}>}){
  const actor=await requireActor();
  const {id}=await params;
  if(actor.role==="conductor"||!z.uuid().safeParse(id).success||(actor.role==="cliente"&&actor.client_id!==id))notFound();
  const [client]=await db.query<Client>("SELECT * FROM clients WHERE id=$1 AND deleted_at IS NULL",[id]);
  if(!client)notFound();
  const [services,documents,certificates,invoices,quotes]=await Promise.all([
    db.query<Service>(`SELECT s.id,s.folio,s.service_type,cs.name AS site_name,s.waste_type,s.status,s.guide_number,s.gross_kg,s.tare_kg,s.scheduled_for,s.created_at
      FROM service_requests s JOIN client_sites cs ON cs.id=s.site_id WHERE s.client_id=$1 AND s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 300`,[id]),
    db.query<Document>(`SELECT e.id,e.service_id,s.folio,e.document_kind AS kind,e.description,e.original_filename AS filename,e.created_at
      FROM service_evidence e JOIN service_requests s ON s.id=e.service_id WHERE s.client_id=$1 AND s.deleted_at IS NULL
      ORDER BY e.created_at DESC LIMIT 400`,[id]),
    db.query<{id:string;service_id:string;folio:string;version:number;issued_at:Date}>(`SELECT c.id,c.service_id,s.folio,c.version,c.issued_at FROM service_certificates c
      JOIN service_requests s ON s.id=c.service_id WHERE s.client_id=$1 AND s.deleted_at IS NULL AND c.status='vigente'
      ORDER BY c.issued_at DESC`,[id]),
    db.query<{id:string;service_id:string;folio:string;invoice_number:string;issued_on:Date}>(`SELECT i.id,v.service_id,s.folio,i.invoice_number,i.issued_on FROM service_invoices i
      JOIN service_valuations v ON v.id=i.valuation_id JOIN service_requests s ON s.id=v.service_id
      WHERE s.client_id=$1 AND s.deleted_at IS NULL AND i.status='emitida' ORDER BY i.issued_on DESC`,[id]),
    db.query<{id:string;folio:string;title:string;status:string;created_at:Date}>(`SELECT id,folio,title,status,created_at FROM client_quotes
      WHERE client_id=$1 AND ($2::text<>'cliente' OR status IN ('enviada','aceptada','rechazada')) ORDER BY created_at DESC`,[id,actor.role]),
  ]);
  const labels:Record<string,string>={evidencia:"Evidencias",guia_traslado:"Guías de traslado",guia_valorizada:"Guías valorizadas",hoja_servicio:"Hojas de servicio",factura:"Facturas adjuntas",certificado:"Certificados externos",resumen_retiros:"Resúmenes adjuntos",otro:"Otros archivos"};
  return <><Link className="back-link" href="/clientes">← Clientes</Link><div className="page-title-row"><div><div className="eyebrow">CARPETA DEL CLIENTE</div><h1>{client.name}</h1><p className="page-intro">{[client.tax_id,client.contact_name,client.email,client.address].filter(Boolean).join(" · ")||"Sin datos adicionales"}</p></div><span className="title-icon"><Building2 size={23}/></span></div>
    <div className="order-actions">{actor.role!=="cliente"&&<Link href={`/cotizaciones/nueva?cliente=${id}`} className="button button-primary">Nueva cotización</Link>}<Link href={`/clientes/${id}/resumen`} className="button button-outline">Resumen de retiros para imprimir</Link></div>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">OPERACIÓN</div><h2>Servicios y documentos generados</h2></div><span className="count-pill">{services.length}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Folio</th><th>Faena / material</th><th>Estado</th><th>Documentos</th></tr></thead><tbody>{services.map(s=><tr key={s.id}><td><Link href={`/solicitudes/${s.id}`}><strong>RER-{String(s.folio).padStart(5,"0")}</strong></Link><small className="table-sub">{chileDate(s.created_at)}</small></td><td>{s.site_name}<small className="table-sub">{s.waste_type} · {s.service_type}</small></td><td>{s.status}</td><td><Link href={`/solicitudes/${s.id}/orden`}>Orden / hoja de servicio</Link> · <Link href={`/solicitudes/${s.id}/guias`}>Guías y pesos</Link></td></tr>)}</tbody></table>{!services.length&&<p className="muted">Todavía no hay servicios registrados.</p>}</div></section>
    <div className="supply-columns"><section className="section-card"><h2>Cotizaciones</h2><ul className="record-list">{quotes.map(q=><li key={q.id}><Link href={`/cotizaciones/${q.id}`}><strong>COT-{String(q.folio).padStart(5,"0")} · {q.title}</strong></Link><small>{q.status} · {chileDate(q.created_at)}</small></li>)}{!quotes.length&&<li className="muted">Sin cotizaciones disponibles.</li>}</ul></section>
      <section className="section-card"><h2>Certificados PDF con QR</h2><ul className="record-list">{certificates.map(c=><li key={c.id}><Link href={`/api/certificados/${c.id}/pdf`}><strong>RER-{String(c.folio).padStart(5,"0")} · versión {c.version}</strong></Link><small>{chileDate(c.issued_at)}</small></li>)}{!certificates.length&&<li className="muted">Aún no se emiten certificados vigentes.</li>}</ul></section></div>
    <section className="section-card"><h2>Facturas registradas</h2><p className="helper-text">Aquí se consulta el folio asociado al servicio. El documento tributario se descarga desde «Facturas adjuntas» cuando está cargado.</p><ul className="record-list">{invoices.map(i=><li key={i.id}><strong>Factura {i.invoice_number}</strong><small>RER-{String(i.folio).padStart(5,"0")} · {chileDate(`${dateOnly(i.issued_on)}T12:00:00Z`,false)}</small></li>)}{!invoices.length&&<li className="muted">Sin referencias de facturas en el sistema.</li>}</ul></section>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">RESPALDOS</div><h2>Archivos vinculados a servicios</h2></div><span className="count-pill">{documents.length}</span></div>{Object.entries(labels).map(([kind,title])=>{const selected=documents.filter(d=>d.kind===kind);return selected.length?<div className="dossier-group" key={kind}><h3>{title}</h3><ul className="record-list">{selected.map(d=><li key={d.id}><FileText size={16}/><div><a href={`/api/evidencia/${d.id}`}>{d.description}</a><small>RER-{String(d.folio).padStart(5,"0")} · {d.filename??"Archivo"} · {chileDate(d.created_at)}</small></div></li>)}</ul></div>:null;})}{!documents.length&&<p className="muted">Los documentos que suba a cada servicio aparecerán aquí.</p>}</section>
  </>;
}
