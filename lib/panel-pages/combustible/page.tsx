import {createHash,randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {Fuel,TrendingUp,ArrowRight} from "lucide-react";
import {canManage,requireActor} from "@/lib/auth";
import {listFuel} from "@/lib/continuity";
import {fuelContext,fuelHref,type FuelContext} from "@/lib/fuel-form-state";
import {recordPage} from "@/lib/record-pagination";
import {Notice,chileDate} from "@/components/UI";
import {FuelForm} from "@/components/FuelForm";
import {serviceFolio} from "@/lib/companies";

const amount=(value:number|string,digits=2)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:digits});
export default async function FuelPage({searchParams}:{searchParams:Promise<FuelContext&{error?:string;ok?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const query=await searchParams,context=fuelContext(query);
  const {assets,drivers,services,historyAssets,entries,totalEntries,totalLiters,totalCost,page,totalPages}=await listFuel(actor,recordPage(context.pagina),context.activo);
  if(query.pagina!==undefined&&query.pagina!==String(page))redirect(fuelHref({...context,pagina:String(page)},"historial-cargas",{ok:query.ok,error:query.error}));
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const formVersion=createHash("sha256").update(JSON.stringify([assets.map(x=>[x.id,x.reading_unit,x.current_reading,x.reading_version]),drivers.map(x=>x.id),services.map(x=>[x.id,x.asset_id,x.driver_id])])).digest("hex");
  const maintenanceHref=context.empresa?`/mantenimiento?empresa=${context.empresa}`:"/mantenimiento";
  const historyPage=(next:number)=>fuelHref({...context,pagina:String(next)},"historial-cargas");
  return <div className="fuel-page">
    <div className="page-title-row"><div><div className="eyebrow">COSTOS OPERACIONALES</div><h1>Combustible y rendimiento</h1><p className="page-intro">Cada carga queda asociada al activo, lectura, conductor, comprobante y servicio cuando corresponde.</p></div><span className="title-icon"><Fuel size={23}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <div className="supply-summary"><div><strong>{totalEntries}</strong><span>Cargas registradas</span></div><div><strong>{amount(totalLiters,3)}</strong><span>Litros registrados</span></div><div><strong>${amount(totalCost,2)}</strong><span>Costo registrado</span></div><Link href={maintenanceHref} className="button button-outline">Lecturas de activos <ArrowRight size={16}/></Link></div>
    <div className="supply-columns fuel-layout">
      <section className="section-card fuel-section" id="nueva-carga"><div className="section-heading"><div><div className="eyebrow">REGISTRO</div><h2><Fuel size={19}/> Nueva carga</h2></div></div><FuelForm key={formVersion} assets={assets.map(({id,code,label,reading_unit,current_reading})=>({id,code,label,reading_unit,current_reading}))} drivers={drivers} services={services} context={context} submissionKey={randomUUID()} today={today}/></section>
      <section className="section-card fuel-section" id="historial-cargas"><div className="section-heading"><div><div className="eyebrow">HISTORIAL</div><h2><TrendingUp size={19}/> Consumo por activo</h2></div><span className="count-pill">{totalEntries}</span></div>
        <form action="/combustible#historial-cargas" method="GET" className="fuel-history-filter" key={context.activo??"todos"} data-fuel-filter>{context.empresa&&<input type="hidden" name="empresa" value={context.empresa}/>}<label>Activo del historial<select name="activo" defaultValue={context.activo??""}><option value="">Toda la flota</option>{context.activo&&!historyAssets.some(x=>x.id===context.activo)&&<option value={context.activo}>Activo anterior no disponible</option>}{historyAssets.map(x=><option key={x.id} value={x.id}>{x.code} · {x.label}{x.archived?" · Archivado":""}</option>)}</select></label><button className="button button-outline" type="submit">Filtrar</button>{context.activo&&<Link className="text-link" href={fuelHref({empresa:context.empresa},"historial-cargas")}>Limpiar filtro</Link>}</form>
        <p className="helper-text">{context.activo?"El resumen y el historial corresponden al activo seleccionado.":"El resumen incluye todas las cargas de la flota compartida."} El rendimiento se estima entre dos cargas completas consecutivas, con fechas en orden y avance de lectura. Las cargas parciales y los horómetros se conservan sin estimación en km/L.</p>
        {entries.length?<div className="table-wrap" role="region" aria-label="Historial de consumo por activo" tabIndex={0}><table className="data-table fuel-history-table"><thead><tr><th>Fecha / activo</th><th>Carga</th><th>Costo</th><th>Lectura</th><th>Rendimiento</th></tr></thead><tbody>{entries.map(entry=><tr key={entry.id} data-fuel-entry={entry.id}><td>{chileDate(`${entry.fuel_date instanceof Date?entry.fuel_date.toISOString().slice(0,10):String(entry.fuel_date).slice(0,10)}T12:00:00Z`,false)}<span className="table-sub">{entry.asset_code} · {entry.asset_label}{entry.driver_name?` · ${entry.driver_name}`:""}</span>{entry.notes&&<details className="fuel-record-notes"><summary>Observaciones</summary><p>{entry.notes}</p></details>}</td><td>{amount(entry.liters,3)} L<span className="table-sub">{entry.full_tank?"Tanque completo":"Carga parcial"}</span><span className="table-sub">{entry.supplier} · {entry.receipt_number}{entry.service_folio?` · ${serviceFolio({folio:entry.service_folio,operating_company:entry.service_company})}`:""}</span></td><td>${amount(entry.cost_clp,2)}</td><td>{amount(entry.reading)} {entry.reading_unit}</td><td>{entry.km_per_liter?`${amount(entry.km_per_liter,3)} km/L`:"—"}</td></tr>)}</tbody></table></div>:<p className="muted">{context.activo?"No hay cargas para el activo seleccionado.":"No hay cargas registradas."}</p>}
        {totalPages>1&&<nav className="records-pagination" aria-label="Páginas de combustible"><span>{page>1&&<Link className="button button-outline" href={historyPage(page-1)}>Anterior</Link>}</span><span>Página {page} de {totalPages} · {totalEntries} cargas</span><span>{page<totalPages&&<Link className="button button-outline" href={historyPage(page+1)}>Siguiente</Link>}</span></nav>}
      </section>
    </div>
  </div>;
}
