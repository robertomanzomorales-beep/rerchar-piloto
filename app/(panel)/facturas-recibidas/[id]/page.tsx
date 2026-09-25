import Link from "next/link";
import {notFound} from "next/navigation";
import {randomUUID} from "node:crypto";
import {requireActor} from "@/lib/auth";
import {getSupplierInvoice,SupplierInvoiceError} from "@/lib/supplier-invoices";
import {listOperationFiles} from "@/lib/operation-files";
import {registerSupplierPaymentAction,addOperationFileAction} from "@/app/operation-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import PrintButton from "@/components/PrintButton";

const date=(v:Date|string|null)=>!v?"—":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const money=(v:string|number|null)=>v==null?"—":`$${Number(v).toLocaleString("es-CL",{maximumFractionDigits:2})}`;
export default async function SupplierInvoiceDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor(),{id}=await params;let result;
  try{result=await getSupplierInvoice(actor,id);}catch(e){if(e instanceof SupplierInvoiceError)notFound();throw e;}
  const {invoice:r,payments}=result;
  const [files,query]=await Promise.all([listOperationFiles(actor,"invoice",id),searchParams]);
  const saldo=Number(r.total_clp)-Number(r.paid_clp);
  return <><div className="order-actions print-hide"><Link href="/facturas-recibidas" className="back-link">← Facturas recibidas</Link><PrintButton label="Imprimir ficha / guardar PDF"/></div><div className="print-hide"><Notice error={query.error} ok={query.ok}/></div>
    <article className="order-sheet"><header className="order-header"><div><div className="order-system">{r.issuer==="rerchar"?"RERCHAR CHILE SPA":"E Y J LIMITADA"}</div><h1>Registro de factura recibida</h1></div><div className="order-number"><small>FACTURA</small><h1>{r.invoice_number}</h1></div></header><p className="order-muted">Esta ficha interna no sustituye al documento tributario del proveedor.</p>
      <div className="order-section"><div className="order-grid">{([[
        "Proveedor",`${r.supplier_name} · ${r.supplier_tax_id}`],["Emisión",date(r.issued_on)],["Vencimiento",date(r.due_on)],
        ["Descripción",r.description],["Neto",money(r.net_clp)],["IVA",money(r.vat_clp)],["Total",money(r.total_clp)],
        ["Pagado",money(r.paid_clp)],["Saldo",money(saldo)],["Estado",r.status],["Centro de costo",r.cost_area||"—"]] as [string,string][]).map(([key,value])=><div key={key}><small>{key}</small><strong>{value}</strong></div>)}</div>{r.notes&&<p>{r.notes}</p>}</div>
      <div className="order-section"><h2>Pagos</h2><ul className="record-list">{payments.map(p=><li key={p.id}><strong>{money(p.amount_clp)} · {date(p.paid_on)}</strong><small>{p.reference} · {p.actor_name}</small></li>)}{payments.length===0&&<li>Sin pagos registrados.</li>}</ul></div>
      <div className="order-section"><h2>Documentos</h2><ul className="record-list">{files.map(f=><li key={f.id}><a href={`/api/archivos-operacion/${f.id}`}>{f.kind} · {f.filename}</a></li>)}{files.length===0&&<li>Factura original pendiente de adjuntar.</li>}</ul></div>
    </article><div className="supply-columns print-hide"><section className="section-card"><h2>Registrar pago</h2><p className="helper-text">Saldo pendiente: {money(saldo)}.</p><form action={registerSupplierPaymentAction} className="form-stack"><input type="hidden" name="id" value={id}/><input type="hidden" name="submission_key" value={randomUUID()}/><label>Monto ($)<input name="amount_clp" type="number" min="0.01" max={saldo} step="0.01" required/></label><label>Fecha<input name="paid_on" type="date" required/></label><label>Referencia comprobante<input name="reference" minLength={2} maxLength={160} required/></label><SubmitButton className="button button-outline" disabled={saldo<=0}>Guardar pago</SubmitButton></form></section>
      <section className="section-card"><h2>Adjuntar factura o comprobante</h2><form action={addOperationFileAction} className="form-stack"><input type="hidden" name="target" value="invoice"/><input type="hidden" name="id" value={id}/><label>Tipo<select name="kind"><option value="factura">Factura</option><option value="comprobante">Comprobante de pago</option><option value="guia">Guía</option><option value="otro">Otro</option></select></label><label>Archivo PDF o imagen<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required/></label><SubmitButton className="button button-outline">Guardar archivo</SubmitButton></form></section></div></>;
}
