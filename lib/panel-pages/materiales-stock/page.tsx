import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {listMaterialCatalog,listMaterialStockMovements} from "@/lib/material-stock";
import {adjustMaterialStockAction} from "@/app/material-stock-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

const kg=(v:string|number)=>`${Number(v).toLocaleString("es-CL",{maximumFractionDigits:2})} kg`;
const date=(v:Date|string)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const kinds:Record<string,string>={saldo_inicial:"Saldo inicial",ingreso:"Recepción confirmada",salida_guia:"Salida por venta",reversa_guia:"Corrección de guía",ajuste_entrada:"Ajuste de entrada",ajuste_salida:"Ajuste de salida"};

export default async function MaterialStockPage({searchParams}:{searchParams:Promise<{material?:string;error?:string;ok?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  if(!await moduleReady("stock"))return <ModuleUnavailable title="Stock de materiales" company="rerchar"/>;
  const params=await searchParams;
  const [catalog,allMovements]=await Promise.all([listMaterialCatalog(actor),listMaterialStockMovements(actor)]);
  const selected=catalog.find(m=>m.id===params.material);
  const movements=selected?allMovements.filter(m=>m.material_id===selected.id):allMovements;
  const confirmed=catalog.filter(m=>Number(m.quantity_kg)>0);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">RERCHAR · MATERIAL COMERCIALIZADO</div><h1>Stock de materiales</h1><p className="page-intro">Saldos físicos confirmados, recepciones, salidas desde stock y ajustes documentados. Los EPP e insumos de CONTROL BODEGA siguen en Inventario.</p></div><Link href="/ingresos" className="button button-outline">Ingresos de material</Link></div>
    <Notice error={params.error} ok={params.ok}/>
    <div className="company-metric-grid"><div className="company-metric"><span>Materiales del catálogo</span><strong>{catalog.length}</strong><small>Planillas ENTRADA MATERIAL y CONTROL GUIA 2026</small></div><div className="company-metric"><span>Con saldo confirmado</span><strong>{confirmed.length}</strong><small>El resto no tiene existencia registrada</small></div><div className="company-metric"><span>Movimientos recientes</span><strong>{allMovements.length}</strong><small>Últimos 200 asientos</small></div></div>
    <p className="helper-text">No se cargaron saldos históricos desde las planillas: iniciar un saldo exige conteo y respaldo. Un ingreso suma kilos RERCHAR menos impurezas sólo al confirmarlo en su ficha. En una venta, sólo la columna «desde stock» consume este saldo; el peso de faena sigue en tránsito.</p>
    {actor.role==="admin"&&<details className="section-card"><summary>Registrar saldo inicial o ajuste</summary><p className="helper-text">Indique una referencia verificable y la razón. Un saldo inicial sólo se permite antes del primer movimiento de ese material. Los ajustes crean asientos nuevos y no borran la historia.</p><form action={adjustMaterialStockAction} className="form-grid"><label>Material<select name="material_id" required defaultValue={selected?.id??""}><option value="">Seleccione</option>{catalog.map(m=><option key={m.id} value={m.id}>{m.name} · {kg(m.quantity_kg)}</option>)}</select></label><label>Movimiento<select name="kind" defaultValue="saldo_inicial"><option value="saldo_inicial">Saldo inicial conciliado</option><option value="ajuste_entrada">Ajuste de entrada</option><option value="ajuste_salida">Ajuste de salida</option></select></label><label>Cantidad (kg)<input name="quantity_kg" type="number" min="0.01" step="0.01" required/></label><label>Fecha<input name="occurred_on" type="date" required/></label><label>Referencia de respaldo<input name="reference" minLength={3} maxLength={80} required placeholder="Acta de conteo o documento"/></label><label className="field-full">Motivo detallado<textarea name="reason" minLength={10} maxLength={500} required rows={2}/></label><div className="field-full form-footer"><SubmitButton className="button button-primary">Registrar movimiento</SubmitButton></div></form></details>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">CATÁLOGO DE LAS PLANILLAS</div><h2>Existencias por material</h2></div></div><form action="/materiales-stock" method="GET" className="filters"><label>Ver detalle<select name="material" defaultValue={selected?.id??""}><option value="">Todos</option>{catalog.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button className="button button-outline" type="submit">Filtrar</button></form><div className="table-wrap"><table className="data-table"><thead><tr><th>Material</th><th>Saldo disponible</th><th>Movimientos</th></tr></thead><tbody>{catalog.filter(m=>!selected||selected.id===m.id).map(m=><tr key={m.id}><td>{m.name}</td><td><strong>{kg(m.quantity_kg)}</strong></td><td><Link className="text-link" href={`/materiales-stock?material=${m.id}`}>Ver historial</Link></td></tr>)}</tbody></table></div></section>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">TRAZABILIDAD</div><h2>Movimientos recientes</h2></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Material / origen</th><th>Movimiento</th><th>Peso</th><th>Registró</th></tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{date(m.occurred_on)}</td><td>{m.material_name}<span className="table-sub">{m.reference} · {m.reason}</span></td><td>{kinds[m.kind]??m.kind}</td><td><strong>{Number(m.delta_kg)>0?"+":""}{kg(m.delta_kg)}</strong></td><td>{m.actor_name}</td></tr>)}</tbody></table>{!movements.length&&<p className="muted">Aún no hay movimientos confirmados.</p>}</div></section>
  </>;
}
