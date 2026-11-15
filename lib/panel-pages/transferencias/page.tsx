import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {type Company} from "@/lib/companies";
import {moduleReady} from "@/lib/schema-readiness";
import {listSupplierTransfers,supplierTransferOverview,type TransferStatus} from "@/lib/supplier-transfers";
import ModuleUnavailable from "@/components/ModuleUnavailable";

const money=(v:string|number)=>`$${Number(v).toLocaleString("es-CL",{maximumFractionDigits:2})}`;
const date=(v:Date|string|null)=>v?(v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10)):"—";
const labels={solicitada:"Por aprobar",aprobada:"Por ejecutar",ejecutada:"Por verificar",verificada:"Verificada",rechazada:"Rechazada"};
export default async function Transfers({searchParams}:{searchParams:Promise<{empresa?:string;estado?:string;pagina?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const query=await searchParams,company:Company|""=query.empresa==="rerchar"||query.empresa==="e_y_j"?query.empresa:"";
  const status:TransferStatus|""=["solicitada","aprobada","ejecutada","verificada","rechazada"].includes(query.estado??"")?query.estado as TransferStatus:"";
  const requestedPage=Number(query.pagina);
  const pageNumber=Number.isSafeInteger(requestedPage)&&requestedPage>=1&&requestedPage<=10_000?requestedPage:1;
  const pageSize=100;
  if(!await moduleReady("supplier_transfers"))return <ModuleUnavailable title="Transferencias a proveedores" company={company||"rerchar"}/>;
  const [result,stats]=await Promise.all([listSupplierTransfers(actor,company,status,pageSize+1,(pageNumber-1)*pageSize),supplierTransferOverview(actor,company)]);
  const rows=result.slice(0,pageSize),hasMore=result.length>pageSize;
  const href=(nextStatus:string,page=1)=>`/transferencias?${new URLSearchParams({empresa:company,estado:nextStatus,pagina:String(page)})}`;
  return <><div className="page-title-row"><div><div className="eyebrow">FACTURAS RECIBIDAS · RERCHAR / E Y J</div><h1>Solicitudes de transferencia</h1><p className="page-intro">Aprobación, ejecución con comprobante y verificación de pagos a proveedores por empresa.</p></div></div>
    <form action="/transferencias" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><label>Estado<select name="estado" defaultValue={status}><option value="">Todos</option><option value="solicitada">Por aprobar</option><option value="aprobada">Por ejecutar</option><option value="ejecutada">Por verificar</option><option value="verificada">Verificada</option><option value="rechazada">Rechazada</option></select></label><button type="submit" className="button button-outline">Aplicar</button></form>
    <div className="supply-summary"><Link className="summary-link" href={href("solicitada")}><strong>{stats.solicitadas}</strong><span>Por aprobar</span></Link><Link className="summary-link" href={href("aprobada")}><strong>{stats.aprobadas}</strong><span>Por ejecutar</span></Link><Link className="summary-link" href={href("ejecutada")}><strong>{stats.ejecutadas}</strong><span>Por verificar</span></Link><Link className="summary-link" href={href("verificada")}><strong>{stats.verificadas}</strong><span>Verificadas</span></Link></div>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">SEGUIMIENTO</div><h2>Pagos a proveedores</h2></div><Link className="text-link" href={`/facturas-recibidas${company?`?empresa=${company}`:""}`}>Abrir facturas →</Link></div><p className="helper-text">Las solicitudes nuevas se crean en la ficha de la factura recibida. Los totales muestran toda la empresa; la tabla muestra 100 registros por página.</p>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Empresa / factura</th><th>Proveedor</th><th>Monto</th><th>Estado</th><th>Responsable</th><th>Fecha</th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td><Link href={`/facturas-recibidas/${t.invoice_id}#transferencias`}><strong>{t.invoice_number}</strong></Link><span className="table-sub">{t.issuer==="rerchar"?"RERCHAR":"E y J"}</span></td><td>{t.supplier_name}</td><td>{money(t.amount_clp)}</td><td>{labels[t.status]}</td><td>{t.verified_name||t.executed_name||t.approved_name||t.requested_name}</td><td>{date(t.created_at)}</td></tr>)}</tbody></table>{rows.length===0&&<p className="muted">Sin transferencias con este estado y empresa.</p>}</div>
      {(pageNumber>1||hasMore)&&<nav className="records-pagination" aria-label="Páginas de transferencias"><span>{pageNumber>1&&<Link className="button button-outline" href={href(status,pageNumber-1)}>Anterior</Link>}</span><span>Página {pageNumber} · hasta 100 transferencias</span><span>{hasMore&&<Link className="button button-outline" href={href(status,pageNumber+1)}>Siguiente</Link>}</span></nav>}
    </section></>;
}
