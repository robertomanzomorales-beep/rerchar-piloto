import Link from "next/link";
import {redirect} from "next/navigation";
import {FileText} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {listSupplierInvoices,parseSupplierInvoiceFilter,supplierInvoiceOverview} from "@/lib/supplier-invoices";
import {chileCsvDay} from "@/lib/chile-csv";
import {createSupplierInvoiceAction} from "@/app/operation-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {serviceFolio,type Company} from "@/lib/companies";
import {moduleReady} from "@/lib/schema-readiness";
import {listVerifiedSuppliers} from "@/lib/counterparties";

const date=(v:Date|string|null)=>!v?"—":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
export default async function SupplierInvoices({searchParams}:{searchParams:Promise<{error?:string;ok?:string;empresa?:string;estado?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const query=await searchParams;
  const company:Company|""=query.empresa==="rerchar"||query.empresa==="e_y_j"?query.empresa:"";
  const filter=parseSupplierInvoiceFilter(query.estado),today=chileCsvDay();
  const profilesReady=await moduleReady("counterparty_profiles");
  const [rows,overview,purchases,services,suppliers]=await Promise.all([listSupplierInvoices(actor,company,filter,today),supplierInvoiceOverview(actor,company,today),
    db.query<{id:string;folio:string;title:string;issuer:Company;order_reference:string|null}>("SELECT id,folio,title,issuer,order_reference FROM purchase_requests WHERE ($1::text='' OR issuer=$1) AND status<>'cancelada' ORDER BY created_at DESC LIMIT 250",[company]),
    db.query<{id:string;folio:string;operating_company:Company}>("SELECT id,folio,operating_company FROM service_requests WHERE operating_company IS NOT NULL AND ($1::text='' OR operating_company=$1) AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 250",[company]),
    profilesReady?listVerifiedSuppliers(actor):Promise.resolve([])]);
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
      <form action={createSupplierInvoiceAction} className="form-grid"><label>Empresa receptora<select name="issuer" defaultValue={company||"rerchar"}><option value="rerchar">RERCHAR CHILE SPA</option><option value="e_y_j">E y J Limitada</option></select></label><label>Fecha emisión<input name="issued_on" type="date" required/></label>
        {profilesReady&&<label>Ficha de proveedor verificada<select name="supplier_profile_id" defaultValue=""><option value="">Ingreso manual (sin cuenta verificada)</option>{suppliers.map(s=><option value={s.id} key={s.id}>{s.legal_name} · {s.tax_id}</option>)}</select></label>}
        <label>RUT proveedor (si es manual)<input name="supplier_tax_id" maxLength={25}/></label><label>Razón social (si es manual)<input name="supplier_name" maxLength={180}/></label>
        {profilesReady&&<p className="field-full helper-text">Al seleccionar una ficha se toman la razón social y el RUT verificados. Para solicitar transferencia se exige una ficha verificada, incluso si la factura se registró manualmente. <Link href="/fichas/nueva" className="text-link">Crear ficha de proveedor →</Link></p>}
        <label>Número factura<input name="invoice_number" required maxLength={80}/></label><label>Vencimiento<input name="due_on" type="date"/></label><label className="field-full">Descripción<input name="description" required maxLength={500}/></label><label>Neto ($)<input name="net_clp" type="number" min="0" step="0.01"/></label><label>IVA ($)<input name="vat_clp" type="number" min="0" step="0.01"/></label><label>Total ($)<input name="total_clp" type="number" min="0" step="0.01" required/></label><label>Centro de costo<input name="cost_area" maxLength={160}/></label><label>Solicitud / orden de compra<select name="purchase_id" defaultValue=""><option value="">No aplica</option>{purchases.map(p=><option key={p.id} value={p.id}>{p.issuer==="rerchar"?"RERCHAR":"E y J"} · {p.order_reference??`SC-${String(p.folio).padStart(5,"0")} (sin OC emitida)`} · {p.title}</option>)}</select></label><label>Servicio<select name="service_id" defaultValue=""><option value="">No aplica</option>{services.map(s=><option key={s.id} value={s.id}>{serviceFolio(s)}</option>)}</select></label><p className="field-full helper-text">La solicitud y el servicio deben pertenecer a la misma empresa receptora. Si la OC tiene una ficha verificada, la factura tomará esa ficha y comprobará el RUT.</p><label className="field-full">Observaciones<textarea name="notes" rows={2} maxLength={1000}/></label><div className="field-full form-footer"><SubmitButton className="button button-primary">Registrar factura</SubmitButton></div></form></section>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">VENCIMIENTOS</div><h2>Facturas y saldo</h2></div><span className="count-pill">{rows.length}</span></div>
      <p className="helper-text">Las facturas con saldo se ordenan por vencimiento. La lista muestra hasta 400 resultados del filtro; los indicadores incluyen todos los registros de la empresa seleccionada.</p>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Factura / empresa</th><th>Proveedor</th><th>Vence</th><th>Total</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>{rows.map(r=>{
        const balance=Number(r.total_clp)-Number(r.paid_clp);
        return <tr key={r.id}><td><Link href={`/facturas-recibidas/${r.id}`}><strong>{r.invoice_number}</strong></Link><span className="table-sub">{r.issuer==="rerchar"?"RERCHAR":"E y J"} · {date(r.issued_on)}</span></td><td>{r.supplier_name}</td><td>{date(r.due_on)}</td><td>${Number(r.total_clp).toLocaleString("es-CL")}</td><td>${balance.toLocaleString("es-CL")}</td><td>{r.status==="observada"?"Observada · ":""}{timing(r.due_on,balance)}</td></tr>;
      })}</tbody></table>{rows.length===0&&<p className="muted">No hay facturas registradas para este filtro.</p>}</div></section></>;
}
