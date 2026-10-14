import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {type Company} from "@/lib/companies";
import {moduleReady} from "@/lib/schema-readiness";
import {listSupplierTransfers,supplierTransferOverview} from "@/lib/supplier-transfers";
import ModuleUnavailable from "@/components/ModuleUnavailable";

const money=(v:string|number)=>`$${Number(v).toLocaleString("es-CL",{maximumFractionDigits:2})}`;
const date=(v:Date|string|null)=>v?(v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10)):"—";
const labels={solicitada:"Por aprobar",aprobada:"Por ejecutar",ejecutada:"Por verificar",verificada:"Verificada",rechazada:"Rechazada"};
export default async function Transfers({searchParams}:{searchParams:Promise<{empresa?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const query=await searchParams,company:Company|""=query.empresa==="rerchar"||query.empresa==="e_y_j"?query.empresa:"";
  if(!await moduleReady("supplier_transfers"))return <ModuleUnavailable title="Transferencias a proveedores" company={company||"rerchar"}/>;
  const [rows,stats]=await Promise.all([listSupplierTransfers(actor,company),supplierTransferOverview(actor,company)]);
  return <><div className="page-title-row"><div><div className="eyebrow">FACTURAS RECIBIDAS · RERCHAR / E Y J</div><h1>Solicitudes de transferencia</h1><p className="page-intro">Aprobación, ejecución con comprobante y verificación de pagos a proveedores por empresa.</p></div></div>
    <form action="/transferencias" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><button type="submit" className="button button-outline">Aplicar</button></form>
    <div className="supply-summary"><div><strong>{stats.solicitadas}</strong><span>Por aprobar</span></div><div><strong>{stats.aprobadas}</strong><span>Por ejecutar</span></div><div><strong>{stats.ejecutadas}</strong><span>Por verificar</span></div><div><strong>{stats.verificadas}</strong><span>Verificadas</span></div></div>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">SEGUIMIENTO</div><h2>Pagos a proveedores</h2></div><Link className="text-link" href={`/facturas-recibidas${company?`?empresa=${company}`:""}`}>Abrir facturas →</Link></div><p className="helper-text">Las solicitudes nuevas se crean en la ficha de la factura recibida. Hasta 300 solicitudes recientes en esta vista.</p>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Empresa / factura</th><th>Proveedor</th><th>Monto</th><th>Estado</th><th>Responsable</th><th>Fecha</th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td><Link href={`/facturas-recibidas/${t.invoice_id}#transferencias`}><strong>{t.invoice_number}</strong></Link><span className="table-sub">{t.issuer==="rerchar"?"RERCHAR":"E y J"}</span></td><td>{t.supplier_name}</td><td>{money(t.amount_clp)}</td><td>{labels[t.status]}</td><td>{t.verified_name||t.executed_name||t.approved_name||t.requested_name}</td><td>{date(t.created_at)}</td></tr>)}</tbody></table>{rows.length===0&&<p className="muted">Sin solicitudes en esta empresa.</p>}</div></section></>;
}
