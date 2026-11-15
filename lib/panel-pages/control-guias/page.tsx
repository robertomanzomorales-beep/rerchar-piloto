import Link from "next/link";
import {ArrowRight,Plus,Search,AlertTriangle} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {db} from "@/lib/db";
import {listMaterialGuides,type GuideView} from "@/lib/material-guides";
import {serviceFolio} from "@/lib/companies";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

const kg=(value:string|null)=>value==null?"—":`${Number(value).toLocaleString("es-CL",{maximumFractionDigits:2})} kg`;
const day=(value:Date|string)=>new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeZone:"UTC"}).format(new Date(value));
type LinkedGuide={service_id:string;folio:string;guide_number:string;client_name:string;movement_date:Date|string;line_count:string};

const views:Record<GuideView,string>={"":"Todas las guías",venta_pendiente:"Ventas con pesaje, factura o pago pendiente",stock_pendiente:"Salida de stock por conciliar"};
export default async function MaterialGuides({searchParams}:{searchParams:Promise<{q?:string;tipo?:string;vista?:string;pagina?:string}>}){
  const actor=await requireActor();
  if(!canManage(actor))return <section className="section-card"><h1>Control de guías</h1><p>Este registro está disponible para administración y operaciones.</p></section>;
  if(!await moduleReady("guias"))return <ModuleUnavailable title="Control de guías" company="rerchar"/>;
  const {q="",tipo="",vista="",pagina}=await searchParams;
  const type=["venta","compra","traslado"].includes(tipo)?tipo:"";
  const view:GuideView=Object.hasOwn(views,vista)?vista as GuideView:"";
  const requestedPage=Number(pagina),pageNumber=Number.isSafeInteger(requestedPage)&&requestedPage>=1&&requestedPage<=10_000?requestedPage:1;
  const pageSize=100;
  const [result,linked]=await Promise.all([
    listMaterialGuides(actor,q,type,view,pageSize+1,(pageNumber-1)*pageSize),
    db.query<LinkedGuide>(`SELECT s.id AS service_id,s.folio,g.guide_number,c.name AS client_name,
      max(g.movement_date) AS movement_date,count(*)::text AS line_count
      FROM service_guide_controls g JOIN service_requests s ON s.id=g.service_id
      JOIN clients c ON c.id=s.client_id WHERE s.operating_company='rerchar' AND s.deleted_at IS NULL
      GROUP BY s.id,s.folio,g.guide_number,c.name ORDER BY max(g.movement_date) DESC LIMIT 25`),
  ]);
  const guides=result.slice(0,pageSize),hasMore=result.length>pageSize;
  const href=(page:number)=>`/control-guias?${new URLSearchParams({q:q.slice(0,100),tipo:type,vista:view,pagina:String(page)})}`;
  const sales=guides.filter(g=>g.movement_type==="venta");
  const withIssues=sales.filter(g=>Number(g.missing_arrival)+Number(g.missing_invoice)+Number(g.missing_payment)+Number(g.unposted_stock)>0);
  const currentMonth=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit"}).format(new Date());
  return <>
    <div className="page-title-row"><div><div className="eyebrow">RERCHAR · VENTAS Y MATERIAL</div><h1>Control de guías</h1><p className="page-intro">Cada guía registra la compra, venta o traslado, los materiales y su salida desde faena o stock. Pesaje, factura y flete se completan en el mismo control. <Link href="/materiales-stock">Consultar stock confirmado</Link>.</p></div><Link className="button button-primary" href="/control-guias/nueva"><Plus size={18}/> Nueva guía</Link></div>
    <div className="company-metric-grid"><div className="company-metric"><span>Guías en esta página</span><strong>{guides.length}</strong><small>Hasta 100 por página</small></div><div className="company-metric"><span>Ventas visibles</span><strong>{sales.length}</strong><small>Salidas de material</small></div><div className="company-metric"><span>Alertas visibles</span><strong>{withIssues.length}</strong><small>Pesaje, factura, pago o stock</small></div><div className="company-metric"><span>Materiales visibles</span><strong>{guides.reduce((n,g)=>n+Number(g.line_count),0)}</strong><small>Ítems registrados</small></div></div>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">PLANILLA OPERATIVA · RERCHAR</div><h2>Control mensual de guías</h2></div></div>
      <p className="helper-text">Descargue el formato de 36 columnas usado por RERCHAR, con una fila por material y las diferencias calculadas desde los registros guardados. Incluye todas las guías del mes, aunque no aparezcan en la página actual.</p>
      <form action="/api/control-guias/exportar" method="GET" className="guide-export-form"><label>Mes de operación<input type="month" name="mes" required defaultValue={currentMonth}/></label><button className="button button-outline" type="submit">Descargar Excel</button></form>
    </section>
    <section className="section-card"><form className="filters" action="/control-guias" method="GET"><label className="search-field"><Search size={18}/><input name="q" type="search" defaultValue={q.slice(0,100)} placeholder="N° guía, contraparte o material" aria-label="Buscar guías"/></label><select name="tipo" defaultValue={type} aria-label="Filtrar operación"><option value="">Todas las operaciones</option><option value="venta">Ventas</option><option value="compra">Compras</option><option value="traslado">Traslados</option></select><select name="vista" defaultValue={view} aria-label="Filtrar seguimiento">{Object.entries(views).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button className="button button-outline" type="submit">Filtrar</button></form>
      {guides.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Guía / fecha</th><th>Operación y contraparte</th><th>Salida de material</th><th>Seguimiento</th><th></th></tr></thead><tbody>{guides.map(g=><tr key={g.id}><td><Link href={`/control-guias/${g.id}`}><strong>{g.guide_number}</strong></Link><span className="table-sub">{day(g.movement_on)} · {g.line_count} ítem(s)</span></td><td>{g.movement_type.toUpperCase()}<span className="table-sub">{g.counterparty_name}</span></td><td>{kg(g.departure_kg)}<span className="table-sub">{g.origin} → {g.destination}</span></td><td>{Number(g.missing_arrival)+Number(g.missing_invoice)+Number(g.missing_payment)+Number(g.unposted_stock)>0?<span className="guide-pending"><AlertTriangle size={15}/> {Number(g.unposted_stock)>0?`${g.unposted_stock} sin descontar stock · `:""}{Number(g.missing_arrival)>0?`${g.missing_arrival} sin pesaje · `:""}{Number(g.missing_invoice)>0?`${g.missing_invoice} sin factura · `:""}{Number(g.missing_payment)>0?`${g.missing_payment} por cobrar`:""}</span>:<span>Sin alertas de venta</span>}</td><td><Link href={`/control-guias/${g.id}`} className="text-link">Abrir <ArrowRight size={15}/></Link></td></tr>)}</tbody></table></div>:<p className="muted">No hay guías con estos filtros. Puede volver a todas las guías o registrar una nueva.</p>}
      {(pageNumber>1||hasMore)&&<nav className="records-pagination" aria-label="Páginas de guías"><span>{pageNumber>1&&<Link className="button button-outline" href={href(pageNumber-1)}>Anterior</Link>}</span><span>Página {pageNumber} · hasta 100 guías</span><span>{hasMore&&<Link className="button button-outline" href={href(pageNumber+1)}>Siguiente</Link>}</span></nav>}
    </section>
    {linked.length>0&&<section className="section-card"><div className="section-heading"><div><div className="eyebrow">GUÍAS VINCULADAS</div><h2>Controles vinculados a servicios</h2></div></div><p className="helper-text">Las guías que ya se registraron dentro de un servicio conservan su ficha y no se duplican automáticamente.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Guía</th><th>Servicio</th><th>Cliente</th><th>Fecha</th><th>Ítems</th></tr></thead><tbody>{linked.map(g=><tr key={`${g.service_id}-${g.guide_number}`}><td><Link href={`/solicitudes/${g.service_id}/guias`}>{g.guide_number}</Link></td><td>{serviceFolio({folio:g.folio,operating_company:"rerchar"})}</td><td>{g.client_name}</td><td>{day(g.movement_date)}</td><td>{g.line_count}</td></tr>)}</tbody></table></div></section>}
    <p className="helper-text">En ventas nuevas, el peso «desde stock» descuenta saldo confirmado del material. Las guías anteriores no se descuentan de forma retroactiva: las que están pendientes se señalan para conciliar. Los saldos históricos deben registrarse con respaldo.</p>
  </>;
}
