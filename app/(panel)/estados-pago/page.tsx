import Link from "next/link";
import {redirect} from "next/navigation";
import {Plus,ReceiptText} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {listPaymentStatements} from "@/lib/payment-statements";
import {Notice} from "@/components/UI";

const day=(v:Date|string)=>new Intl.DateTimeFormat("es-CL",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(v));
const labels={residuos:"Transporte y disposición",arriendo:"Arriendo de equipo"};
export default async function PaymentStatements({searchParams}:{searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const [rows,query]=await Promise.all([listPaymentStatements(actor),searchParams]);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">E Y J · COBRANZA CONTRACTUAL</div><h1>Estados de pago</h1><p className="page-intro">Transporte y disposición por tickets, o arriendo de equipo por período. Valores en CLP o UF según el contrato.</p></div>{actor.role==="admin"&&<Link href="/estados-pago/nuevo" className="button button-primary"><Plus size={17}/> Nuevo EDP</Link>}</div>
    <Notice error={query.error} ok={query.ok}/>
    <div className="company-metric-grid"><div className="company-metric"><span>Estados de pago</span><strong>{rows.length}</strong><small>E y J</small></div><div className="company-metric"><span>Borradores y observados</span><strong>{rows.filter(r=>["borrador","observado"].includes(r.status)).length}</strong><small>Por completar o corregir</small></div><div className="company-metric"><span>Enviados</span><strong>{rows.filter(r=>r.status==="enviado").length}</strong><small>Esperan aprobación</small></div><div className="company-metric"><span>Aprobados</span><strong>{rows.filter(r=>r.status==="aprobado").length}</strong><small>Registro administrativo</small></div></div>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">FORMATOS RECIBIDOS</div><h2><ReceiptText size={19}/> Control por cliente y período</h2></div></div>
      <p className="helper-text">El monto y el IVA se calculan desde las líneas. El valor UF y su fecha se guardan en cada cobro; no se consulta automáticamente. Un EDP no emite factura tributaria.</p>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>EDP / período</th><th>Cliente</th><th>Formato</th><th>Estado</th><th></th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><Link className="table-main" href={`/estados-pago/${row.id}`}>N° {row.number}</Link><span className="table-sub">{day(row.period_on)}</span></td><td>{row.client_name}</td><td>{labels[row.statement_type]}</td><td><span className={`edp-status edp-status-${row.status}`}>{row.status}</span></td><td><Link className="text-link" href={`/estados-pago/${row.id}`}>Abrir</Link></td></tr>)}</tbody></table>{rows.length===0&&<p className="muted">Todavía no hay estados de pago. Cree uno con el formato correspondiente al contrato.</p>}</div></section>
  </>;
}
