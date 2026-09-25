import Link from "next/link";
import {FileCheck2,Download,Plus} from "lucide-react";
import {canManage,requireActor} from "@/lib/auth";
import {listWasteRecords} from "@/lib/compliance";
import {db} from "@/lib/db";
import {chileDate} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {saveWasteAction} from "@/app/compliance-actions";

export default async function Compliance({searchParams}:{searchParams:Promise<{error?:string;ok?:string;client_id?:string;service_id?:string}>}){
  const actor=await requireActor();
  if(!canManage(actor))return <p>Este módulo requiere acceso de operaciones.</p>;
  const params=await searchParams;
  const clientId=params.client_id??"";
  const [records,clients,services]=await Promise.all([
    listWasteRecords(actor,clientId),
    db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name"),
    db.query<{id:string;folio:string;client_name:string;site_name:string;waste_type:string;guide_number:string|null}>(`
      SELECT s.id,s.folio,c.name AS client_name,cs.name AS site_name,s.waste_type,s.guide_number FROM service_requests s
      JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
      LEFT JOIN waste_records w ON w.service_id=s.id
      WHERE s.status='completada' AND s.deleted_at IS NULL AND w.id IS NULL ORDER BY s.closed_at DESC LIMIT 100`),
  ]);
  const selectedService=services.some(service=>service.id===params.service_id)?params.service_id:"";
  return <>
    <div className="page-title-row"><div><div className="eyebrow">TRAZABILIDAD AMBIENTAL INTERNA</div><h1>Registros ambientales</h1><p className="page-intro">Prepare y revise información del residuo asociada al folio. La declaración externa se registra después de efectuarla en el portal correspondiente.</p></div><span className="title-icon"><FileCheck2 size={23}/></span></div>
    {params.error&&<p className="form-error" role="alert">{params.error}</p>}{params.ok&&<p className="form-success">Registro actualizado.</p>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">NUEVO REGISTRO</div><h2><Plus size={18}/> Preparar ficha</h2></div></div>
      <p className="helper-text">Primero cierre el servicio y adjunte al menos una evidencia. El peso neto se toma del pesaje del folio.</p>
      <form action={saveWasteAction} className="form-grid detail-form">
        <label className="field-full">Servicio cerrado<select name="service_id" required defaultValue={selectedService}><option value="">Seleccione un folio</option>{services.map(s=><option key={s.id} value={s.id}>RER-{String(s.folio).padStart(5,"0")} · {s.client_name} · {s.site_name} · {s.waste_type}</option>)}</select></label>
        <label>Categoría informada<select name="category" required><option value="no_peligroso">No peligroso</option><option value="peligroso">Peligroso</option></select></label>
        <label>Clasificación / descripción<input name="classification" maxLength={120} minLength={2} required placeholder="Descripción usada por la operación"/></label>
        <label>Generador<input name="generator_name" maxLength={160} required placeholder="Razón social o establecimiento"/></label>
        <label>Transportista<input name="transporter_name" maxLength={160} required defaultValue="RERCHAR"/></label>
        <label>Receptor<input name="receiver_name" maxLength={160} required placeholder="Destino receptor"/></label>
        <label>Tratamiento o destino<input name="treatment" maxLength={160} required placeholder="Descripción del destino final"/></label>
        <label>Guía / documento de respaldo<input name="guide_number" maxLength={80} required placeholder="Folio del documento"/></label>
        <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!services.length}>Guardar borrador</SubmitButton></div>
      </form>
      {!services.length&&<p className="helper-text">No hay servicios cerrados pendientes de ficha.</p>}
    </section>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">REVISIÓN Y SEGUIMIENTO</div><h2>Registros vinculados</h2></div><Link className="button button-outline" href={`/api/reportes/ambiental?client_id=${encodeURIComponent(clientId)}`}><Download size={16}/> CSV interno</Link></div>
      <form method="GET" action="/cumplimiento" className="report-filters"><label>Cliente<select name="client_id" defaultValue={clientId}><option value="">Todos</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button type="submit" className="button button-outline">Aplicar</button></form>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Folio</th><th>Cliente / faena</th><th>Residuo</th><th>Categoría</th><th>Peso neto</th><th>Estado</th><th>Actualizado</th></tr></thead><tbody>{records.map(r=><tr key={r.id}><td><Link className="table-main" href={`/cumplimiento/${r.id}`}>RER-{String(r.folio).padStart(5,"0")}</Link></td><td>{r.client_name}<small className="table-sub">{r.site_name}</small></td><td>{r.waste_type}</td><td>{r.category.replaceAll("_"," ")}</td><td>{Number(r.quantity_kg).toLocaleString("es-CL")} kg</td><td>{r.status}</td><td>{chileDate(r.updated_at)}</td></tr>)}</tbody></table>{!records.length&&<p className="report-empty">Sin registros con este filtro.</p>}</div>
    </section>
  </>;
}
