import Link from "next/link";
import {ArrowRight,Plus,Search,AlertTriangle} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {db} from "@/lib/db";
import {listMaterialGuides} from "@/lib/material-guides";
import {serviceFolio} from "@/lib/companies";

const kg=(value:string|null)=>value==null?"—":`${Number(value).toLocaleString("es-CL",{maximumFractionDigits:2})} kg`;
const day=(value:Date|string)=>new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeZone:"UTC"}).format(new Date(value));
type LinkedGuide={service_id:string;folio:string;guide_number:string;client_name:string;movement_date:Date|string;line_count:string};

export default async function MaterialGuides({searchParams}:{searchParams:Promise<{q?:string;tipo?:string}>}){
  const actor=await requireActor();
  if(!canManage(actor))return <section className="section-card"><h1>Control de guías</h1><p>Este registro está disponible para administración y operaciones.</p></section>;
  const {q="",tipo=""}=await searchParams;
  const type=["venta","compra","traslado"].includes(tipo)?tipo:"";
  const [guides,linked]=await Promise.all([
    listMaterialGuides(actor,q,type),
    db.query<LinkedGuide>(`SELECT s.id AS service_id,s.folio,g.guide_number,c.name AS client_name,
      max(g.movement_date) AS movement_date,count(*)::text AS line_count
      FROM service_guide_controls g JOIN service_requests s ON s.id=g.service_id
      JOIN clients c ON c.id=s.client_id WHERE s.operating_company='rerchar' AND s.deleted_at IS NULL
      GROUP BY s.id,s.folio,g.guide_number,c.name ORDER BY max(g.movement_date) DESC LIMIT 25`),
  ]);
  const sales=guides.filter(g=>g.movement_type==="venta");
  const withIssues=sales.filter(g=>Number(g.missing_arrival)+Number(g.missing_invoice)+Number(g.missing_payment)>0);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">RERCHAR · VENTAS Y MATERIAL</div><h1>Control de guías</h1><p className="page-intro">Cada guía registra la compra, venta o traslado, los materiales y su salida desde faena o stock. Pesaje, factura y flete se completan en el mismo control.</p></div><Link className="button button-primary" href="/control-guias/nueva"><Plus size={18}/> Nueva guía</Link></div>
    <div className="company-metric-grid"><div className="company-metric"><span>Guías en la vista</span><strong>{guides.length}</strong><small>Máximo 250 registros</small></div><div className="company-metric"><span>Ventas</span><strong>{sales.length}</strong><small>Salidas de material</small></div><div className="company-metric"><span>Ventas por cerrar</span><strong>{withIssues.length}</strong><small>Pesaje, factura o pago</small></div><div className="company-metric"><span>Materiales</span><strong>{guides.reduce((n,g)=>n+Number(g.line_count),0)}</strong><small>Ítems registrados</small></div></div>
    <section className="section-card"><form className="filters" action="/control-guias" method="GET"><label className="search-field"><Search size={18}/><input name="q" type="search" defaultValue={q.slice(0,100)} placeholder="N° guía, contraparte o material" aria-label="Buscar guías"/></label><select name="tipo" defaultValue={type} aria-label="Filtrar operación"><option value="">Todas las operaciones</option><option value="venta">Ventas</option><option value="compra">Compras</option><option value="traslado">Traslados</option></select><button className="button button-outline" type="submit">Filtrar</button></form>
      {guides.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Guía / fecha</th><th>Operación y contraparte</th><th>Salida de material</th><th>Seguimiento</th><th></th></tr></thead><tbody>{guides.map(g=><tr key={g.id}><td><Link href={`/control-guias/${g.id}`}><strong>{g.guide_number}</strong></Link><span className="table-sub">{day(g.movement_on)} · {g.line_count} ítem(s)</span></td><td>{g.movement_type.toUpperCase()}<span className="table-sub">{g.counterparty_name}</span></td><td>{kg(g.departure_kg)}<span className="table-sub">{g.origin} → {g.destination}</span></td><td>{Number(g.missing_arrival)+Number(g.missing_invoice)+Number(g.missing_payment)>0?<span className="guide-pending"><AlertTriangle size={15}/> {Number(g.missing_arrival)>0?`${g.missing_arrival} sin pesaje · `:""}{Number(g.missing_invoice)>0?`${g.missing_invoice} sin factura · `:""}{Number(g.missing_payment)>0?`${g.missing_payment} por cobrar`:""}</span>:<span>Sin alertas de venta</span>}</td><td><Link href={`/control-guias/${g.id}`} className="text-link">Abrir <ArrowRight size={15}/></Link></td></tr>)}</tbody></table></div>:<p className="muted">No hay guías en este filtro. La primera venta se puede registrar desde «Nueva guía».</p>}</section>
    {linked.length>0&&<section className="section-card"><div className="section-heading"><div><div className="eyebrow">HISTORIAL DEL PILOTO</div><h2>Controles vinculados a servicios</h2></div></div><p className="helper-text">Las guías que ya se registraron dentro de un servicio conservan su ficha y no se duplican automáticamente.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Guía</th><th>Servicio</th><th>Cliente</th><th>Fecha</th><th>Ítems</th></tr></thead><tbody>{linked.map(g=><tr key={`${g.service_id}-${g.guide_number}`}><td><Link href={`/solicitudes/${g.service_id}/guias`}>{g.guide_number}</Link></td><td>{serviceFolio({folio:g.folio,operating_company:"rerchar"})}</td><td>{g.client_name}</td><td>{day(g.movement_date)}</td><td>{g.line_count}</td></tr>)}</tbody></table></div></section>}
    <p className="helper-text">El peso «desde stock» identifica material usado en la salida; los saldos históricos de bodega todavía requieren conciliación antes de activar descuentos automáticos.</p>
  </>;
}
