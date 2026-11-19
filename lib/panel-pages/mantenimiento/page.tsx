import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge, Wrench, CalendarClock, CircleAlert, Disc3, ArrowRight } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { listChecklistFaults, listMaintenance } from "@/lib/continuity";
import {maintenanceContext,maintenanceHref,type MaintenanceContext,type MaintenancePageKey} from "@/lib/maintenance-form-state";
import {lastRecordPage,recordPage,recordsPerPage} from "@/lib/record-pagination";
import { Notice, chileDate } from "@/components/UI";
import {MaintenanceForm} from "@/components/MaintenanceForms";

const amount=(value:number|string)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:2});
const orderStatus:Record<string,string>={abierta:"Abierta",en_trabajo:"En trabajo",cerrada:"Cerrada",cancelada:"Cancelada"};
const due=(value:Date|string|null)=>value?chileDate(`${value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10)}T12:00:00Z`,false):"";

type Query=MaintenanceContext&{error?:string;ok?:string;origen?:string;edicion?:string};
function Pages({context,name,page,total,anchor}:{context:MaintenanceContext;name:MaintenancePageKey;page:number;total:number;anchor:string}){
  const last=lastRecordPage(total);if(last<=1)return null;
  const href=(next:number)=>maintenanceHref({...context,[name]:String(next)},anchor);
  return <nav className="records-pagination" aria-label={`Páginas de ${{pagina_planes:"planes preventivos",pagina_ordenes:"órdenes de trabajo",pagina_averias:"averías",pagina_neumaticos:"neumáticos",pagina:"averías abiertas"}[name]}`}><span>{page>1&&<Link className="button button-outline" href={href(page-1)}>Anterior</Link>}</span><span>Página {page} de {last} · {total} registros</span><span>{page<last&&<Link className="button button-outline" href={href(page+1)}>Siguiente</Link>}</span></nav>;
}
export default async function Maintenance({searchParams}:{searchParams:Promise<Query>}) {
  const actor=await requireActor();
  if (!canManage(actor)) redirect("/");
  const query=await searchParams;
  const company=query.empresa==="rerchar"||query.empresa==="e_y_j"?query.empresa:"rerchar";
  const faultsView=query.averias==="abiertas";
  const requested=Number(query.pagina),page=Number.isSafeInteger(requested)&&requested>=1&&requested<=10_000?requested:1;
  const [{assets,plans,orders,incidents,tires,warehouses},faults]=await Promise.all([
    listMaintenance(actor),faultsView?listChecklistFaults(actor,company,page):Promise.resolve(null),
  ]);
  const context=maintenanceContext(query);
  const collections={pagina_planes:plans,pagina_ordenes:orders,pagina_averias:incidents,pagina_neumaticos:tires};
  const pages=Object.fromEntries(Object.entries(collections).map(([key,rows])=>[key,Math.min(recordPage(context[key as MaintenancePageKey]),lastRecordPage(rows.length))])) as Record<keyof typeof collections,number>;
  const adjusted={...context,...Object.fromEntries(Object.entries(pages).map(([key,value])=>[key,String(value)])),...(faults?{pagina:String(faults.page)}:{})};
  if(Object.entries(pages).some(([key,value])=>recordPage(context[key as MaintenancePageKey])!==value)||faults&&page!==faults.page)redirect(maintenanceHref(adjusted,"",{ok:query.ok,error:query.error}));
  const part=<T,>(rows:T[],key:keyof typeof collections)=>rows.slice((pages[key]-1)*recordsPerPage,pages[key]*recordsPerPage);
  const shownPlans=part(plans,"pagina_planes"),shownOrders=part(orders,"pagina_ordenes"),shownIncidents=part(incidents,"pagina_averias"),shownTires=part(tires,"pagina_neumaticos");
  const assetKey=assets.map(x=>[x.id,x.brand,x.model,x.model_year,x.reading_unit,x.current_reading,x.has_readings,x.has_reading_plans,x.reading_version].join(":")).join("|");
  const faultsHref=(next:number)=>maintenanceHref({...context,empresa:company,averias:"abiertas",pagina:String(next)},"averias-checklist");
  const open=orders.filter((order)=>["abierta","en_trabajo"].includes(order.status));
  const hourAssets=assets.filter((asset)=>asset.kind==="equipo"&&asset.reading_unit==="horas"&&Number(asset.current_reading)>0);
  return <div className="maintenance-workspace">
    <div className="page-title-row"><div><div className="eyebrow">CONTINUIDAD OPERACIONAL</div><h1>Mantenimiento y neumáticos</h1><p className="page-intro">Lecturas de activos, planes preventivos y órdenes ligadas a averías y repuestos.</p></div><span className="title-icon"><Wrench size={23}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <div className="supply-summary"><div><strong>{open.length}</strong><span>Órdenes abiertas</span></div><div><strong>{plans.filter((plan)=>plan.warning).length}</strong><span>Planes por vencer</span></div><div><strong>{incidents.length}</strong><span>Averías sin orden</span></div><Link className="button button-outline" href={maintenanceHref(context,"",{},"fleet")}>Abrir flota <ArrowRight size={16}/></Link></div>
    {faults&&<section className="section-card maintenance-section" id="averias-checklist"><div className="section-heading"><div><div className="eyebrow">CHECKLIST · {company==="rerchar"?"RERCHAR":"E Y J"}</div><h2><CircleAlert size={19}/> Averías abiertas</h2></div><span className="count-pill">{faults.total}</span></div>
      <p className="helper-text">Cada avería abierta permanece aquí hasta que se cierre la orden correctiva. Los casos con orden en trabajo se abren desde su folio.</p>
      {faults.items.length?<div className="incident-grid">{faults.items.map(fault=><article className="incident-card" key={fault.id}><div className="incident-head"><div><strong>{fault.asset_label} · {fault.client_name}</strong><span>{fault.description}</span><Link href={`/solicitudes/${fault.source_service_id}`} className="text-link">Ver servicio, checklist y fotos →</Link></div></div>
        {fault.order_id?<Link className="button button-outline" href={maintenanceHref(context,"",{},fault.order_id)}>Abrir OT-{String(fault.order_folio).padStart(5,"0")} · {fault.order_status==="en_trabajo"?"En trabajo":"Abierta"} <ArrowRight size={16}/></Link>
          :<div id={`ot-${fault.id}`} className="maintenance-section"><MaintenanceForm kind="order" context={context} sourceId={fault.id} quick buttonLabel="Crear orden correctiva" defaults={{asset_id:fault.asset_id,plan_id:"",incident_id:fault.id,kind:"correctiva",title:`Reparar ${fault.asset_label}`,description:fault.description,scheduled_for:"",blocks_asset:"on"}}/></div>}</article>)}</div>
        :<p className="muted">No hay averías abiertas para esta empresa.</p>}
      {(page>1||page*100<faults.total)&&<nav className="records-pagination" aria-label="Páginas de averías abiertas"><span>{page>1&&<Link className="button button-outline" href={faultsHref(page-1)}>Anterior</Link>}</span><span>Página {faults.page} de {faults.totalPages} · {faults.total} averías abiertas</span><span>{page*100<faults.total&&<Link className="button button-outline" href={faultsHref(page+1)}>Siguiente</Link>}</span></nav>}
    </section>}
    <section className="section-card maintenance-section" id="pautas-horometro"><div className="section-heading"><div><div className="eyebrow">PLANILLA DE CAMIONES Y RAMPLAS · GARRAS</div><h2><Gauge size={19}/> Pautas por horómetro</h2></div></div>
      <p className="helper-text">Active en un equipo las tareas documentadas para su modelo. Registre primero el horómetro actual y confirme el próximo vencimiento; las lecturas de la planilla no se importan como lecturas vigentes.</p>
      <MaintenanceForm key={`hour:${assetKey}:${plans.length}`} kind="hour_plan" context={context} assets={assets}/>{!hourAssets.length&&<p className="helper-text">En «Actualizar activo», seleccione el equipo y configure la unidad «Horas». Después registre una lectura vigente.</p>}
    </section>
    <section className="section-card maintenance-section" id="planes-preventivos"><div className="section-heading"><div><div className="eyebrow">PRÓXIMAS TAREAS</div><h2><CalendarClock size={19}/> Planes preventivos</h2></div><span className="count-pill">{plans.length}</span></div>
      {plans.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Activo / pauta</th><th>Próxima ejecución</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{shownPlans.map((plan)=><tr key={plan.id} id={`ot-${plan.id}`} className="maintenance-section" data-plan-id={plan.id}><td><strong>{plan.title}</strong><span className="table-sub">{plan.asset_code} · {plan.asset_label}</span>{plan.procedure&&<details className="maintenance-procedure"><summary>Ver tareas y repuestos</summary><p>{plan.procedure}</p></details>}</td><td>{plan.frequency_kind==="fecha"?due(plan.next_due_date):`${amount(plan.next_due_reading!)} ${plan.reading_unit} · actual ${amount(plan.current_reading)}`}</td><td>{plan.warning?<span className="inventory-low">Por revisar</span>:<span className="inventory-good">En plazo</span>}</td><td>{plan.order_id?<Link className="button button-outline" href={maintenanceHref(context,"",{},plan.order_id)}>Abrir OT-{String(plan.order_folio).padStart(5,"0")} · {plan.order_status==="en_trabajo"?"En trabajo":"Abierta"}</Link>:<MaintenanceForm kind="order" context={context} sourceId={plan.id} quick buttonLabel="Crear OT" defaults={{asset_id:plan.asset_id,plan_id:plan.id,incident_id:"",kind:"preventiva",title:plan.title,description:"",scheduled_for:""}}/>}</td></tr>)}</tbody></table></div>:<p className="muted">Agregue un plan para cada activo que requiere mantenciones periódicas.</p>}<Pages context={context} name="pagina_planes" page={pages.pagina_planes} total={plans.length} anchor="planes-preventivos"/>
    </section>
    {!faultsView&&incidents.length>0&&<section className="section-card maintenance-section" id="averias-diagnostico"><div className="section-heading"><div><div className="eyebrow">CORRECTIVOS</div><h2><CircleAlert size={19}/> Averías que requieren diagnóstico</h2></div></div>
      <div className="incident-grid">{shownIncidents.map((incident)=><article className="incident-card maintenance-section" key={incident.id} id={`ot-${incident.id}`} data-incident-id={incident.id}><div className="incident-head"><div><strong>{incident.asset_label}</strong><span>{incident.description}</span>{incident.source_service_id&&<Link href={`/solicitudes/${incident.source_service_id}`} className="text-link">Ver servicio, checklist y fotos →</Link>}</div></div><MaintenanceForm kind="order" context={context} sourceId={incident.id} quick buttonLabel="Crear orden correctiva" defaults={{asset_id:incident.asset_id,plan_id:"",incident_id:incident.id,kind:"correctiva",title:`Reparar ${incident.asset_label}`,description:incident.description,scheduled_for:"",blocks_asset:"on"}}/></article>)}</div><Pages context={context} name="pagina_averias" page={pages.pagina_averias} total={incidents.length} anchor="averias-diagnostico"/>
    </section>}
    <section className="section-card maintenance-section" id="ordenes-trabajo"><div className="section-heading"><div><div className="eyebrow">ÓRDENES DE TRABAJO</div><h2>Seguimiento</h2></div><span className="count-pill">{orders.length}</span></div>
      {orders.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Orden / activo</th><th>Tipo</th><th>Estado</th><th>Creada</th><th aria-label="Abrir"/></tr></thead><tbody>{shownOrders.map((order)=><tr key={order.id} data-order-id={order.id}><td><Link className="table-main" href={maintenanceHref(context,"",{},order.id)}>OT-{String(order.folio).padStart(5,"0")} · {order.title}</Link><span className="table-sub">{order.asset_code} · {order.asset_label}</span></td><td className="capitalize">{order.kind}</td><td><span className={`badge supply-status-${order.status}`}>{orderStatus[order.status]}</span></td><td>{chileDate(order.created_at)}</td><td><Link href={maintenanceHref(context,"",{},order.id)} className="table-arrow" aria-label={`Abrir OT-${order.folio}`}><ArrowRight size={18}/></Link></td></tr>)}</tbody></table></div>:<p className="muted">Aún no se han registrado órdenes de trabajo.</p>}<Pages context={context} name="pagina_ordenes" page={pages.pagina_ordenes} total={orders.length} anchor="ordenes-trabajo"/>
    </section>
    <div className="supply-columns">
      <section className="section-card maintenance-section" id="crear-pauta"><div className="section-heading"><div><div className="eyebrow">PLANIFICACIÓN</div><h2>Crear pauta preventiva</h2></div></div><MaintenanceForm key={`plan:${assetKey}:${plans.length}`} kind="plan" context={context} assets={assets}/></section>
      <section className="section-card maintenance-section" id="crear-orden"><div className="section-heading"><div><div className="eyebrow">TRABAJO NO PROGRAMADO</div><h2>Crear orden manual</h2></div></div><MaintenanceForm key={`manual:${assetKey}:${orders.length}`} kind="order" context={context} assets={assets}/></section>
      <section className="section-card maintenance-section" id="ficha-activo"><div className="section-heading"><div><div className="eyebrow">FICHA TÉCNICA</div><h2>Actualizar activo</h2></div></div><MaintenanceForm key={`asset:${assetKey}`} kind="asset" context={context} assets={assets}/></section>
      <section className="section-card maintenance-section" id="lecturas"><div className="section-heading"><div><div className="eyebrow">ODÓMETRO Y HORÓMETRO</div><h2><Gauge size={19}/> Registrar lectura</h2></div></div><MaintenanceForm key={`reading:${assetKey}`} kind="reading" context={context} assets={assets}/></section>
    </div>
    <section className="section-card maintenance-section" id="neumaticos"><div className="section-heading"><div><div className="eyebrow">NEUMÁTICOS</div><h2><Disc3 size={19}/> Posiciones e historial</h2></div><span className="count-pill">{tires.length}</span></div>
      <MaintenanceForm key={`tire:${tires.length}`} kind="tire" context={context} warehouses={warehouses}/>
      {tires.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Código / medida</th><th>Estado</th><th>Activo y posición</th><th>Movimiento</th></tr></thead><tbody>{shownTires.map((tire)=><tr key={tire.id} id={`neumatico-${tire.id}`} className="maintenance-section" data-tire-id={tire.id}><td><strong>{tire.code}</strong><span className="table-sub">{tire.brand??""} {tire.size??""}</span></td><td className="capitalize">{tire.status}</td><td>{tire.asset_label??(tire.warehouse_name?`Bodega ${tire.warehouse_name}`:"Sin bodega asignada")}<span className="table-sub">{tire.position??""}</span></td><td><details className="maintenance-tire-control" open={query.origen==="move_tire"&&query.edicion===tire.id}><summary>{tire.status==="instalado"?"Retirar o rotar":"Instalar neumático"}</summary><MaintenanceForm key={`${tire.id}:${tire.status}:${tire.asset_id}:${tire.position}:${tire.warehouse_id}`} kind="move_tire" context={context} sourceId={tire.id} assets={assets} warehouses={warehouses} tireStatus={tire.status} defaults={{tire_id:tire.id,asset_id:tire.asset_id??"",position:tire.position??"",warehouse_id:tire.warehouse_id??""}}/></details></td></tr>)}</tbody></table></div>:<p className="muted">Registre los neumáticos para iniciar el historial de posiciones.</p>}<Pages context={context} name="pagina_neumaticos" page={pages.pagina_neumaticos} total={tires.length} anchor="neumaticos"/>
    </section>
  </div>;
}
