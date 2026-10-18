import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { ArrowLeft,ArrowRight,ClipboardList,Route,ShieldAlert,Wrench } from "lucide-react";
import { canManage,requireActor } from "@/lib/auth";
import { AssetLogError,getAssetLog } from "@/lib/asset-log";
import { addAssetEquipmentAction,recordAssetMaintenanceAction,removeAssetEquipmentAction,
  reportAssetIncidentAction,resolveAssetIncidentAction,updateAssetEquipmentAction,addAssetDocumentAction } from "@/app/asset-log-actions";
import { Notice,chileDate } from "@/components/UI";
import { SubmitButton } from "@/components/Transition";

const kindName:Record<string,string>={camion:"Camión",rampa:"Rampla",equipo:"Equipo"};
const conditionName:Record<string,string>={operativo:"Operativo",por_revisar:"Por revisar",fuera_servicio:"Fuera de servicio"};
const count=(value:string|number|null)=>value===null?"—":Number(value).toLocaleString("es-CL",{maximumFractionDigits:2});
const inputDate=(value:Date|string|null)=>value?value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10):"";
const date=(value:Date|string|null,dateOnly=false)=>value?chileDate(dateOnly?`${inputDate(value)}T12:00:00Z`:value,false):"—";

export default async function AssetDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string}>}) {
  const actor=await requireActor();
  if(!canManage(actor)) redirect("/");
  const {id}=await params;
  let detail;
  try { detail=await getAssetLog(actor,id); } catch(error) { if(error instanceof AssetLogError) notFound();throw error; }
  const {asset,routes,faults,orders,plans,equipment,documents}=detail;
  const openFaults=faults.filter((fault)=>fault.status==="abierta");
  const alerts=equipment.filter((item)=>item.warning);
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const query=await searchParams;
  return <>
    <Link className="back-link" href="/flota"><ArrowLeft size={16}/> Flota y averías</Link>
    <div className="page-title-row"><div><div className="eyebrow">FICHA OPERACIONAL · {kindName[asset.kind]??asset.kind}</div><h1>{asset.label}</h1>
      <p className="page-intro">{asset.code}{asset.plate?` · Patente ${asset.plate}`:""}{asset.brand?` · ${asset.brand}`:""}{asset.model?` ${asset.model}`:""}</p></div>
      <span className={`fleet-state ${asset.available?"available":"stopped"}`}>{asset.available?"Disponible":"Detenido"}</span></div>
    <Notice error={query.error} ok={query.ok}/>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">CARPETA DEL VEHÍCULO</div><h2>Documentación PDF</h2></div><span className="count-pill">{documents.length}</span></div>
      <p className="helper-text">Adjunte varios certificados, permisos, revisión técnica, SOAP o resoluciones por camión o rampla. El nombre original del PDF identifica cada documento; máximo 4 MB por archivo.</p>
      <form action={addAssetDocumentAction} className="form-grid supply-inline" encType="multipart/form-data"><input type="hidden" name="asset_id" value={id}/><label>Documento PDF<input type="file" name="file" accept="application/pdf,.pdf" required/></label><div className="field-full form-footer"><SubmitButton className="button button-outline">Agregar documento</SubmitButton></div></form>
      {documents.length?<ul className="record-list">{documents.map(doc=><li key={doc.id}><Link href={`/api/flota-documentos/${doc.id}`}>{doc.original_filename}</Link><small>{(doc.size_bytes/1024).toLocaleString("es-CL",{maximumFractionDigits:0})} KB · {doc.created_by_name} · {chileDate(doc.created_at)}</small></li>)}</ul>:<p className="muted">Sin documentos cargados para este activo.</p>}
    </section>
    <div className="fleet-stats"><div><strong>{openFaults.length}</strong><span>Averías abiertas</span></div><div><strong>{plans.length}</strong><span>Pautas activas</span></div><div><strong>{alerts.length}</strong><span>Elementos por revisar</span></div><div><strong>{asset.reading_unit==="sin"?"—":count(asset.current_reading)}</strong><span>Lectura actual {asset.reading_unit==="sin"?"":asset.reading_unit}</span></div></div>

    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">RUTEO DE LA PLANILLA</div><h2><Route size={19}/> Viajes y guías vinculados</h2></div><span className="count-pill">{routes.length}</span></div>
      <p className="helper-text">Se muestran las solicitudes asignadas a este camión, rampla o equipo y las guías de material que coinciden con su patente registrada. Los registros históricos del Excel aún no están cargados.</p>
      {routes.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha / guía</th><th>Movimiento</th><th>Ruta</th><th>Cliente / contraparte</th><th>Peso neto</th><th aria-label="Abrir"/></tr></thead><tbody>{routes.map((route)=><tr key={`${route.source}-${route.id}`}>
        <td><strong>{date(route.event_at)}</strong><span className="table-sub">{route.guide_number?`Guía ${route.guide_number}`:"Sin guía registrada"}</span></td>
        <td className="capitalize">{route.movement_type}<span className="table-sub">{route.source==="guia"?"Control de Guía":route.status}</span></td>
        <td>{route.origin} → {route.destination}</td><td>{route.counterparty}</td><td>{count(route.net_kg)}{route.net_kg!==null?" kg":""}</td>
        <td><Link href={route.href} className="table-arrow" aria-label="Ver registro"><ArrowRight size={17}/></Link></td></tr>)}</tbody></table></div>
        :<p className="muted">Aún no hay rutas vinculadas a este activo.</p>}
    </section>

    <div className="supply-columns"><section className="section-card"><div className="section-heading"><div><div className="eyebrow">AVERÍAS · X / OK</div><h2><ShieldAlert size={19}/> Reporte y resolución</h2></div></div>
      <p className="helper-text">Una avería abierta detiene el activo para nuevas asignaciones. Puede indicar la fecha del hallazgo si fue anterior al registro.</p>
      <form action={reportAssetIncidentAction} className="form-stack compact"><input type="hidden" name="asset_id" value={id}/>
        <div className="two-fields"><label>Fecha del hallazgo<input name="observed_on" type="date" defaultValue={today}/></label><label>Criticidad<select name="severity" defaultValue="media"><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label></div>
        <label>Descripción de la avería<textarea name="description" required minLength={5} maxLength={1000} rows={3}/></label><SubmitButton className="button button-outline">Registrar avería</SubmitButton></form>
    </section><section className="section-card"><div className="section-heading"><div><div className="eyebrow">MANTENIMIENTO</div><h2><Wrench size={19}/> Registrar trabajo ya realizado</h2></div></div>
      <p className="helper-text">Para transcribir una mantención anterior de la planilla. Esta anotación conserva su fecha y lectura histórica, sin modificar el odómetro, el stock ni las pautas vigentes.</p>
      <form action={recordAssetMaintenanceAction} className="form-stack compact"><input type="hidden" name="asset_id" value={id}/>
        <div className="two-fields"><label>Fecha realizada<input name="performed_on" type="date" max={today} required/></label><label>Tipo<select name="kind" defaultValue="preventiva"><option value="preventiva">Preventiva</option><option value="correctiva">Correctiva</option><option value="neumaticos">Neumáticos</option></select></label></div>
        <label>Trabajo realizado<input name="title" minLength={5} maxLength={160} required placeholder="Ej. Regulación de frenos"/></label>
        <label>Detalle<textarea name="description" maxLength={1500} rows={2}/></label>
        {asset.reading_unit!=="sin"&&<label>Lectura de esa fecha ({asset.reading_unit})<input name="reading" type="number" min="0" step="0.01"/></label>}
        <SubmitButton className="button button-outline">Guardar en historial</SubmitButton></form>
    </section></div>

    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">AVERÍAS DEL ACTIVO</div><h2>Historial y estado</h2></div><span className="count-pill">{faults.length}</span></div>
      {faults.length?<div className="incident-grid">{faults.map((fault)=><article className="incident-card" key={fault.id}><div className="incident-head"><div><strong>{fault.description}</strong><span>{date(fault.observed_on??fault.reported_at,!!fault.observed_on)} · {fault.reported_by_name}{fault.source_service_id&&<> · <Link href={`/solicitudes/${fault.source_service_id}`}>Ver checklist</Link></>}</span></div><span className={fault.status==="abierta"?"inventory-low":"inventory-good"}>{fault.status==="abierta"?"X · Abierta":"OK · Resuelta"}</span></div>
        {fault.status==="abierta"?<form action={resolveAssetIncidentAction} className="incident-resolve"><input type="hidden" name="asset_id" value={id}/><input type="hidden" name="incident_id" value={fault.id}/><label>Solución aplicada<textarea name="resolution" required minLength={5} maxLength={1000} rows={2}/></label><SubmitButton className="button button-outline">Resolver avería</SubmitButton></form>
          :<p className="helper-text">{fault.resolution} · resuelta {date(fault.resolved_at)}</p>}</article>)}</div>
        :<p className="muted">Sin averías registradas.</p>}
    </section>

    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">BITÁCORA DE MANTENCIONES</div><h2>Trabajos y pautas</h2></div><Link href="/mantenimiento" className="text-link">Abrir Mantenimiento <ArrowRight size={15}/></Link></div>
      {plans.length>0&&<div className="table-wrap"><table className="data-table"><thead><tr><th>Pauta vigente</th><th>Próximo vencimiento</th></tr></thead><tbody>{plans.map((plan)=><tr key={plan.id}><td><strong>{plan.title}</strong></td><td>{plan.frequency_kind==="fecha"?date(plan.next_due_date,true):`${count(plan.next_due_reading)} ${plan.reading_unit} · actual ${count(plan.current_reading)}`}</td></tr>)}</tbody></table></div>}
      {orders.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha realizada</th><th>Trabajo</th><th>Tipo / estado</th><th>Lectura</th><th aria-label="Abrir"/></tr></thead><tbody>{orders.map((order)=><tr key={order.id}><td>{date(order.performed_on??order.closed_at??order.created_at,!!order.performed_on)}</td><td><Link className="table-main" href={`/mantenimiento/${order.id}`}>{order.title}</Link>{order.history_only&&<span className="table-sub">Registro histórico</span>}</td><td className="capitalize">{order.kind} · {order.status}</td><td>{count(order.reading_at_close)}{order.reading_at_close!==null?` ${asset.reading_unit}`:""}</td><td><Link href={`/mantenimiento/${order.id}`} className="table-arrow" aria-label="Ver orden"><ArrowRight size={17}/></Link></td></tr>)}</tbody></table></div>
        :<p className="muted">Sin mantenciones registradas para este activo.</p>}
    </section>

    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">INVENTARIO POR CAMIÓN Y RAMPLA</div><h2><ClipboardList size={19}/> Elementos asignados</h2></div><span className="count-pill">{equipment.length}</span></div>
      <p className="helper-text">Registre cantidad, condición y vencimiento de los elementos vigentes. Se destacan los dañados, pendientes de revisión y los que vencen dentro de 30 días.</p>
      <form action={addAssetEquipmentAction} className="form-grid supply-inline"><input type="hidden" name="asset_id" value={id}/>
        <label>Elemento<input name="name" required minLength={2} maxLength={120} placeholder="Ej. Extintor, eslinga, cuñas"/></label>
        <label>Cantidad<input name="quantity" type="number" required min="0.01" step="0.01"/></label>
        <label>Condición<select name="condition" defaultValue="operativo"><option value="operativo">Operativo</option><option value="por_revisar">Por revisar</option><option value="fuera_servicio">Fuera de servicio</option></select></label>
        <label>Vencimiento (si aplica)<input name="expires_on" type="date"/></label>
        <label className="field-full">Observación<input name="note" maxLength={500} placeholder="Ej. Carpa rota o extintor pendiente de inspección"/></label>
        <div className="field-full form-footer"><SubmitButton className="button button-outline">Agregar elemento</SubmitButton></div>
      </form>
      {equipment.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Elemento</th><th>Cantidad</th><th>Condición</th><th>Vencimiento</th><th>Actualizar</th></tr></thead><tbody>{equipment.map((item)=><tr key={item.id}><td><strong>{item.name}</strong>{item.note&&<span className="table-sub">{item.note}</span>}</td><td>{count(item.quantity)}</td><td><span className={item.warning?"inventory-low":"inventory-good"}>{conditionName[item.condition]??item.condition}{item.warning&&item.condition==="operativo"?" · vence pronto":""}</span></td><td>{date(item.expires_on,true)}</td><td><details className="asset-item-edit"><summary>Editar</summary><form action={updateAssetEquipmentAction} className="form-stack compact"><input type="hidden" name="asset_id" value={id}/><input type="hidden" name="item_id" value={item.id}/>
          <label>Cantidad<input name="quantity" type="number" min="0.01" step="0.01" required defaultValue={item.quantity}/></label>
          <label>Condición<select name="condition" defaultValue={item.condition}><option value="operativo">Operativo</option><option value="por_revisar">Por revisar</option><option value="fuera_servicio">Fuera de servicio</option></select></label>
          <label>Vencimiento<input name="expires_on" type="date" defaultValue={inputDate(item.expires_on)}/></label>
          <label>Observación<input name="note" maxLength={500} defaultValue={item.note??""}/></label><SubmitButton className="button button-outline">Guardar cambios</SubmitButton></form>
          <form action={removeAssetEquipmentAction}><input type="hidden" name="asset_id" value={id}/><input type="hidden" name="item_id" value={item.id}/><SubmitButton className="button button-outline">Quitar del activo</SubmitButton></form></details></td></tr>)}</tbody></table></div>
        :<p className="muted">Sin elementos registrados para este activo.</p>}
    </section>
  </>;
}
