import Link from "next/link";
import Image from "next/image";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {getMaterialReceipt,materialAmounts,MaterialError} from "@/lib/materials";
import PrintButton from "@/components/PrintButton";

const format=(n:number|null)=>n==null?"Pendiente":n.toLocaleString("es-CL",{maximumFractionDigits:2});
const date=(value:Date|string)=>new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeZone:"UTC"}).format(new Date(value));

export default async function EntrySheet({params}:{params:Promise<{id:string}>}){
  const actor=await requireActor();
  const {id}=await params;
  let receipt;
  try{receipt=await getMaterialReceipt(actor,id);}catch(error){if(error instanceof MaterialError)notFound();throw error;}
  const [client]=await db.query<{tax_id:string|null;address:string|null;email:string|null}>(
    "SELECT tax_id,address,email FROM clients WHERE id=$1 AND deleted_at IS NULL",[receipt.client_id]);
  if(!client)notFound();
  const amounts=materialAmounts(receipt);
  return <>
    <div className="order-actions print-hide"><Link href={`/ingresos/${id}`} className="back-link">← Volver al ingreso</Link><PrintButton label="Imprimir hoja / guardar PDF"/></div>
    <article className="order-sheet">
      <header className="order-header"><div><Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={2124} height={740} className="order-logo"/><div className="order-system">RERCHAR CHILE SPA · REGISTRO DE RECEPCIÓN</div></div><div className="order-number"><small>HOJA INGRESO DE MATERIALES N°</small><h1>{receipt.entry_sheet||"Pendiente"}</h1></div></header>
      <div className="order-section"><h2>Empresa y recepción</h2><div className="order-grid">
        <div><small>Empresa / cliente</small><strong>{receipt.client_name}</strong></div><div><small>Conductor</small><strong>{receipt.driver_name||"No informado"}</strong></div>
        <div><small>RUT empresa</small><strong>{client.tax_id||"No registrado"}</strong></div><div><small>RUT conductor</small><strong>{receipt.driver_tax_id||"No informado"}</strong></div>
        <div><small>Lugar de recepción o retiro</small><strong>{receipt.site_name}</strong></div><div><small>Patente transporte / rampa</small><strong>{receipt.truck_plate||"No informada"} / {receipt.trailer_plate||"—"}</strong></div>
        <div><small>Dirección / correo</small><strong>{client.address||"No registrada"} · {client.email||"Correo no registrado"}</strong></div><div><small>Origen / destino</small><strong>{receipt.origin||"No informado"} → {receipt.destination||"No informado"}</strong></div>
        <div><small>Fecha de entrega</small><strong>{date(receipt.movement_on)}</strong></div><div><small>N° de ticket de pesaje</small><strong>{receipt.weighing_ticket}</strong></div>
      </div></div>
      <div className="order-section"><h2>Detalle del material recibido</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Ítem</th><th>Descripción</th><th>Precio unitario</th><th>Cantidad base</th><th>Impurezas</th><th>Neto</th><th>Total estimado</th></tr></thead><tbody><tr>
        <td>1</td><td>{receipt.material_name}</td><td>{receipt.unit_price_clp==null?"Pendiente":`$${format(Number(receipt.unit_price_clp))}/kg`}</td>
        <td>{format(receipt.net_basis==="proveedor"?receipt.supplier_kg==null?null:Number(receipt.supplier_kg):receipt.rerchar_kg==null?null:Number(receipt.rerchar_kg))} kg</td>
        <td>{format(Number(receipt.impurity_kg))} kg</td><td>{format(amounts.net_kg)} kg</td>
        <td>{amounts.total_clp==null?"Pendiente":`$${format(amounts.total_clp)}`}</td>
      </tr></tbody></table></div>
        <div className="quote-totals"><div><span>Total estimado</span><strong>{amounts.total_clp==null?"Pendiente":`$${format(amounts.total_clp)}`}</strong></div></div>
        {receipt.net_reported_kg!=null&&<p>Neto anotado en planilla: {format(Number(receipt.net_reported_kg))} kg{amounts.variance_kg!=null?` · diferencia: ${format(amounts.variance_kg)} kg`:""}.</p>}
      </div>
      <div className="order-section"><h2>Referencias y pago</h2><div className="order-grid"><div><small>Guía de origen / traslado</small><strong>{receipt.origin_guide||"—"} / {receipt.transfer_guide||"—"}</strong></div><div><small>Guía valorizada / factura</small><strong>{receipt.valued_guide||"—"} / {receipt.invoice_number||"—"}</strong></div><div><small>Estado de pago</small><strong>{receipt.payment_status}</strong></div><div><small>Datos bancarios</small><strong>No registrados en el sistema</strong></div></div>{receipt.notes&&<p>{receipt.notes}</p>}</div>
      <footer className="order-footer"><span>Registro operativo; validar precios y datos de pago antes de cualquier liquidación.</span><span>Ticket {receipt.weighing_ticket}</span></footer>
    </article>
  </>;
}
