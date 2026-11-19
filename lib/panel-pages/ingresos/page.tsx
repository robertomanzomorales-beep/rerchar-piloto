import Link from "next/link";
import {redirect} from "next/navigation";
import {PackageCheck} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {db} from "@/lib/db";
import {listMaterialReceipts,materialAmounts,type ReceiptView} from "@/lib/materials";
import {Notice} from "@/components/UI";
import {serviceFolio} from "@/lib/companies";
import {listMaterialCatalog} from "@/lib/material-stock";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";
import MaterialReceiptForm from "@/components/MaterialReceiptForm";
import {listReceiptSourceServices} from "@/lib/material-receipt-sources";
import {entryHeaders} from "@/lib/material-export";

const date=(v:Date|string)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const views:Record<ReceiptView,string>={"":"Todos los ingresos",guia:"Esperan guía valorizada",factura:"Factura por completar",pago:"Pago pendiente o parcial",aviso:"Aviso documental pendiente"};

export default async function MaterialReceipts({searchParams}:{searchParams:Promise<{error?:string;ok?:string;servicio?:string;vista?:string;pagina?:string}>}){
  const actor=await requireActor();if(actor.role==="conductor")redirect("/");
  if(!await moduleReady("ingresos"))return <ModuleUnavailable title="Ingresos de material" company="rerchar"/>;
  const [query,guideReady,closureReady]=await Promise.all([searchParams,moduleReady("receipt_followup"),moduleReady("receipt_closure")]);
  const requestedView=Object.hasOwn(views,query.vista??"")?query.vista as ReceiptView:"";
  const view:ReceiptView=(requestedView==="guia"&&!guideReady)||(["factura","pago","aviso"].includes(requestedView)&&!closureReady)?"":requestedView;
  const requestedPage=Number(query.pagina),pageNumber=Number.isSafeInteger(requestedPage)&&requestedPage>=1&&requestedPage<=10_000?requestedPage:1;
  const pageSize=100;
  const [result,clients,services,catalog,linked]=await Promise.all([listMaterialReceipts(actor,view,pageSize+1,(pageNumber-1)*pageSize),
    canManage(actor)?db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name"):Promise.resolve([]),
    canManage(actor)?listReceiptSourceServices(actor):Promise.resolve([]),
    canManage(actor)?listMaterialCatalog(actor):Promise.resolve([]),
    canManage(actor)?db.query<{service_id:string;material_id:string}>(`SELECT sm.service_id,sm.material_id FROM service_request_materials sm
      JOIN service_requests s ON s.id=sm.service_id WHERE s.operating_company='rerchar' AND s.deleted_at IS NULL`):Promise.resolve([])]);
  const rows=result.slice(0,pageSize),hasMore=result.length>pageSize;
  const href=(nextView:ReceiptView,page=1)=>`/ingresos?${new URLSearchParams({vista:nextView,pagina:String(page)})}`;
  const currentMonth=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit"}).format(new Date());
  const initialServiceId=services.some(service=>service.id===query.servicio)?query.servicio:"";
  const guidePending=rows.filter(r=>!r.valued_guide&&r.valued_guide_requested_on).length;
  const invoicePending=rows.filter(r=>r.valued_guide_received_on&&(!r.invoice_number||!r.invoice_direction||!r.invoice_issued_on)).length;
  const paymentPending=rows.filter(r=>r.invoice_number&&["pendiente","parcial"].includes(r.payment_status)).length;
  return <><div className="page-title-row"><div><div className="eyebrow">ENTRADAS Y EXCEDENTES 2026</div><h1>Ingresos de material</h1><p className="page-intro">Tickets, pesos de origen y llegada, impurezas, guías, facturas y respaldo por cliente.</p></div><span className="title-icon"><PackageCheck size={24}/></span></div><Notice error={query.error} ok={query.ok}/>
    {canManage(actor)&&<section className="section-card"><div className="section-heading"><div><div className="eyebrow">PLANILLA DE CAROL</div><h2>Descargar entrada de material</h2></div><span className="count-pill">{guidePending} guías · {invoicePending} facturas · {paymentPending} pagos pendientes entre los registros visibles</span></div><p className="helper-text">Archivo Excel con las {entryHeaders.length} columnas de la planilla 2026, ordenado por fecha. Los pesos y totales salen de cada ingreso registrado; puede filtrar por mes y cliente.</p><form action="/api/ingresos/exportar" method="get" className="form-grid"><label>Mes<input name="mes" type="month" defaultValue={currentMonth} required/></label><label>Cliente (opcional)<select name="cliente" defaultValue=""><option value="">Todos los clientes</option>{clients.map(client=><option key={client.id} value={client.id}>{client.name}</option>)}</select></label><div className="field-full form-footer"><button className="button button-outline" type="submit">Descargar Excel</button></div></form></section>}
    {canManage(actor)&&<section id="nuevo-ingreso" className="section-card"><div className="section-heading"><div><div className="eyebrow">NUEVO REGISTRO</div><h2>Entrada o excedente</h2></div><Link href="/materiales-stock" className="button button-outline">Stock de materiales</Link></div>
      <p className="helper-text">Indique la base del peso neto: en las planillas de entrada varía entre peso de proveedor y peso RERCHAR; en excedentes se calcula sobre RERCHAR. Una diferencia con el neto anotado requiere explicación.</p>
      <MaterialReceiptForm key={initialServiceId||"directa"} clients={clients} services={services.map(s=>({...s,folio:serviceFolio(s)}))}
        materials={catalog.map(({id,name})=>({id,name}))} linked={linked} initialServiceId={initialServiceId}/></section>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">CONTROL</div><h2>{view?views[view]:"Movimientos registrados"}</h2></div><span className="count-pill">{rows.length} en esta página</span></div>
      <form action="/ingresos" className="filters"><label>Vista<select name="vista" defaultValue={view}>{Object.entries(views).filter(([key])=>key===""||key==="guia"&&guideReady||key!=="guia"&&closureReady).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button type="submit" className="button button-outline">Aplicar</button></form>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha / referencia</th><th>Cliente / faena</th><th>Material</th><th>Neto calculado</th><th>Guía valorizada</th><th>Pago</th></tr></thead><tbody>{rows.map(r=>{const amount=materialAmounts(r);return <tr key={r.id}><td><Link href={`/ingresos/${r.id}`}><strong>{r.weighing_ticket||r.transfer_guide||r.origin_guide||r.entry_sheet||"Ingreso"}</strong></Link><span className="table-sub">{date(r.movement_on)} · {r.receipt_mode||r.kind}</span></td><td>{r.client_name}<span className="table-sub">{r.site_name}</span></td><td>{r.material_name}</td><td>{amount.net_kg?.toLocaleString("es-CL")??"—"} kg</td><td>{r.valued_guide?<span className="inventory-good">{r.valued_guide}</span>:r.valued_guide_requested_on?<span className="inventory-low">Pendiente desde {date(r.valued_guide_requested_on)}</span>:"Por solicitar"}</td><td>{r.payment_status}</td></tr>;})}</tbody></table>{rows.length===0&&<p className="muted">{view?"Sin ingresos en esta vista.":"Aún no hay ingresos de material registrados."}</p>}</div>
      {(pageNumber>1||hasMore)&&<nav className="records-pagination" aria-label="Páginas de ingresos"><span>{pageNumber>1&&<Link className="button button-outline" href={href(view,pageNumber-1)}>Anterior</Link>}</span><span>Página {pageNumber} · hasta 100 ingresos</span><span>{hasMore&&<Link className="button button-outline" href={href(view,pageNumber+1)}>Siguiente</Link>}</span></nav>}
    </section></>;
}
