import Link from "next/link";
import {notFound} from "next/navigation";
import {randomUUID} from "node:crypto";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {getSupplierInvoice,SupplierInvoiceError} from "@/lib/supplier-invoices";
import {listOperationFiles} from "@/lib/operation-files";
import SupplierInvoiceDetailForm from "@/components/SupplierInvoiceDetailForm";
import CompanyScope from "@/components/CompanyScope";
import {supplierInvoiceDetailFields,type SupplierInvoiceDetailKind} from "@/lib/supplier-invoice-detail-state";
import {chileCsvDateTime,chileCsvDay} from "@/lib/chile-csv";
import {Notice} from "@/components/UI";
import PrintButton from "@/components/PrintButton";
import DocumentBrand from "@/components/DocumentBrand";
import {companyName,serviceFolio} from "@/lib/companies";
import {moduleReady} from "@/lib/schema-readiness";
import {invoiceSupplierTransfers} from "@/lib/supplier-transfers";

const date=(v:Date|string|null)=>!v?"—":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const timestamp=(v:Date|string|null)=>v?chileCsvDateTime(v):"—";
const money=(v:string|number|null)=>v==null?"—":`$${Number(v).toLocaleString("es-CL",{maximumFractionDigits:2})}`;
const transferStatus={solicitada:"Solicitada · por aprobar",aprobada:"Aprobada · por ejecutar",rechazada:"Rechazada",ejecutada:"Ejecutada · por verificar",verificada:"Verificada · pago aplicado"};
export default async function SupplierInvoiceDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string;formulario?:string;transferencia?:string}>}){
  const actor=await requireActor(),{id}=await params;let result;
  if(actor.role!=="admin")notFound();
  try{result=await getSupplierInvoice(actor,id);}catch(e){if(e instanceof SupplierInvoiceError)notFound();throw e;}
  const {invoice:r,payments}=result;
  const [files,query,transferReady,profileReady]=await Promise.all([listOperationFiles(actor,"invoice",id),searchParams,moduleReady("supplier_transfers"),moduleReady("counterparty_profiles")]);
  const [supplierProfile]=profileReady?await db.query<{id:string;status:string;bank_name:string;account_type:string;account_number:string}>(
    `SELECT id,status,bank_name,account_type,account_number FROM counterparty_profiles
     WHERE ($1::uuid IS NULL OR id=$1) AND kind IN ('proveedor','ambos')
       AND upper(regexp_replace(tax_id,'[.[:space:]]','','g'))=upper(regexp_replace($2,'[.[:space:]]','','g')) LIMIT 1`,
    [r.supplier_profile_id||null,r.supplier_tax_id]):[];
  const transfers=transferReady?await invoiceSupplierTransfers(actor,id):[];
  const saldo=(Math.round(Number(r.total_clp)*100)-Math.round(Number(r.paid_clp)*100))/100;
  const reserved=transfers.filter(t=>["solicitada","aprobada","ejecutada"].includes(t.status)).reduce((sum,t)=>sum+Number(t.amount_clp),0);
  const available=Math.max(0,Math.round((saldo-reserved)*100)/100);
  const kind=typeof query.formulario==="string"&&Object.hasOwn(supplierInvoiceDetailFields,query.formulario)?query.formulario as SupplierInvoiceDetailKind:undefined;
  const canRequest=transferReady&&available>0&&r.review_status==="aceptada"&&(!profileReady||supplierProfile?.status==="verificada");
  const canPay=reserved<=0&&saldo>0&&r.review_status==="aceptada";
  const formProps={invoiceId:id,today:chileCsvDay(),issuedOn:date(r.issued_on)};
  return <><CompanyScope company={r.issuer}/><div className="order-actions print-hide"><Link href={`/facturas-recibidas?empresa=${r.issuer}`} className="back-link">← Facturas recibidas</Link><PrintButton label="Imprimir ficha / guardar PDF"/></div><div className="print-hide"><Notice error={query.error} ok={query.ok}/></div>
    <nav className="client-section-links print-hide" aria-label="Secciones de factura recibida"><a href="#documento-factura">Factura</a><a href="#revision-factura">Revisión</a><a href="#transferencias">Transferencias</a><a href="#vencimiento-factura">Vencimiento</a>{saldo>0&&<a href="#pago-manual">Pago manual</a>}<a href="#adjuntar-factura">Adjuntar respaldo</a></nav>
    <article id="documento-factura" className="order-sheet finance-section" data-company={r.issuer}><header className="order-header"><div><DocumentBrand company={r.issuer}/><div className="order-system">{companyName(r.issuer)}</div><h1>Registro de factura recibida</h1></div><div className="order-number"><small>FACTURA</small><h1>{r.invoice_number}</h1></div></header><p className="order-muted">Esta ficha interna no sustituye al documento tributario del proveedor.</p>
      <div className="order-section"><div className="order-grid">{([[
        "Proveedor",`${r.supplier_name} · ${r.supplier_tax_id}`],["Emisión",date(r.issued_on)],["Vencimiento",date(r.due_on)],
        ["Descripción",r.description],["Neto",money(r.net_clp)],["IVA",money(r.vat_clp)],["Total",money(r.total_clp)],
        ["Pagado",money(r.paid_clp)],["Saldo",money(saldo)],["Estado de pago",r.status],["Revisión",r.review_status==="aceptada"?"Aceptada":r.review_status==="disputada"?"Disputada":"Pendiente"],["Centro de costo",r.cost_area||"—"]] as [string,string][]).map(([key,value])=><div key={key}><small>{key}</small><strong>{value}</strong></div>)}
        {r.purchase_id&&r.purchase_folio&&<div><small>{r.purchase_order_reference?"Orden de compra vinculada":"Solicitud de compra vinculada"}</small><strong><Link href={`/compras/${r.purchase_id}`}>{r.purchase_order_reference??`SC-${r.purchase_folio.padStart(5,"0")}`} · {r.purchase_title}</Link></strong></div>}
        {r.service_id&&r.service_folio&&<div><small>Servicio vinculado</small><strong><Link href={`/solicitudes/${r.service_id}`}>{serviceFolio({folio:r.service_folio,operating_company:r.service_company})}</Link></strong></div>}
      </div>{r.review_note&&<p><strong>Revisión:</strong> {r.review_note}</p>}{r.notes&&<p>{r.notes}</p>}</div>
      <div className="order-section"><h2>Pagos</h2><ul className="record-list">{payments.map(p=><li key={p.id}><strong>{money(p.amount_clp)} · {date(p.paid_on)}</strong><small>{p.reference} · {p.actor_name}</small></li>)}{payments.length===0&&<li>Sin pagos registrados.</li>}</ul></div>
      <div className="order-section"><h2>Documentos</h2><ul className="record-list">{files.map(f=><li key={f.id}><a href={`/api/archivos-operacion/${f.id}`}>{f.kind} · {f.filename}</a></li>)}{files.length===0&&<li>Factura original pendiente de adjuntar.</li>}</ul></div>
    </article><section id="revision-factura" className="section-card finance-section print-hide"><h2>Revisión de factura recibida</h2><p className="helper-text">Contraste emisor, folio, montos y documento original. Una discrepancia bloquea nuevas transferencias y pagos.</p>
      <SupplierInvoiceDetailForm kind="review" {...formProps} disabled={reserved>0}/>
      {reserved>0&&<p className="helper-text">Resuelva las transferencias en curso antes de cambiar la revisión.</p>}
    </section><section id="transferencias" className="section-card finance-section print-hide"><div className="section-heading"><div><div className="eyebrow">PAGOS A PROVEEDORES · {companyName(r.issuer)}</div><h2>Solicitudes de transferencia</h2></div><Link href={`/transferencias?empresa=${r.issuer}`} className="text-link">Ver todas las solicitudes →</Link></div>
      {!transferReady?<p className="helper-text">Para habilitar solicitudes, aprobación y comprobación aplique la migración 044 en la base de datos.</p>:<>
        <p className="helper-text">Solicitud → aprobación por otra persona → registro de ejecución con comprobante bancario → verificación por otra persona. Sólo la verificación aplica el pago a la factura. Saldo disponible para nuevas solicitudes: <strong>{money(available)}</strong>.</p>
        {profileReady&&<p className="helper-text">{supplierProfile?<>Ficha de proveedor: <Link href={`/fichas/${supplierProfile.id}`} className="text-link">{supplierProfile.status==="verificada"?"Verificada":"Pendiente de revisión"}</Link>{supplierProfile.status==="verificada"?` · ${supplierProfile.bank_name} · ${supplierProfile.account_type} · cuenta terminada en ${supplierProfile.account_number.slice(-4)}`:". Revise y verifique sus datos bancarios antes de solicitar."}</>:<>Falta ficha de proveedor para este RUT. <Link href="/fichas/nueva" className="text-link">Crear ficha →</Link></>}</p>}
        {(canRequest||kind==="request")&&<SupplierInvoiceDetailForm kind="request" {...formProps} nonce={randomUUID()} maximum={String(available)} legacyBank={!profileReady} disabled={!canRequest}/>}
        {transfers.length===0&&<p className="muted">No hay solicitudes para esta factura.</p>}
        {transfers.map(t=><div key={t.id} id={`transferencia-${t.id}`} className="order-section finance-section" data-supplier-transfer={t.id} data-transfer-status={t.status}><h3>{money(t.amount_clp)} · {transferStatus[t.status]}</h3><p className="helper-text">Solicitó {t.requested_name} · {timestamp(t.created_at)} · {t.bank_name} · {t.account_type} · cuenta terminada en {t.account_number.slice(-4)}.</p>
          {t.approved_name&&<p className="helper-text">{t.status==="rechazada"?"Resolvió":"Aprobó"} {t.approved_name} · {timestamp(t.approved_at)}{t.decision_note?` · ${t.decision_note}`:""}.</p>}
          {t.executed_name&&<p className="helper-text">Registró {t.executed_name} · pago {date(t.paid_on)} · referencia {t.bank_reference}. {t.proof_id&&<a href={`/api/transferencias/${t.id}/comprobante`} target="_blank" rel="noreferrer">Ver comprobante</a>}</p>}
          {t.verified_name&&<p className="helper-text">Verificó {t.verified_name} · {timestamp(t.verified_at)} · {t.verification_note}.</p>}
          {(t.status==="solicitada"||query.transferencia===t.id&&(kind==="approve"||kind==="reject"))&&<>{t.requested_by===actor.id?<p className="helper-text">Debe decidir otra persona con acceso administrativo.</p>:<><p className="helper-text">Antes de aprobar, adjunte la factura original en Documentos.</p><SupplierInvoiceDetailForm kind="approve" {...formProps} transferId={t.id} disabled={t.status!=="solicitada"}/><SupplierInvoiceDetailForm kind="reject" {...formProps} transferId={t.id} disabled={t.status!=="solicitada"}/></>}</>}
          {(t.status==="aprobada"||query.transferencia===t.id&&kind==="execute")&&(t.approved_by===actor.id?<p className="helper-text">La persona que aprobó debe dejar el registro de ejecución a otro usuario.</p>:<SupplierInvoiceDetailForm kind="execute" {...formProps} transferId={t.id} disabled={t.status!=="aprobada"}/>)}
          {(t.status==="ejecutada"||query.transferencia===t.id&&kind==="verify")&&(t.executed_by===actor.id?<p className="helper-text">Debe verificar otra persona con acceso administrativo.</p>:<SupplierInvoiceDetailForm kind="verify" {...formProps} transferId={t.id} disabled={t.status!=="ejecutada"}/>)}
        </div>)}
      </>}
    </section><section id="vencimiento-factura" className="section-card finance-section print-hide"><h2>Corregir vencimiento</h2><p className="helper-text">La corrección queda registrada en Auditoría con su motivo.</p><SupplierInvoiceDetailForm kind="due" {...formProps} dueOn={date(r.due_on)==="—"?"":date(r.due_on)}/></section><div className="supply-columns print-hide"><section id="pago-manual" className="section-card finance-section"><h2>Pago manual o anterior</h2><p className="helper-text">Para pagos nuevos por transferencia, use Solicitudes de transferencia. Los pagos manuales quedan identificados como registros sin verificación independiente. Saldo pendiente: {money(saldo)}.</p>{reserved>0&&<p className="helper-text">Hay una solicitud activa para esta factura. Resuélvala antes de registrar un pago manual.</p>}{r.review_status!=="aceptada"&&<p className="helper-text">Acepte primero la factura original para registrar pagos.</p>}{saldo<=0&&<p className="helper-text">La factura no tiene saldo pendiente.</p>}{(canPay||kind==="payment")&&<SupplierInvoiceDetailForm kind="payment" {...formProps} nonce={randomUUID()} maximum={String(Math.max(0,saldo))} disabled={!canPay}/>}</section>
      <section id="adjuntar-factura" className="section-card finance-section"><h2>Adjuntar factura o comprobante</h2><SupplierInvoiceDetailForm kind="attachment" {...formProps}/></section></div></>;
}
