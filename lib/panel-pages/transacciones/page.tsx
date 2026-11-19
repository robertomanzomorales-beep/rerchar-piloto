import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {type Company} from "@/lib/companies";
import {listFinancialTransactionsPage} from "@/lib/financial-transactions";
import {lastRecordPage,recordPage} from "@/lib/record-pagination";
import {receivableHref} from "@/lib/receivable-form-state";
import {chileCalendarDate} from "@/components/UI";

const money=(value:string|number)=>`$${Number(value).toLocaleString("es-CL",{maximumFractionDigits:2})}`;
export default async function Transactions({searchParams}:{searchParams:Promise<{empresa?:string;tipo?:string;pagina?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const query=await searchParams,company:Company|""=query.empresa==="rerchar"||query.empresa==="e_y_j"?query.empresa:"",direction=query.tipo==="entrada"||query.tipo==="salida"?query.tipo:"",page=recordPage(query.pagina);
  const result=await listFinancialTransactionsPage(actor,company,direction,100,(page-1)*100),lastPage=lastRecordPage(result.total);
  const href=(next:number)=>`/transacciones?${new URLSearchParams({empresa:company,tipo:direction,pagina:String(next)})}#movimientos`;
  if(page>lastPage)redirect(href(lastPage));
  return <div className="transactions-page"><div className="page-title-row"><div><div className="eyebrow">CONTROL ADMINISTRATIVO</div><h1>Registro de transacciones</h1><p className="page-intro">Cobros registrados y pagos a proveedores por empresa, documento y responsable.</p></div></div>
    <form key={`${company}:${direction}`} action="/transacciones" method="GET" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><label>Movimiento<select name="tipo" defaultValue={direction}><option value="">Entradas y salidas</option><option value="entrada">Entradas</option><option value="salida">Salidas</option></select></label><button type="submit" className="button button-outline">Aplicar filtros</button></form>
    <div className="supply-summary"><div><strong>{result.total}</strong><span>Movimientos del filtro</span></div><div><strong>{money(result.incoming)}</strong><span>Entradas del filtro</span></div><div><strong>{money(result.outgoing)}</strong><span>Salidas del filtro</span></div></div>
    <section id="movimientos" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">MOVIMIENTOS DOCUMENTADOS</div><h2>Historial de pagos y cobros</h2></div><span className="count-pill">{result.total}</span></div><p className="helper-text">Los totales incluyen todos los movimientos del filtro. El historial muestra 100 por página. Verificada identifica una transferencia a proveedor revisada con comprobante por otra persona; Registrada identifica un asiento manual. Los cobros de clientes requieren conciliación bancaria externa. Estos importes no son saldos bancarios.</p>
      {result.items.length?<div className="table-wrap" role="region" aria-label="Historial de transacciones" tabIndex={0}><table className="data-table"><thead><tr><th>Fecha / empresa</th><th>Movimiento</th><th>Factura / tercero</th><th>Monto</th><th>Referencia / responsable</th><th>Control</th></tr></thead><tbody>{result.items.map(r=><tr key={`${r.source}-${r.id}`} data-financial-transaction={`${r.source}:${r.id}`}><td>{chileCalendarDate(r.paid_on)}<span className="table-sub">{r.company==="rerchar"?"RERCHAR":"E y J"}</span></td><td><span className={`badge transaction-${r.direction}`}>{r.direction==="entrada"?"Entrada":"Salida"}</span></td><td><Link href={r.source==="proveedor"?`/facturas-recibidas/${r.invoice_id}`:r.source==="servicio"&&r.service_id?`/finanzas/${r.service_id}`:receivableHref({empresa:r.company,estado:"todas"},`factura-${r.invoice_id}`,{origen:"payment",registro:r.invoice_id})}><strong>{r.invoice_number}</strong></Link><span className="table-sub">{r.counterparty}</span></td><td className="transaction-amount">{money(r.amount_clp)}</td><td>{r.reference}<span className="table-sub">{r.recorded_name}</span></td><td>{r.verification==="verificada"?<a href={`/api/transferencias/${r.transfer_id}/comprobante`} target="_blank" rel="noreferrer">Verificada · comprobante</a>:"Registrada"}</td></tr>)}</tbody></table></div>:<p className="muted">No hay movimientos para estos filtros.</p>}
      {lastPage>1&&<nav className="records-pagination" aria-label="Páginas de transacciones"><span>{page>1&&<Link className="button button-outline" href={href(page-1)}>Anterior</Link>}</span><span>Página {page} de {lastPage} · {result.total} movimientos</span><span>{page<lastPage&&<Link className="button button-outline" href={href(page+1)}>Siguiente</Link>}</span></nav>}
    </section>
  </div>;
}
