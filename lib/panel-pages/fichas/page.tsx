import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {counterpartyPage} from "@/lib/counterparties";
import {moduleReady} from "@/lib/schema-readiness";
import {counterpartyContext,counterpartyHref,type CounterpartyContext} from "@/lib/counterparty-form-state";
import {recordsPerPage} from "@/lib/record-pagination";

export default async function CounterpartyIndex({searchParams}:{searchParams:Promise<CounterpartyContext>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  if(!await moduleReady("counterparty_profiles"))return <section className="section-card"><h1>Fichas de clientes y proveedores</h1><p>Falta aplicar la migración 049 para habilitar estas fichas.</p></section>;
  const query=await searchParams,board=await counterpartyPage(actor,query.pagina),{rows,total,page,pages}=board,context=counterpartyContext({pagina:String(page)});
  if(query.pagina!==undefined&&query.pagina!==String(page))redirect(counterpartyHref(context));
  const pagination=()=>pages>1?<nav className="records-pagination" aria-label="Páginas de fichas legales"><span>{page>1&&<Link className="button button-outline" href={counterpartyHref({pagina:String(page-1)})}>Anterior</Link>}</span><span>Página {page} de {pages} · {total} fichas</span><span>{page<pages&&<Link className="button button-outline" href={counterpartyHref({pagina:String(page+1)})}>Siguiente</Link>}</span></nav>:null;
  return <><div className="page-title-row"><div><div className="eyebrow">ADMINISTRACIÓN · DATOS CONFIDENCIALES</div><h1>Fichas de clientes y proveedores</h1><p className="page-intro">Datos legales, facturación, contactos y respaldo bancario según el formato de Carol. La cuenta debe ser verificada por otra persona antes de solicitar transferencias.</p></div><Link href={counterpartyHref(context,"nueva")} className="button button-primary">Nueva ficha</Link></div>
    <section className="section-card"><p className="helper-text">{total?`Mostrando ${(page-1)*recordsPerPage+1}–${Math.min(page*recordsPerPage,total)} de ${total} fichas.`:"Sin fichas registradas."}</p>{pagination()}<div className="table-wrap" role="region" aria-label="Fichas de clientes y proveedores" tabIndex={0}><table className="data-table"><thead><tr><th>Empresa</th><th>RUT</th><th>Relación</th><th>Revisión</th><th></th></tr></thead><tbody>{rows.map(row=><tr key={row.id} data-counterparty-row={row.id}><td><strong>{row.legal_name}</strong></td><td>{row.tax_id}</td><td>{row.kind}</td><td>{row.status==="verificada"?"Verificada":"Pendiente"}</td><td><Link href={counterpartyHref(context,row.id)} className="text-link">Abrir ficha →</Link></td></tr>)}</tbody></table>{rows.length===0&&<p className="muted">Todavía no hay fichas. Puede comenzar por un proveedor o vincular un cliente registrado.</p>}</div>{pagination()}</section></>;
}
