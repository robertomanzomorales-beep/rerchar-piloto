import Image from "next/image";
import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {getPurchase,purchaseTotals,SupplyError} from "@/lib/supply";
import {issuers} from "@/lib/quotes";
import PrintButton from "@/components/PrintButton";

const money=(n:number)=>`$${n.toLocaleString("es-CL")}`;
function day(value:Date|string){return new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeZone:"America/Santiago"}).format(new Date(value));}
function dateOnly(value:Date|string){return value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);}
export default async function PurchaseOrder({params}:{params:Promise<{id:string}>}){
  const actor=await requireActor();const {id}=await params;
  let detail;try{detail=await getPurchase(actor,id);}catch(error){if(error instanceof SupplyError)notFound();throw error;}
  const {purchase,lines}=detail;
  const draft=purchase.status==="aprobada";
  if(!purchase.order_reference||!purchase.supplier||(!purchase.ordered_at&&!draft)||lines.some(line=>line.unit_price_clp==null))notFound();
  const issuer=issuers[purchase.issuer];
  const totals=purchaseTotals(lines,Number(purchase.vat_rate));
  return <><div className="order-actions print-hide"><Link href={`/compras/${id}`} className="back-link">← Volver a la compra</Link><PrintButton label="Imprimir orden / guardar PDF"/></div>
    <article className="order-sheet"><header className="order-header"><div>{purchase.issuer==="rerchar"?<Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={2124} height={740} className="order-logo"/>:<strong>E Y J LIMITADA</strong>}<div className="order-system">{issuer.name}<br/>RUT {issuer.tax_id}</div></div><div className="order-number"><small>{draft?"BORRADOR · SIN EMITIR":"ORDEN DE COMPRA"}</small><h1>{purchase.order_reference}</h1><span>{draft?`Guardado ${day(purchase.updated_at)}`:day(purchase.ordered_at!)}</span></div></header>
      {draft&&<p className="resource-alert">BORRADOR DE ORDEN DE COMPRA · NO ENVIAR AL PROVEEDOR · SIN EMITIR</p>}
      <div className="order-section"><h2>Proveedor y condiciones</h2><div className="order-grid"><div><small>Proveedor</small><strong>{purchase.supplier}</strong></div><div><small>RUT</small><strong>{purchase.supplier_tax_id||"Sin dato"}</strong></div><div><small>Dirección</small><strong>{purchase.supplier_address||"Sin dato"}</strong></div><div><small>Contacto</small><strong>{purchase.supplier_contact||"Sin dato"}</strong></div><div><small>Condiciones de pago</small><strong>{purchase.payment_terms||"Sin dato"}</strong></div><div><small>Centro de costo</small><strong>{purchase.cost_center||"Sin dato"}</strong></div><div><small>Moneda</small><strong>Pesos chilenos (CLP)</strong></div><div><small>Fecha esperada</small><strong>{purchase.expected_date?day(`${dateOnly(purchase.expected_date)}T12:00:00Z`):"Por coordinar"}</strong></div><div><small>Solicitó / aprobó</small><strong>{purchase.requested_name} / {purchase.approved_name||"Pendiente"}</strong></div></div></div>
      <div className="order-section"><h2>Artículos y valores</h2><table className="data-table"><thead><tr><th>Producto o servicio</th><th>Cantidad</th><th>Precio unitario</th><th>Descuento por unidad</th><th>Valor neto</th></tr></thead><tbody>{lines.map((line,index)=><tr key={line.id}><td><strong>{line.name}</strong><small className="table-sub">{line.code}</small></td><td>{Number(line.quantity).toLocaleString("es-CL",{maximumFractionDigits:3})} {line.unit}</td><td>{money(Number(line.unit_price_clp))}</td><td>{money(Number(line.discount_clp))}</td><td>{money(totals.amounts[index])}</td></tr>)}</tbody></table><div className="quote-totals"><div><span>Subtotal neto</span><strong>{money(totals.net)}</strong></div><div><span>IVA ({Number(purchase.vat_rate)*100}%)</span><strong>{money(totals.vat)}</strong></div><div><span>Total</span><strong>{money(totals.total)}</strong></div></div></div>
      {purchase.notes&&<div className="order-section"><h2>Observaciones</h2><p>{purchase.notes}</p></div>}
      <footer className="order-footer"><span>{issuer.name} · {purchase.order_reference}</span><span>{draft?"Borrador sin emitir; no constituye una orden":"Documento generado desde el sistema RERCHAR"}</span></footer>
    </article></>;
}
