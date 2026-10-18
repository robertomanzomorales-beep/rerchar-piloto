import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {listCounterparties} from "@/lib/counterparties";
import {moduleReady} from "@/lib/schema-readiness";

export default async function CounterpartyIndex(){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  if(!await moduleReady("counterparty_profiles"))return <section className="section-card"><h1>Fichas de clientes y proveedores</h1><p>Falta aplicar la migración 049 para habilitar estas fichas.</p></section>;
  const rows=await listCounterparties(actor);
  return <><div className="page-title-row"><div><div className="eyebrow">ADMINISTRACIÓN · DATOS CONFIDENCIALES</div><h1>Fichas de clientes y proveedores</h1><p className="page-intro">Datos legales, facturación, contactos y respaldo bancario según el formato de Carol. La cuenta debe ser verificada por otra persona antes de solicitar transferencias.</p></div><Link href="/fichas/nueva" className="button button-primary">Nueva ficha</Link></div>
    <section className="section-card"><div className="table-wrap"><table className="data-table"><thead><tr><th>Empresa</th><th>RUT</th><th>Relación</th><th>Revisión</th><th></th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.legal_name}</strong></td><td>{row.tax_id}</td><td>{row.kind}</td><td>{row.status==="verificada"?"Verificada":"Pendiente"}</td><td><Link href={`/fichas/${row.id}`} className="text-link">Abrir ficha →</Link></td></tr>)}</tbody></table>{rows.length===0&&<p className="muted">Todavía no hay fichas. Puede comenzar por un proveedor o vincular un cliente registrado.</p>}</div></section></>;
}
