import Link from "next/link";
import {redirect} from "next/navigation";
import {FileText} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {listSupplierInvoices,parseSupplierInvoiceFilter,supplierInvoiceOverview,supplierInvoiceCount} from "@/lib/supplier-invoices";
import {chileCsvDay} from "@/lib/chile-csv";
import {Notice} from "@/components/UI";
import {type Company} from "@/lib/companies";
import SupplierInvoiceForm from "@/components/SupplierInvoiceForm";
import type {SupplierInvoicePurchase,SupplierInvoiceService} from "@/lib/supplier-invoice-form-state";
import {moduleReady} from "@/lib/schema-readiness";
import {listVerifiedSuppliers} from "@/lib/counterparties";
import RecordsPagination from "@/components/RecordsPagination";
import {recordPage,recordsPerPage,lastRecordPage} from "@/lib/record-pagination";

const date=(v:Date|string|null)=>!v?"—":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
export default async function SupplierInvoices({searchParams}:{searchParams:Promise<{error?:string;ok?:string;empresa?:string;estado?:string;pagina?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const query=await searchParams;
  const company:Company|""=query.empresa==="rerchar"||query.empresa==="e_y_j"?query.empresa:"";
  const filter=parseSupplierInvoiceFilter(query.estado),today=chileCsvDay();
  const page=recordPage(query.pagina);
  const href=(next:number)=>`/facturas-recibidas?${new URLSearchParams({empresa:company,estado:filter,pagina:String(next)})}#facturas-proveedores`;
  const [profilesReady,purchaseProfilesReady]=await Promise.all([moduleReady("counterparty_profiles"),moduleReady("purchase_supplier_profile")]);
  const [rows,overview,purchases,services,suppliers,total]=await Promise.all([listSupplierInvoices(actor,company,filter,today,recordsPerPage,(page-1)*recordsPerPage),supplierInvoiceOverview(actor,company,today),
    db.query<SupplierInvoicePurchase>(`SELECT id,folio,title,issuer,order_reference,${purchaseProfilesReady?"supplier_profile_id":"NULL::uuid AS supplier_profile_id"} FROM purchase_requests WHERE status<>'cancelada' ORDER BY created_at DESC,id DESC`),
    db.query<SupplierInvoiceService>("SELECT id,folio,operating_company FROM service_requests WHERE operating_company IS NOT NULL AND deleted_at IS NULL ORDER BY created_at DESC,id DESC"),
    profilesReady?listVerifiedSuppliers(actor):Promise.resolve([]),supplierInvoiceCount(actor,company,filter,today)]);
  if(page>lastRecordPage(total))redirect(href(lastRecordPage(total)));
  const inSeven=new Date(`${today}T12:00:00Z`);inSeven.setUTCDate(inSeven.getUTCDate()+7);
  const seven=inSeven.toISOString().slice(0,10);
  const timing=(due:Date|string|null,balance:number)=>{
    if(balance<=0)return "Pagada";
    const dateValue=date(due);
    if(dateValue==="—")return "Sin vencimiento";
    if(dateValue<today)return "Vencida";
    if(dateValue<=seven)return "Vence en 7 días";
    return "Pendiente";
  };
  return <><div className="page-title-row"><div><div className="eyebrow">PLANILLA DE INSUMOS · RERCHAR / E Y J</div><h1>Facturas recibidas</h1><p className="page-intro">Registro manual por empresa, proveedor, costo, vencimiento, pagos y documento original.</p></div><span className="title-icon"><FileText size={24}/></span></div><Notice error={query.error} ok={query.ok}/>
    <form action="/facturas-recibidas" method="GET" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label>
      <label>Estado<select name="estado" defaultValue={filter}><option value="pendientes">Con saldo</option><option value="vencidas">Vencidas</option><option value="proximas">Vencen en 7 días</option><option value="sin_fecha">Sin vencimiento</option><option value="pagadas">Pagadas</option><option value="todas">Todas</option></select></label>
      <button className="button button-outline" type="submit">Aplicar filtros</button></form>
    <div className="supply-summary"><div><strong>{overview.overdue}</strong><span>Vencidas con saldo</span></div><div><strong>{overview.upcoming}</strong><span>Vencen en 7 días</span></div><div><strong>{overview.undated}</strong><span>Con saldo sin vencimiento</span></div><div><strong>${Number(overview.outstanding).toLocaleString("es-CL",{maximumFractionDigits:2})}</strong><span>Saldo por pagar</span></div></div>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">REGISTRAR</div><h2>Factura de proveedor</h2></div></div>
      <SupplierInvoiceForm company={company} profilesReady={profilesReady} suppliers={suppliers} purchases={purchases} services={services}/></section>
    <section className="section-card" id="facturas-proveedores"><div className="section-heading"><div><div className="eyebrow">VENCIMIENTOS</div><h2>Facturas y saldo</h2></div><span className="count-pill">{total}</span></div>
      <p className="helper-text">Las facturas con saldo se ordenan por vencimiento. La tabla muestra 100 por página; los indicadores incluyen todos los registros de la empresa seleccionada.</p>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Factura / empresa</th><th>Proveedor</th><th>Vence</th><th>Total</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>{rows.map(r=>{
        const balance=Number(r.total_clp)-Number(r.paid_clp);
        return <tr key={r.id}><td><Link href={`/facturas-recibidas/${r.id}`}><strong>{r.invoice_number}</strong></Link><span className="table-sub">{r.issuer==="rerchar"?"RERCHAR":"E y J"} · {date(r.issued_on)}</span></td><td>{r.supplier_name}</td><td>{date(r.due_on)}</td><td>${Number(r.total_clp).toLocaleString("es-CL")}</td><td>${balance.toLocaleString("es-CL")}</td><td>{r.status==="observada"?"Observada · ":""}{timing(r.due_on,balance)}</td></tr>;
      })}</tbody></table>{rows.length===0&&<p className="muted">No hay facturas registradas para este filtro.</p>}</div>
      <RecordsPagination page={page} total={total} href={href} label="Páginas de facturas recibidas"/>
    </section></>;
}
