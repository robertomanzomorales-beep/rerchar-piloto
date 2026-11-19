import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { ArrowLeft, Wrench, BookmarkCheck, CheckCircle2 } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWorkOrder, ContinuityError } from "@/lib/continuity";
import {maintenanceContext,maintenanceHref,type MaintenanceContext} from "@/lib/maintenance-form-state";
import {MaintenanceForm} from "@/components/MaintenanceForms";
import { Notice, chileDate } from "@/components/UI";

const money=(value:string)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:0});
const localDate=(value:Date|string|null)=>value?chileDate(`${value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10)}T12:00:00Z`,false):"Sin fecha";
export default async function WorkOrderDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<MaintenanceContext&{error?:string;ok?:string;origen?:string}>}) {
  const actor=await requireActor();
  if (!canManage(actor)) redirect("/");
  const {id}=await params;
  let detail;
  try { detail=await getWorkOrder(actor,id); } catch(error) { if(error instanceof ContinuityError) notFound(); throw error; }
  const {order,reservations,history}=detail;
  const [items,warehouses,query]=await Promise.all([
    db.query<{id:string;code:string;name:string;unit:string}>("SELECT id,code,name,unit FROM stock_items WHERE active=true ORDER BY name"),
    db.query<{id:string;code:string;name:string}>("SELECT id,code,name FROM warehouses WHERE active=true ORDER BY name"),
    searchParams,
  ]);
  const context=maintenanceContext(query);
  const version=[order.status,order.asset_current_reading,reservations.map(x=>`${x.id}:${x.status}`).join("|")].join(":");
  return <>
    <Link className="back-link" href={maintenanceHref(context,context.averias==="abiertas"?"averias-checklist":"ordenes-trabajo")}><ArrowLeft size={16}/> Mantenimiento</Link>
    <div className="page-title-row"><div><div className="eyebrow">ORDEN DE TRABAJO</div><h1>OT-{String(order.folio).padStart(5,"0")}</h1><p className="page-intro">{order.title} · {order.asset_code} / {order.asset_label}</p></div><span className={`badge supply-status-${order.status}`}>{order.status==="en_trabajo"?"En trabajo":order.status}</span></div>
    <Notice error={query.error} ok={query.ok}/><p className="helper-text"><Link href={`/flota/${order.asset_id}`}>Ver rutas, averías e inventario del activo →</Link></p>{order.history_only&&<p className="helper-text">Registro de una mantención ya realizada el {localDate(order.performed_on)}. El alta documental no modifica la lectura actual ni la programación de pautas.</p>}
    {order.source_service_id&&<p className="helper-text">Hallazgo registrado en el checklist del <Link href={`/solicitudes/${order.source_service_id}`}>servicio de origen: ver fotos y documentación →</Link></p>}
    <div className="supply-columns"><div>
      <section className="section-card maintenance-section" id="trabajo-registrado"><div className="section-heading"><div><div className="eyebrow">ALCANCE</div><h2><Wrench size={19}/> Trabajo registrado</h2></div></div><div className="facts-grid"><div className="fact"><span>Tipo</span><strong className="capitalize">{order.kind}</strong></div><div className="fact"><span>Planificada para</span><strong>{order.scheduled_for?chileDate(`${order.scheduled_for instanceof Date?order.scheduled_for.toISOString().slice(0,10):String(order.scheduled_for).slice(0,10)}T12:00:00Z`,false):"Sin fecha"}</strong></div><div className="fact"><span>Solicitada por</span><strong>{order.created_by_name}</strong></div><div className="fact"><span>Creada</span><strong>{chileDate(order.created_at)}</strong></div><div className="fact"><span>Vinculada a</span><strong>{order.incident_id?"Avería":"Plan o trabajo manual"}</strong></div><div className="fact"><span>Inmovilización</span><strong>{order.blocks_asset?"Al iniciar":"Sin bloqueo por esta orden"}</strong></div></div>{order.description&&<div className="note-block"><span>Descripción</span><p>{order.description}</p></div>}</section>
      {order.status==="abierta"&&<section className="section-card maintenance-section" id="iniciar-orden"><div className="section-heading"><div><div className="eyebrow">EJECUCIÓN</div><h2>Iniciar trabajo</h2></div></div><p className="helper-text">Si la orden requiere inmovilizar el activo, quedará fuera de nuevas asignaciones al iniciar.</p><MaintenanceForm kind="start" context={context} orderId={id}/></section>}
      {["abierta","en_trabajo"].includes(order.status)&&<section className="section-card maintenance-section" id="repuestos-orden"><div className="section-heading"><div><div className="eyebrow">REPUESTOS</div><h2><BookmarkCheck size={19}/> Reservar desde bodega</h2></div></div><p className="helper-text">Al cerrar la orden se consumirán automáticamente las reservas activas; el Kardex mostrará ambos movimientos.</p><MaintenanceForm key={`reserve:${version}`} kind="reserve" context={context} orderId={id} items={items.map(x=>({id:x.id,name:`${x.code} · ${x.name} (${x.unit})`}))} warehouses={warehouses}/></section>}
      {order.status==="en_trabajo"&&<section className="section-card maintenance-section" id="cierre-orden"><div className="section-heading"><div><div className="eyebrow">CIERRE</div><h2><CheckCircle2 size={19}/> Resultado y costos</h2></div></div><MaintenanceForm key={`close:${version}`} kind="close" context={context} orderId={id} readingUnit={order.asset_reading_unit} currentReading={order.asset_current_reading} requiresReading={order.requires_close_reading}/></section>}
      {order.status==="cerrada"&&<section className="section-card completion-card maintenance-section" id="cierre-orden"><h2><CheckCircle2 size={19}/> Trabajo cerrado</h2><p>{order.resolution}</p><div className="facts-grid"><div className="fact"><span>Mano de obra</span><strong>${money(order.labor_cost)}</strong></div><div className="fact"><span>Repuestos / otros</span><strong>${money(order.parts_cost)}</strong></div><div className="fact"><span>Costo total registrado</span><strong>${money(String(Number(order.labor_cost)+Number(order.parts_cost)))}</strong></div><div className="fact"><span>{order.history_only?"Registrado en el sistema":"Fecha y responsable"}</span><strong>{chileDate(order.closed_at)} · {order.closed_by_name}</strong></div>{order.performed_on&&<div className="fact"><span>Fecha realizada</span><strong>{localDate(order.performed_on)}</strong></div>}</div></section>}
      {order.status==="abierta"&&<details className="cancel-control section-card maintenance-section" id="cancelar-orden" open={query.origen==="cancel"}><summary>Cancelar esta orden</summary><MaintenanceForm kind="cancel" context={context} orderId={id}/></details>}
    </div><aside><section className="section-card side-card"><div className="eyebrow">BODEGA</div><h2>Repuestos vinculados</h2>{reservations.length?<ul className="record-list">{reservations.map((reservation)=><li key={reservation.id}><strong>{reservation.item_name}</strong><small>{Number(reservation.quantity).toLocaleString("es-CL")} {reservation.unit} · {reservation.warehouse_name} · {reservation.status}</small></li>)}</ul>:<p className="muted">Esta orden no tiene repuestos reservados.</p>}<Link href="/inventario" className="back-link">Ver Kardex <ArrowLeft size={14}/></Link></section><section className="section-card side-card"><div className="eyebrow">AUDITORÍA</div><h2>Movimientos de la orden</h2><ol className="timeline">{history.map((event)=><li key={event.id}><span className="timeline-marker"/><strong>{event.action}</strong><small>{event.actor_name} · {chileDate(event.created_at)}</small></li>)}</ol></section></aside></div>
  </>;
}
