import Link from "next/link";
import {redirect} from "next/navigation";
import {Building2} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {clientContext,clientHref,listClientDirectory,type ClientContext} from "@/lib/client-records";
import {recordPage} from "@/lib/record-pagination";
import {moduleReady} from "@/lib/schema-readiness";

export default async function Clients({searchParams}:{searchParams:Promise<ClientContext>}){
  const actor=await requireActor();if(actor.role==="conductor")redirect("/");
  const query=await searchParams,context=clientContext(query);
  if(actor.role==="cliente")redirect(clientHref({empresa:context.empresa},actor.client_id!));
  const [{clients,total,totalPages,page},hasProfiles]=await Promise.all([listClientDirectory(actor,context.buscar,recordPage(context.pagina)),moduleReady("counterparty_profiles")]);
  if(query.pagina!==undefined&&query.pagina!==String(page))redirect(clientHref({...context,pagina:String(page)}));
  const companyQuery=context.empresa?`?empresa=${context.empresa}`:"";
  const pageHref=(next:number)=>clientHref({...context,pagina:String(next)},"","directorio-clientes");
  return <div className="clients-page"><div className="page-title-row"><div><div className="eyebrow">CARPETA DOCUMENTAL</div><h1>Clientes</h1><p className="page-intro">Servicios, cotizaciones y documentos reunidos en la carpeta de cada cliente.</p></div><Link href={`/maestros${companyQuery}#clientes`} className="button button-primary">Registrar cliente</Link></div>
    <section className="section-card client-section" id="directorio-clientes"><div className="section-heading"><div><div className="eyebrow">DIRECTORIO</div><h2><Building2 size={19}/> Clientes y documentos</h2></div><span className="count-pill">{total}</span></div>
    <form key={context.buscar??""} action="/clientes#directorio-clientes" method="GET" className="client-search" data-client-search>{context.empresa&&<input type="hidden" name="empresa" value={context.empresa}/>}<label>Buscar cliente<input type="search" name="buscar" defaultValue={context.buscar??""} maxLength={160} placeholder="Razón social o RUT"/></label><button className="button button-outline" type="submit">Buscar</button>{context.buscar&&<Link href={clientHref({empresa:context.empresa})} className="text-link">Limpiar búsqueda</Link>}</form>
    {clients.length?<div className="table-wrap" role="region" aria-label="Directorio de clientes" tabIndex={0}><table className="data-table"><thead><tr><th>Cliente</th><th>RUT</th><th>Faenas</th><th>Servicios</th><th>Carpeta</th></tr></thead><tbody>{clients.map(c=><tr key={c.id} data-directory-client={c.id}><td><strong>{c.name}</strong></td><td>{c.tax_id||"Por completar"}</td><td>{c.sites}</td><td>{c.services}</td><td><Link href={clientHref(context,c.id)} className="button button-outline" aria-label={`Abrir carpeta de ${c.name}`}>Abrir carpeta</Link></td></tr>)}</tbody></table></div>:<p className="muted">{context.buscar?"No hay clientes que coincidan con esta búsqueda.":"Registre el primer cliente desde el botón superior."}</p>}
    {totalPages>1&&<nav className="records-pagination" aria-label="Páginas del directorio de clientes"><span>{page>1&&<Link href={pageHref(page-1)} className="button button-outline">Anterior</Link>}</span><span>Página {page} de {totalPages} · {total} clientes</span><span>{page<totalPages&&<Link href={pageHref(page+1)} className="button button-outline">Siguiente</Link>}</span></nav>}
    </section>{actor.role==="admin"&&hasProfiles&&<p className="helper-text"><Link href={`/fichas${companyQuery}`} className="text-link">Abrir fichas legales, tributarias y de contacto</Link></p>}
  </div>;
}
