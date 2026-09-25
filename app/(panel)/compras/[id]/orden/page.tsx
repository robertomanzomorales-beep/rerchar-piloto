import Image from "next/image";
import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {getPurchase,SupplyError} from "@/lib/supply";
import {issuers} from "@/lib/quotes";
import PrintButton from "@/components/PrintButton";

const money=(n:number)=>`$${n.toLocaleString("es-CL")}`;
function day(value:Date|string){return new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeZone:"America/Santiago"}).format(new Date(value));}
function dateOnly(value:Date|string){return value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);}
export default async function PurchaseOrder({params}:{params:Promise<{id:string}>}){
  const actor=await requireActor();const {id}=await params;
  let detail;try{detail=await getPurchase(actor,id);}catch(error){if(error instanceof SupplyError)notFound();throw error;}
  const {purchase,lines}=detail;if(!purchase.order_reference||!purchase.supplier||!purchase.ordered_at)notFound();
  const issuer=issuers[purchase.issuer];
  const net=lines.reduce((total,line)=>total+Math.round(Number(line.quantity)*Number(line.unit_price_clp)),0);
  const vat=Math.round(net*Number(purchase.vat_rate));
  return <><div className="order-actions print-hide"><Link href={`/compras/${id}`} className="back-link">← Volver a la compra</Link><PrintButton label="Imprimir orden / guardar PDF"/></div>
    <article className="order-sheet"><header className="order-header"><div>{purchase.issuer==="rerchar"?<Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={2124} height={740} className="order-logo"/>:<strong>E Y J LIMITADA</strong>}<div className="order-system">{issuer.name}<br/>RUT {issuer.tax_id}</div></div><div className="order-number"><small>ORDEN DE COMPRA</small><h1>{purchase.order_reference}</h1><span>{day(purchase.ordered_at)}</span></div></header>
      <div className="order-section"><h2>Proveedor y condiciones</h2><div className="order-grid"><div><small>Proveedor</small><strong>{purchase.supplier}</strong></div><div><small>RUT</small><strong>{purchase.supplier_tax_id||"Sin dato"}</strong></div><div><small>Dirección</small><strong>{purchase.supplier_address||"Sin dato"}</strong></div><div><small>Pago</small><strong>{purchase.payment_terms||"Sin dato"}</strong></div><div><small>Fecha esperada</small><strong>{purchase.expected_date?day(`${dateOnly(purchase.expected_date)}T12:00:00Z`):"Por coordinar"}</strong></div><div><small>Solicitó / aprobó</small><strong>{purchase.requested_name} / {purchase.approved_name||"Pendiente"}</strong></div></div></div>
      <div className="order-section"><h2>Artículos y valores</h2><table className="data-table"><thead><tr><th>Producto o servicio</th><th>Cantidad</th><th>Precio unitario</th><th>Total neto</th></tr></thead><tbody>{lines.map(line=><tr key={line.id}><td><strong>{line.name}</strong><small className="table-sub">{line.code}</small></td><td>{Number(line.quantity).toLocaleString("es-CL",{maximumFractionDigits:3})} {line.unit}</td><td>{money(Number(line.unit_price_clp))}</td><td>{money(Math.round(Number(line.quantity)*Number(line.unit_price_clp)))}</td></tr>)}</tbody></table><div className="quote-totals"><div><span>Neto</span><strong>{money(net)}</strong></div><div><span>IVA ({Number(purchase.vat_rate)*100}%)</span><strong>{money(vat)}</strong></div><div><span>Total</span><strong>{money(net+vat)}</strong></div></div></div>
      {purchase.notes&&<div className="order-section"><h2>Observaciones</h2><p>{purchase.notes}</p></div>}
      <footer className="order-footer"><span>{issuer.name} · {purchase.order_reference}</span><span>Documento generado desde el sistema RERCHAR</span></footer>
    </article></>;
}
