import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {listMaterialCatalog,listMaterialStockMovementsPage} from "@/lib/material-stock";
import {Notice,chileCalendarDate} from "@/components/UI";
import MaterialStockAdjustmentForm from "@/components/MaterialStockAdjustmentForm";
import {materialStockContext} from "@/lib/material-stock-form-state";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

const kg=(v:string|number)=>`${Number(v).toLocaleString("es-CL",{maximumFractionDigits:2})} kg`;
const kinds:Record<string,string>={saldo_inicial:"Saldo inicial",ingreso:"Recepción confirmada",salida_guia:"Salida por venta",reversa_guia:"Corrección de guía",ajuste_entrada:"Ajuste de entrada",ajuste_salida:"Ajuste de salida"};

export default async function MaterialStockPage({searchParams}:{searchParams:Promise<{material?:string;pagina?:string;error?:string;ok?:string;formulario?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  if(!await moduleReady("stock"))return <ModuleUnavailable title="Stock de materiales" company="rerchar"/>;
  const params=await searchParams;
  const catalog=await listMaterialCatalog(actor);
  const selected=catalog.find(m=>m.id===params.material);
  const {movements,total,allTotal,page,totalPages}=await listMaterialStockMovementsPage(actor,selected?.id??"",params.pagina);
  const pageHref=(next:number)=>`/materiales-stock?${new URLSearchParams({...(selected?{material:selected.id}:{}),pagina:String(next)})}#movimientos-material`;
  const confirmed=catalog.filter(m=>Number(m.quantity_kg)>0);
  const context=materialStockContext({material:selected?.id,pagina:String(page)});
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  return <>
    <div className="page-title-row"><div><div className="eyebrow">RERCHAR · MATERIAL COMERCIALIZADO</div><h1>Stock de materiales</h1><p className="page-intro">Saldos físicos confirmados, recepciones, salidas desde stock y ajustes documentados. Los EPP e insumos de CONTROL BODEGA siguen en Inventario.</p></div><Link href="/ingresos" className="button button-outline">Ingresos de material</Link></div>
    <Notice error={params.error} ok={params.ok}/>
    <div className="company-metric-grid"><div className="company-metric"><span>Materiales del catálogo</span><strong>{catalog.length}</strong><small>Planillas ENTRADA MATERIAL y CONTROL GUIA 2026</small></div><div className="company-metric"><span>Con saldo confirmado</span><strong>{confirmed.length}</strong><small>El resto no tiene existencia registrada</small></div><div className="company-metric"><span>Movimientos registrados</span><strong>{allTotal.toLocaleString("es-CL")}</strong><small>Historial completo de materiales</small></div></div>
    <p className="helper-text">No se cargaron saldos históricos desde las planillas: iniciar un saldo exige conteo y respaldo. Un ingreso suma kilos RERCHAR menos impurezas sólo al confirmarlo en su ficha. En una venta, sólo la columna «desde stock» consume este saldo; el peso de faena sigue en tránsito.</p>
    <nav className="client-section-links" aria-label="Secciones de stock de materiales">{actor.role==="admin"&&<a href="#ajuste-material">Registrar saldo o ajuste</a>}<a href="#existencias-material">Existencias</a><a href="#movimientos-material">Historial de movimientos</a></nav>
    {actor.role==="admin"&&<details id="ajuste-material" className="section-card finance-section" open={params.formulario==="ajuste"}><summary>Registrar saldo inicial o ajuste</summary><p className="helper-text">Indique una referencia verificable y la razón. Un saldo inicial sólo se permite antes del primer movimiento de ese material. Los ajustes crean asientos nuevos y no borran la historia.</p><MaterialStockAdjustmentForm key={`${selected?.id??"all"}:${page}:${params.ok??""}`} catalog={catalog} context={context} today={today}/></details>}
    <section id="existencias-material" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">CATÁLOGO DE LAS PLANILLAS</div><h2>Existencias por material</h2></div></div><form key={selected?.id??"all"} action="/materiales-stock#movimientos-material" method="GET" className="filters"><label>Ver detalle<select name="material" defaultValue={selected?.id??""}><option value="">Todos</option>{catalog.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button className="button button-outline" type="submit">Filtrar</button></form><div className="table-wrap" role="region" aria-label="Existencias por material" tabIndex={0}><table className="data-table"><thead><tr><th>Material</th><th>Saldo disponible</th><th>Movimientos</th></tr></thead><tbody>{catalog.filter(m=>!selected||selected.id===m.id).map(m=><tr key={m.id}><td>{m.name}</td><td><strong>{kg(m.quantity_kg)}</strong></td><td><Link className="text-link" href={`/materiales-stock?material=${m.id}#movimientos-material`}>Ver historial</Link></td></tr>)}</tbody></table></div></section>
    <section id="movimientos-material" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">TRAZABILIDAD</div><h2>Historial de movimientos</h2></div><span className="count-pill">{total.toLocaleString("es-CL")}</span></div><p className="helper-text">{selected?`Material: ${selected.name}. `:"Todos los materiales. "}El historial muestra 100 movimientos por página, ordenados del más reciente al más antiguo. Los saldos incluyen todos los movimientos registrados.{selected&&<> <Link className="text-link" href="/materiales-stock#movimientos-material">Ver todos los materiales</Link></>}</p><div className="table-wrap" role="region" aria-label="Movimientos de material" tabIndex={0}><table className="data-table"><thead><tr><th>Fecha</th><th>Material / origen</th><th>Movimiento</th><th>Peso</th><th>Registró</th></tr></thead><tbody>{movements.map(m=><tr key={m.id} data-stock-movement={m.id}><td>{chileCalendarDate(m.occurred_on)}</td><td>{m.material_name}<span className="table-sub">{m.reference} · {m.reason}</span></td><td>{kinds[m.kind]??m.kind}</td><td><strong>{Number(m.delta_kg)>0?"+":""}{kg(m.delta_kg)}</strong></td><td>{m.actor_name}</td></tr>)}</tbody></table>{!movements.length&&<p className="muted">{selected?"No hay movimientos registrados para este material.":"Aún no hay movimientos confirmados."}</p>}</div>{totalPages>1&&<nav className="records-pagination" aria-label="Páginas del historial de materiales"><span>{page>1&&<Link className="button button-outline" href={pageHref(page-1)}>Anterior</Link>}</span><span>Página {page} de {totalPages} · {total.toLocaleString("es-CL")} movimientos</span><span>{page<totalPages&&<Link className="button button-outline" href={pageHref(page+1)}>Siguiente</Link>}</span></nav>}</section>
  </>;
}
