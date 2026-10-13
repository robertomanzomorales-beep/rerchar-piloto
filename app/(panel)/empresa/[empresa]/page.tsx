import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowLeft, Plus } from "lucide-react";
import { requireActor } from "@/lib/auth";
import { companies, type Company } from "@/lib/companies";
import { listServices } from "@/lib/pilot";
import { listQuotes, quoteFolio } from "@/lib/quotes";
import { ServiceTable, chileDate } from "@/components/UI";

export default async function CompanyHome({params}:{params:Promise<{empresa:string}>}) {
  const actor = await requireActor();
  const {empresa} = await params;
  if (empresa !== "rerchar" && empresa !== "e_y_j") notFound();
  const selected = empresa as Company;
  const [quotes, services] = await Promise.all([
    actor.role === "conductor" ? Promise.resolve([]) : listQuotes(actor, "", selected),
    listServices(actor, "", "", selected),
  ]);
  const company = companies[selected];
  return <>
    <Link href="/" className="back-link"><ArrowLeft size={16}/> Cambiar de empresa</Link>
    <div className="page-title-row"><div><div className="eyebrow">EMPRESA OPERADORA · {company.code}</div><h1>{company.short}</h1><p className="page-intro">{company.name}. Propuestas y servicios de esta empresa.</p></div>
      {actor.role !== "conductor" && actor.role !== "cliente" && <Link href={`/cotizaciones/nueva?empresa=${selected}`} className="button button-primary"><Plus size={18}/> Nueva cotización</Link>}
    </div>
    <section className="section-card workflow-overview"><div className="eyebrow">FLUJO DEL SERVICIO</div><h2>Cotización → aceptación → solicitud → operación</h2><p>Al aceptar una cotización, abra su detalle y cree desde allí la solicitud vinculada. Los servicios sin cotización también se pueden registrar directamente.</p><div className="order-actions"><Link href={`/cotizaciones?empresa=${selected}`} className="button button-outline">Todas las cotizaciones <ArrowRight size={16}/></Link><Link href={`/solicitudes?empresa=${selected}`} className="button button-outline">Todas las solicitudes <ArrowRight size={16}/></Link>{actor.role !== "conductor" && <Link href={`/solicitudes/nueva?empresa=${selected}`} className="button button-outline">Solicitud directa</Link>}</div></section>
    {actor.role !== "conductor" && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">COMERCIAL · {company.short}</div><h2>Cotizaciones recientes</h2></div><Link href={`/cotizaciones?empresa=${selected}`} className="text-link">Ver todas <ArrowRight size={16}/></Link></div>{quotes.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Asunto</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{quotes.slice(0,5).map(q=><tr key={q.id}><td><Link href={`/cotizaciones/${q.id}`}><strong>{quoteFolio(q)}</strong></Link></td><td>{q.client_name}</td><td>{q.title}</td><td>{q.status}</td><td>{chileDate(q.created_at)}</td></tr>)}</tbody></table></div> : <p className="muted">Aún no hay cotizaciones registradas para {company.short}.</p>}</section>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">OPERACIÓN · {company.short}</div><h2>Solicitudes recientes</h2></div><Link href={`/solicitudes?empresa=${selected}`} className="text-link">Ver todas <ArrowRight size={16}/></Link></div><ServiceTable services={services.slice(0,8)}/></section>
  </>;
}
