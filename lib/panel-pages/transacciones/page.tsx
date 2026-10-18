import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {type Company} from "@/lib/companies";
import {listFinancialTransactions} from "@/lib/financial-transactions";

const money=(v:string|number)=>`$${Number(v).toLocaleString("es-CL",{maximumFractionDigits:2})}`;
const day=(v:Date|string)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
export default async function Transactions({searchParams}:{searchParams:Promise<{empresa?:string;tipo?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const query=await searchParams,company:Company|""=query.empresa==="rerchar"||query.empresa==="e_y_j"?query.empresa:"";
  const direction=query.tipo==="entrada"||query.tipo==="salida"?query.tipo:"";
  const records=await listFinancialTransactions(actor,company,direction);
  const incoming=records.filter(r=>r.direction==="entrada").reduce((sum,r)=>sum+Number(r.amount_clp),0);
  const outgoing=records.filter(r=>r.direction==="salida").reduce((sum,r)=>sum+Number(r.amount_clp),0);
  return <><div className="page-title-row"><div><div className="eyebrow">CONTROL ADMINISTRATIVO · RERCHAR / E Y J</div><h1>Registro de transacciones</h1><p className="page-intro">Cobros registrados y pagos a proveedores por empresa, fecha, documento y responsable.</p></div></div>
    <form action="/transacciones" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><label>Movimiento<select name="tipo" defaultValue={direction}><option value="">Entradas y salidas</option><option value="entrada">Entradas</option><option value="salida">Salidas</option></select></label><button type="submit" className="button button-outline">Aplicar</button></form>
    <div className="supply-summary"><div><strong>{records.length}</strong><span>Registros mostrados</span></div><div><strong>{money(incoming)}</strong><span>Entradas mostradas</span></div><div><strong>{money(outgoing)}</strong><span>Salidas mostradas</span></div></div>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">MOVIMIENTOS DOCUMENTADOS</div><h2>Historial de pagos y cobros</h2></div></div><p className="helper-text">Hasta 500 registros recientes. “Verificada” indica transferencia a proveedor revisada con comprobante por otra persona; “Registrada” indica asiento manual sin esa verificación. Los cobros de clientes requieren conciliación bancaria externa. Estos totales no son saldos bancarios.</p>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha / empresa</th><th>Movimiento</th><th>Factura / tercero</th><th>Monto</th><th>Referencia / responsable</th><th>Control</th></tr></thead><tbody>{records.map(r=><tr key={`${r.source}-${r.id}`}><td>{day(r.paid_on)}<span className="table-sub">{r.company==="rerchar"?"RERCHAR":"E y J"}</span></td><td>{r.direction==="entrada"?"Entrada":"Salida"}</td><td><Link href={r.source==="proveedor"?`/facturas-recibidas/${r.invoice_id}`:`/cobranzas?empresa=${r.company}`}><strong>{r.invoice_number}</strong></Link><span className="table-sub">{r.counterparty}</span></td><td>{money(r.amount_clp)}</td><td>{r.reference}<span className="table-sub">{r.recorded_name}</span></td><td>{r.verification==="verificada"?<a href={`/api/transferencias/${r.transfer_id}/comprobante`} target="_blank" rel="noreferrer">Verificada · comprobante</a>:"Registrada"}</td></tr>)}</tbody></table>{records.length===0&&<p className="muted">Sin movimientos para este filtro.</p>}</div></section></>;
}
