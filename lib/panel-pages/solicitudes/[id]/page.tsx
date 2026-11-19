import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardCheck, FileText, MapPin, PackageCheck, Truck, Weight } from "lucide-react";
import { requireActor, canManage, canPlan, canWorkService } from "@/lib/auth";
import { db } from "@/lib/db";
import { getService, PilotError } from "@/lib/pilot";
import { classifyServiceCompanyAction, completeRentalAction, createDriverForServiceAction, createExternalDriverForServiceAction, handoffServiceAction, startServiceAction } from "@/app/actions";
import {listExternalDrivers} from "@/lib/personnel";
import {companyName,serviceFolio,quoteFolio} from "@/lib/companies";
import type {Company} from "@/lib/companies";
import { Badge, Breadcrumb, chileDate, Notice } from "@/components/UI";
import { SubmitButton } from "@/components/Transition";
import ServiceEvidenceHistory from "@/components/ServiceEvidenceHistory";
import type {EvidenceQuery} from "@/lib/evidence-form-state";
import ServiceHistory from "@/components/ServiceHistory";
import {listServiceHistory,ServiceHistoryError} from "@/lib/service-history";
import ServiceDocuments from "@/components/ServiceDocuments";
import ServiceOperationForm from "@/components/ServiceOperationForm";
import {listServiceDays} from "@/lib/service-day";
import ServiceDayHistory from "@/components/ServiceDayHistory";
import type {ServiceDayQuery} from "@/lib/service-day-state";
import ServiceExtraCharges from "@/components/ServiceExtraCharges";
import type {ExtraChargeQuery} from "@/lib/extra-charge-state";
import {listServiceContainerPhotos} from "@/lib/containers";
import {uploadServiceContainerPhotoAction} from "@/app/container-actions";

function localInput(value: Date | string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  return parts.replace(" ", "T");
}
const day=(value:Date|string|null)=>value instanceof Date?value.toISOString().slice(0,10):value?String(value).slice(0,10):"";
const evidenceLabels:Record<string,string>={foto_area:"Foto del área de trabajo",foto_material:"Foto del material",checklist:"Checklist",ticket_pesaje:"Ticket de pesaje"};

export default async function ServiceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string; formulario?:string }&ExtraChargeQuery&ServiceDayQuery&EvidenceQuery> }) {
  const actor = await requireActor();
  const { id } = await params;
  let service;
  try { service = await getService(actor, id); }
  catch (error) { if (error instanceof PilotError) notFound(); throw error; }
  const paramsQuery = await searchParams;
  const [timeline, evidence, checks, assets, ramps, drivers, externalDrivers, containerMoves, wasteRecord, certificate, sourceQuotes, sourceLines, requestMaterials, checklistIncidents, dayReports, purchaseReviews, receiptEntries] = await Promise.all([
    listServiceHistory(actor,id,paramsQuery.pagina_historial),
    db.query<{ id: string; description: string; document_kind:string;storage_key:string|null;original_filename: string | null; created_at: Date;actor_name:string;size_bytes:number|null }>(
      `SELECT e.id,e.description,e.document_kind,e.storage_key,e.original_filename,e.created_at,e.size_bytes,u.name AS actor_name
       FROM service_evidence e JOIN users u ON u.id=e.created_by WHERE e.service_id=$1 ORDER BY e.created_at DESC,e.id DESC`, [id],
    ),
    db.query<{ vehicle_ok: boolean; documents_ok: boolean; containment_ok: boolean; ppe_ok: boolean; comment: string | null; completed_at: Date }>(
      "SELECT vehicle_ok,documents_ok,containment_ok,ppe_ok,comment,completed_at FROM service_checklists WHERE service_id=$1", [id],
    ),
    canPlan(actor) ? db.query<{ id: string; label: string; code: string; plate:string|null }>("SELECT id,label,code,plate FROM assets WHERE available=true AND deleted_at IS NULL AND kind='camion' ORDER BY plate NULLS LAST,label") : Promise.resolve([]),
    canPlan(actor) ? db.query<{ id: string; label: string; code: string; plate:string|null }>("SELECT id,label,code,plate FROM assets WHERE available=true AND deleted_at IS NULL AND kind='rampa' ORDER BY plate NULLS LAST,label") : Promise.resolve([]),
    canPlan(actor) ? db.query<{ id: string; name: string }>("SELECT id,name FROM users WHERE role='conductor' AND active=true ORDER BY name") : Promise.resolve([]),
    canPlan(actor) ? listExternalDrivers(actor) : Promise.resolve([]),
    db.query<{id:string;code:string;kind:string;previous_location:string|null;next_location:string;created_at:Date}>(`SELECT m.id,c.code,m.kind,m.previous_location,m.next_location,m.created_at
      FROM container_movements m JOIN containers c ON c.id=m.container_id WHERE m.service_id=$1 ORDER BY m.created_at DESC`,[id]),
    canPlan(actor) ? db.query<{id:string;status:string}>("SELECT id,status FROM waste_records WHERE service_id=$1",[id]) : Promise.resolve([]),
    actor.role!=="conductor"?db.query<{id:string}>("SELECT id FROM service_certificates WHERE service_id=$1 AND status='vigente'",[id]):Promise.resolve([]),
    service.quote_id?db.query<{id:string;folio:string;display_folio:string|null;issuer:Company;title:string;notes:string|null;client_order_reference:string|null;client_order_exception:string|null;has_order_document:boolean}>(
      "SELECT id,folio,display_folio,issuer,title,notes,client_order_reference,client_order_exception,EXISTS(SELECT 1 FROM client_quote_documents WHERE quote_id=client_quotes.id AND kind='orden_compra') AS has_order_document FROM client_quotes WHERE id=$1 AND status='aceptada'",[service.quote_id]):Promise.resolve([]),
    service.quote_id?db.query<{description:string;quantity:string;unit:string}>(
      "SELECT description,quantity,unit FROM client_quote_lines WHERE quote_id=$1 ORDER BY position",[service.quote_id]):Promise.resolve([]),
    service.request_category==="compra"?db.query<{position:number;material_id:string;material_name:string;quantity_kg:string|null;unit_price_clp:string|null;line_note:string|null}>(
      "SELECT position,material_id,material_name,quantity_kg,unit_price_clp,line_note FROM service_request_materials WHERE service_id=$1 ORDER BY position",[id]):Promise.resolve([]),
    db.query<{id:string;status:string;description:string}>(
      "SELECT id,status,description FROM fleet_incidents WHERE source_service_id=$1 ORDER BY reported_at DESC",[id]),
    listServiceDays(actor,id),
    service.request_category==="compra"&&service.status==="completada"?db.query<{material_name:string;impurity_kg:string;observations:string|null;missing_ticket_reason:string|null;reviewed_at:Date;reviewer_name:string}>(
      `SELECT r.material_name,r.impurity_kg,r.observations,r.missing_ticket_reason,r.reviewed_at,u.name AS reviewer_name
       FROM purchase_closure_reviews r JOIN users u ON u.id=r.reviewed_by WHERE r.service_id=$1`,[id]):Promise.resolve([]),
    service.operating_company==="rerchar"&&service.request_category==="compra"&&service.status==="completada"?
      db.query<{id:string}>("SELECT id FROM material_receipts WHERE service_id=$1 ORDER BY created_at DESC LIMIT 1",[id]):Promise.resolve([]),
  ]).catch(error=>{if(error instanceof ServiceHistoryError)notFound();throw error;});
  const checklist = checks[0];
  const canWork = canWorkService(actor, service);
  const rental=service.service_type==="arriendo";
  const serviceContainers=canWork&&!rental?await listServiceContainerPhotos(actor,id):[];
  const canAssign = canPlan(actor) && !rental && ["solicitada", "programada"].includes(service.status);
  const canScheduleRental=canPlan(actor)&&rental&&["solicitada","programada"].includes(service.status);
  const equipment=canScheduleRental?await db.query<{id:string;code:string;label:string}>(
    "SELECT id,code,label FROM assets WHERE kind='equipo' AND available=true AND deleted_at IS NULL ORDER BY label"):[];
  const purchase=service.request_category==="compra";
  const serviceStages:Record<string,{label:string;instruction:string;target:string}> = rental?{
    solicitada:{label:"Programar arriendo",target:"arriendo",instruction:"Operaciones confirma el período y el equipo antes de emitir la orden de arriendo."},
    programada:{label:"Respaldar ejecución",target:canManage(actor)?evidence.some(item=>Boolean(item.storage_key))?"cierre-arriendo":"documentacion":"arriendo",instruction:"Revise el período y adjunte el respaldo de ejecución. Administración cierra el arriendo sin registrar pesaje."},
    completada:{label:"Arriendo cerrado",target:"cierre",instruction:"El período y el respaldo quedaron registrados. Revise la documentación y el cierre comercial."},
  }:{
    solicitada:{label:"Planificación",target:"planificacion",instruction:"Operaciones asigna conductor, vehículo y rampla antes de programar el retiro."},
    programada:{label:"Preparación en terreno",target:canWork?"checklist":"planificacion",instruction:"El conductor revisa el checklist y prepara los respaldos. El pesaje se valida después en administración."},
    en_ruta:{label:"Entrega de terreno",target:"documentacion",instruction:purchase?"Adjunte guía de traslado y hoja de servicio; agregue el ticket si el cliente lo entregó. Luego entregue el parte a administración.":"Adjunte los documentos o fotos de la operación y entregue el parte a administración."},
    pendiente_revision:{label:"Validación administrativa",target:"revision",instruction:"Administración coteja los respaldos y registra los pesos verificados antes de cerrar. El conductor ya terminó su parte."},
    completada:{label:service.operating_company==="rerchar"?"Seguimiento documental":"Cierre comercial",target:"cierre",instruction:service.operating_company==="rerchar"?(purchase?"Registre la entrada de material y continúe con guía valorizada, factura y aviso documental.":"Continúe el seguimiento de guías y los documentos de cierre."):"Revise respaldos, valorización y facturación del servicio."},
  };
  const guideFile=evidence.find(item=>item.document_kind==="guia_traslado"&&item.storage_key);
  const sheetFile=evidence.find(item=>item.document_kind==="hoja_servicio"&&item.storage_key);
  const ticketFile=evidence.find(item=>item.document_kind==="ticket_pesaje"&&item.storage_key);
  const guideReady=Boolean(guideFile),sheetReady=Boolean(sheetFile),ticketReady=Boolean(ticketFile);
  const certificateReady=["revisado","declarado"].includes(wasteRecord[0]?.status??"");
  const todayChile=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const programmedDay=service.scheduled_for?localInput(service.scheduled_for).slice(0,10):"";
  const canReport=canPlan(actor)&&!rental&&programmedDay&&programmedDay<=todayChile&&
    ["programada","en_ruta","pendiente_revision","completada"].includes(service.status);
  return <>
    <Breadcrumb label={serviceFolio(service)}/>
    <div className="page-title-row detail-heading"><div><div className="eyebrow">SOLICITUD · {rental?"servicios / arriendo":service.service_type==="retiro"?"retiro de material":service.request_category} · {companyName(service.operating_company)}</div><h1>{serviceFolio(service)}</h1><p className="page-intro"><Link href={`/clientes/${service.client_id}`}>{service.client_name}</Link> · {service.site_name}</p></div><Badge status={service.status}/></div>
    <Notice error={paramsQuery.error} ok={paramsQuery.documento_form||paramsQuery.formulario_cargo||paramsQuery.formulario==="day"?undefined:paramsQuery.ok}/>
    {serviceStages[service.status]&&<div className="service-guidance" role="status"><span className="service-guidance-label">ETAPA ACTUAL · {rental?"ARRIENDO":"SERVICIO"}</span><strong>{serviceStages[service.status].label}</strong><span>{serviceStages[service.status].instruction}</span>{(service.status!=="en_ruta"||canWork||canManage(actor))&&<a href={`#${serviceStages[service.status].target}`}>Ir a esta etapa ↓</a>}</div>}
    {!service.operating_company&&<section className="section-card"><p role="alert">Este registro anterior necesita confirmar la empresa operadora antes de emitir documentos o vincular facturas.</p>{actor.role==="admin"&&<form action={classifyServiceCompanyAction} className="form-grid"><input type="hidden" name="id" value={id}/><label>Empresa según respaldo de la operación<select name="operating_company" required defaultValue=""><option value="">Seleccione después de revisar</option><option value="rerchar">RERCHAR Chile SpA</option><option value="e_y_j">E y J Limitada</option></select></label><div className="form-footer"><SubmitButton className="button button-outline">Confirmar empresa</SubmitButton></div></form>}</section>}
    <div className="detail-grid">
      <div className="detail-main">
        <section className="section-card"><div className="section-heading"><div><div className="eyebrow">DATOS PRINCIPALES</div><h2>Servicio solicitado</h2></div><span className={`priority priority-${service.priority}`}>{service.priority === "critica" ? "Prioridad crítica" : service.priority === "alta" ? "Prioridad alta" : "Prioridad normal"}</span></div>
          <div className="facts-grid"><div className="fact"><span>Tipo de servicio</span><strong className="capitalize">{service.service_type}</strong></div><div className="fact"><span>{rental?"Equipo o servicio":"Residuo o material"}</span><strong>{service.waste_type}</strong></div>{rental?<div className="fact"><span>Período de arriendo</span><strong>{day(service.rental_from)} al {day(service.rental_to)}</strong></div>:<div className="fact"><span>Cantidad estimada</span><strong>{service.estimated_kg ? `${Number(service.estimated_kg).toLocaleString("es-CL")} kg` : "Sin estimación"}</strong></div>}<div className="fact"><span>Registrada</span><strong>{chileDate(service.created_at)}</strong></div><div className="fact"><span><MapPin size={15}/> {rental?"Entrega":"Origen"}</span><strong>{service.origin}</strong></div><div className="fact"><span><MapPin size={15}/> {rental?"Lugar de uso":"Destino"}</span><strong>{service.destination}</strong></div></div>
          {service.notes && <div className="note-block"><span>Observaciones</span><p>{service.notes}</p></div>}
        </section>
        {purchase&&requestMaterials.length>0&&<section className="section-card"><div className="eyebrow">COMPRA DE MATERIAL</div><h2>Materiales solicitados</h2><p className="helper-text">Identificador del catálogo compartido con la entrada de material. El peso final se registra en Ingresos.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Material</th><th>Kg propuestos</th>{actor.role!=="conductor"&&<th>Precio acordado</th>}</tr></thead><tbody>{requestMaterials.map(item=><tr key={item.position}><td><strong>{item.material_name}</strong>{item.line_note&&<small className="table-sub">Obs.: {item.line_note}</small>}</td><td>{item.quantity_kg===null?"Por pesar":`${Number(item.quantity_kg).toLocaleString("es-CL",{maximumFractionDigits:3})} kg`}</td>{actor.role!=="conductor"&&<td>{item.unit_price_clp==null?"Sin precio en solicitud":`$${Number(item.unit_price_clp).toLocaleString("es-CL")} / kg`}</td>}</tr>)}</tbody></table></div></section>}
        {sourceQuotes[0]&&<section className="section-card"><div className="section-heading"><div><div className="eyebrow">ORIGEN COMERCIAL</div><h2>Cotización aceptada</h2></div>{actor.role!=="conductor"&&<Link href={`/cotizaciones/${sourceQuotes[0].id}`} className="text-link">Ver propuesta →</Link>}</div>
          <p className="helper-text"><strong>{quoteFolio(sourceQuotes[0])}</strong> · {sourceQuotes[0].title}</p>
          {!purchase&&!sourceQuotes[0].client_order_exception&&(!sourceQuotes[0].client_order_reference||!sourceQuotes[0].has_order_document)&&<p className="notice notice-error">Para programar este servicio puntual, registre la OC con su respaldo o una excepción autorizada en <Link href={`/cotizaciones/${sourceQuotes[0].id}`}>la cotización</Link>.</p>}
          {sourceQuotes[0].client_order_exception&&<p className="helper-text">Sin OC según excepción documentada: {sourceQuotes[0].client_order_exception}</p>}
          <ul className="quote-source-list">{sourceLines.map((line,i)=><li key={i}>{line.description}<span>{Number(line.quantity).toLocaleString("es-CL",{maximumFractionDigits:3})} {line.unit}</span></li>)}</ul>
          {sourceQuotes[0].notes&&<div className="note-block"><span>Condiciones de la propuesta</span><p>{sourceQuotes[0].notes}</p></div>}
        </section>}
        {rental&&<section id="arriendo" className="section-card service-operation-section"><div className="section-heading"><div><div className="eyebrow">SERVICIOS · ARRIENDO</div><h2><CalendarDays size={19}/> Período y equipo</h2></div></div>
          <p className="helper-text">Del {day(service.rental_from)} al {day(service.rental_to)}. Se registra el equipo y el respaldo de ejecución sin camión, conductor ni pesos.</p>
          {service.assigned_asset_id&&<p>Equipo asignado: <strong>{service.asset_label}</strong></p>}
          {service.status==="programada"&&<Link className="order-link" href={`/solicitudes/${id}/orden`}>Ver orden de arriendo para imprimir →</Link>}
          {canScheduleRental&&<ServiceOperationForm key={`${id}:${service.assigned_asset_id??""}`} kind="rental" id={id} updating={service.status==="programada"} values={{asset_id:service.assigned_asset_id??""}} assets={equipment.map(a=>({value:a.id,label:`${a.code} · ${a.label}`}))}/>}
          {canScheduleRental&&<details id="cancelar-servicio" className="cancel-control service-operation-section" open={paramsQuery.formulario==="cancel"}><summary>Cancelar arriendo</summary><ServiceOperationForm key={`${id}:${service.status}`} kind="cancel" id={id}/></details>}
          {service.status==="cancelada"&&<p className="cancelled-note">Arriendo cancelado. El motivo quedó registrado en el historial.</p>}
          {service.status==="solicitada"&&!canScheduleRental&&<p className="muted">Pendiente de programación por operaciones.</p>}
        </section>}
        {!rental&&<section id="planificacion" className="section-card service-operation-section"><div className="section-heading"><div><div className="eyebrow">DESPACHO</div><h2><Truck size={19}/> Planificación y recursos</h2></div></div>
          {service.scheduled_for && <div className="assigned-summary"><div><CalendarDays size={19}/><span><small>Fecha y hora</small><strong>{chileDate(service.scheduled_for)}</strong></span></div><div><Truck size={19}/><span><small>Camión / conductor</small><strong>{service.asset_label ?? "—"} · {service.driver_name ?? "—"}</strong>{service.external_driver_id&&<small>Tercero · {service.external_driver_company} · RUT {service.external_driver_tax_id}</small>}</span></div>{service.ramp_label && <div><Truck size={19}/><span><small>Rampla asignada</small><strong>{service.ramp_label}</strong></span></div>}{service.guide_number && <div><FileText size={19}/><span><small>Guía</small><strong>{service.guide_number}</strong></span></div>}</div>}
          {service.scheduled_for && <Link className="order-link" href={`/solicitudes/${service.id}/orden`}><FileText size={16}/> Ver orden de servicio para imprimir →</Link>}
          <Link className="order-link" href={`/solicitudes/${service.id}/guias`}><Weight size={16}/> Control de guías, tickets y diferencias de peso →</Link>
          {actor.role!=="conductor"&&<Link className="order-link" href={`/solicitudes/${service.id}/seguimiento`}><FileText size={16}/> {service.operating_company==="e_y_j"?"Seguimiento de propuesta, OC y respaldo documental":"Seguimiento de guía valorizada, propuesta, OC y SIDREP"} →</Link>}
          {actor.role!=="conductor"&&service.operating_company!=="e_y_j"&&<Link className="order-link" href="/ingresos"><PackageCheck size={16}/> Ver ingresos de material y excedentes →</Link>}
          {canAssign && (!assets.length || (!drivers.length && !externalDrivers.length)) && <div className="resource-alert"><strong>Faltan recursos para programar este servicio.</strong><span>{!assets.length ? "Registre un camión en Maestros. " : ""}{!drivers.length&&!externalDrivers.length ? "Registre un conductor propio o tercero debajo." : ""}</span>{!assets.length && <Link href="/maestros">Ir a Maestros →</Link>}</div>}
          {canAssign && <ServiceOperationForm key={`${id}:${service.scheduled_for?.toISOString()??""}:${service.assigned_asset_id}:${service.ramp_asset_id}:${service.driver_id}:${service.external_driver_id}`} kind="plan" id={id} updating={service.status==="programada"}
            values={{scheduled_for:localInput(service.scheduled_for),asset_id:service.assigned_asset_id??"",ramp_asset_id:service.ramp_asset_id??"",driver_selection:service.external_driver_id?`tercero:${service.external_driver_id}`:service.driver_id?`cuenta:${service.driver_id}`:""}}
            assets={assets.map(a=>({value:a.id,label:`${a.plate||"Patente pendiente"} · ${a.label} (${a.code})`}))} ramps={ramps.map(a=>({value:a.id,label:`${a.plate||"Patente pendiente"} · ${a.label} (${a.code})`}))}
            drivers={drivers.map(d=>({value:`cuenta:${d.id}`,label:d.name}))} externalDrivers={externalDrivers.map(d=>({value:`tercero:${d.id}`,label:`${d.name} · ${d.company_name} · ${d.tax_id}`}))} disabled={!assets.length||(!drivers.length&&!externalDrivers.length)}/>}
          {canAssign && <details className="small-action"><summary>Registrar conductor de transportista (sin cuenta)</summary><p className="helper-text">Identifique al tercero por RUT y transportista. Si la faena exige documentos, regístrelos y verifíquelos en <Link href="/personal">Personal</Link> antes de programar. Operaciones registrará checklist, guía y hoja de servicio con su propia cuenta.</p><form action={createExternalDriverForServiceAction} className="form-stack compact"><input type="hidden" name="id" value={service.id}/><div className="two-fields"><label>Nombre y apellido<input name="name" required minLength={2} maxLength={120}/></label><label>RUT del conductor<input name="tax_id" required maxLength={20} placeholder="12.345.678-5"/></label></div><div className="two-fields"><label>Transportista<input name="company_name" required minLength={2} maxLength={160}/></label><label>Teléfono (opcional)<input name="phone" maxLength={40}/></label></div><SubmitButton className="button button-outline">Registrar tercero</SubmitButton></form></details>}
          {canAssign && actor.role==="admin" && <details className="small-action"><summary>Crear conductor con acceso al sistema</summary><form action={createDriverForServiceAction} className="form-stack compact inline-driver"><input type="hidden" name="id" value={service.id}/><div className="two-fields"><label>Nombre del conductor<input name="name" required maxLength={120} placeholder="Nombre y apellido"/></label><label>Correo del conductor<input name="email" type="email" required placeholder="conductor@empresa.cl"/></label></div><label>Contraseña inicial (mínimo 12 caracteres)<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></label><SubmitButton className="button button-outline">Crear conductor y volver al despacho</SubmitButton></form></details>}
          {canAssign && <details id="cancelar-servicio" className="cancel-control service-operation-section" open={paramsQuery.formulario==="cancel"}><summary>Cancelar este servicio</summary><ServiceOperationForm key={`${id}:${service.status}`} kind="cancel" id={id}/></details>}
          {service.status === "cancelada" && <p className="cancelled-note">Este servicio fue cancelado. El motivo y responsable quedaron registrados en el historial.</p>}
          {!service.scheduled_for && !canAssign && <p className="muted">Pendiente de planificación por el equipo de operaciones.</p>}
        </section>}
        {serviceContainers.length>0&&<section className="section-card"><div className="section-heading"><div><div className="eyebrow">TOLVAS EN ESTA FAENA</div><h2>Foto de instalación</h2></div></div>
          <p className="helper-text">El conductor asignado puede adjuntar la foto al movimiento de instalación. Esto no cambia la ubicación ni el estado de la unidad.</p>
          <ul className="record-list">{serviceContainers.map(c=><li key={c.container_id}><strong>{c.code} · {c.kind}</strong>{c.photo_filename?<small>Foto registrada: {canManage(actor)?<Link href={`/api/contenedores/movimientos/${c.movement_id}/foto`}>{c.photo_filename}</Link>:c.photo_filename}</small>:
            <form action={uploadServiceContainerPhotoAction} className="form-stack compact"><input type="hidden" name="service_id" value={id}/><input type="hidden" name="container_id" value={c.container_id}/><label>Foto JPG, PNG o WebP (máximo 4 MB)<input type="file" name="installation_photo" accept="image/jpeg,image/png,image/webp" required/></label><SubmitButton className="button button-outline">Adjuntar foto</SubmitButton></form>}</li>)}</ul>
        </section>}
        {!rental&&(dayReports.length>0||canReport||canPlan(actor)&&paramsQuery.formulario==="day")&&<ServiceDayHistory id={id} reports={dayReports} company={service.operating_company} query={paramsQuery} today={todayChile} minDay={programmedDay} manage={canPlan(actor)} canCreate={Boolean(canReport&&service.assigned_asset_id)} canCorrect={canPlan(actor)&&["programada","en_ruta","pendiente_revision","completada"].includes(service.status)}/>}
        {canPlan(actor)&&<ServiceExtraCharges actor={actor} serviceId={id} company={service.operating_company} query={paramsQuery} today={todayChile}/>}
        {!rental&&canWork && service.status === "programada" && <section id="checklist" className="section-card service-operation-section"><div className="section-heading"><div><div className="eyebrow">CONTROL PREVIO</div><h2><ClipboardCheck size={19}/> Checklist antes de salir</h2></div></div><ServiceOperationForm key={`${id}:${checklist?.completed_at.toISOString()??""}`} kind="checklist" id={id} values={{vehicle_ok:checklist?.vehicle_ok?"on":"",documents_ok:checklist?.documents_ok?"on":"",containment_ok:checklist?.containment_ok?"on":"",ppe_ok:checklist?.ppe_ok?"on":"",comment:checklist?.comment??""}}/>
          {checklistIncidents.map(incident=><p key={incident.id} className="helper-text">Avería del checklist: <strong>{incident.status==="abierta"?"Abierta en Mantenimiento":"Resuelta"}</strong> · {incident.description}{canManage(actor)&&<> · <Link href="/mantenimiento">Ver mantenimiento</Link></>}</p>)}
          {checklist && [checklist.vehicle_ok, checklist.documents_ok, checklist.containment_ok, checklist.ppe_ok].every(Boolean) && <form action={startServiceAction} className="next-action"><input type="hidden" name="id" value={service.id}/><span><CheckCircle2 size={18}/> Verificaciones completas</span><SubmitButton className="button button-primary">Iniciar ruta</SubmitButton></form>}</section>}
        {((canWork&&["programada","en_ruta"].includes(service.status))||(canManage(actor)&&service.status!=="cancelada")||paramsQuery.documento_form&&(canManage(actor)||actor.role==="conductor")) && <ServiceDocuments id={id} evidence={evidence} driver={actor.role==="conductor"} purchase={purchase} company={service.operating_company} query={paramsQuery} disabled={!((canWork&&["programada","en_ruta"].includes(service.status))||(canManage(actor)&&service.status!=="cancelada"))}/>}
        {rental&&canManage(actor)&&service.status==="programada"&&<section id="cierre-arriendo" className="section-card"><div className="section-heading"><div><div className="eyebrow">CIERRE DE ARRIENDO</div><h2><CheckCircle2 size={19}/> Confirmar ejecución</h2></div></div><p className="helper-text">Compruebe el período acordado y adjunte un respaldo del arriendo antes de cerrar. Se conservarán los pesos vacíos.</p><form action={completeRentalAction}><input type="hidden" name="id" value={id}/><SubmitButton className="button button-primary" disabled={!evidence.some(item=>Boolean(item.storage_key))}>Cerrar arriendo con respaldo</SubmitButton></form></section>}
        {!rental&&canWork&&service.status==="en_ruta"&&<section className="section-card"><div className="section-heading"><div><div className="eyebrow">ENTREGA DE TERRENO</div><h2><CheckCircle2 size={19}/> Entregar documentación</h2></div></div><p className="helper-text">{purchase?"Adjunte Guía de Traslado y Hoja de Servicio. El ticket de pesaje es opcional.":"Adjunte al menos un documento o fotografía de la operación."} El conductor entrega el respaldo; administración revisa los documentos, registra el pesaje y cierra el servicio.</p>{purchase&&<div className="document-checks"><span>{guideReady?"✓":"○"} Guía de Traslado</span><span>{sheetReady?"✓":"○"} Hoja de Servicio</span></div>}<form action={handoffServiceAction} className="form-footer"><input type="hidden" name="id" value={service.id}/><SubmitButton className="button button-primary" disabled={purchase?(!guideReady||!sheetReady):!evidence.some(item=>Boolean(item.storage_key))}>{purchase?"Finalizar servicio de compra · entregar a administración":"Entregar a revisión administrativa"}</SubmitButton></form></section>}
        {!rental&&service.status==="pendiente_revision"&&<section id="revision" className="section-card service-operation-section"><div className="section-heading"><div><div className="eyebrow">REVISIÓN ADMINISTRATIVA</div><h2><Weight size={19}/> {purchase?"Cotejar recepción y respaldos":"Documentos entregados"}</h2></div></div><p className="helper-text">Terreno terminó su parte. Administración revisa los documentos y registra el pesaje antes de cerrar el servicio.</p>{canManage(actor)&&<>
          {purchase&&<><p className="helper-text">Abra los archivos de la ficha y compare guía, hoja y ticket con el material realmente recibido. El ticket puede faltar si se registra la causa. Después del cierre RERCHAR puede solicitar la guía valorizada.</p>
            <div className="review-documents">{([["Guía de Traslado",guideFile],["Hoja de Servicio",sheetFile],["Ticket de pesaje · opcional",ticketFile]] as const).map(([label,file])=><div key={label}><strong>{label}</strong>{file?<Link href={`/api/evidencia/${file.id}`} target="_blank" rel="noopener noreferrer">Abrir {file.original_filename??"archivo"} ↗</Link>:<span>{label.startsWith("Ticket")?"No adjuntado":"Falta adjuntar"}</span>}</div>)}</div>
          </>}
          <ServiceOperationForm key={`${id}:${evidence.map(e=>e.id).sort().join(",")}`} kind="finish" id={id} purchase={purchase} ticketReady={ticketReady} disabled={purchase&&(!guideReady||!sheetReady)} values={{material_name:service.waste_type,impurity_kg:"0",guide_number:service.guide_number??""}} sources={evidence.filter(item=>item.storage_key&&["guia_traslado","ticket_pesaje","hoja_servicio"].includes(item.document_kind)).map(item=>({id:item.id,name:item.original_filename||evidenceLabels[item.document_kind]||"Respaldo"}))}/>
        </>}</section>}
        {service.status === "completada" && <section id="cierre" className="section-card completion-card"><div className="section-heading"><div><div className="eyebrow">CIERRE REGISTRADO</div><h2><PackageCheck size={20}/> {rental?"Arriendo completado":"Servicio completado"}</h2></div></div>
          {rental?<p>Período registrado: <strong>{day(service.rental_from)} al {day(service.rental_to)}</strong>. Respaldo adjunto; sin pesaje.</p>:<div className="facts-grid"><div className="fact"><span>Peso bruto</span><strong>{Number(service.gross_kg).toLocaleString("es-CL")} kg</strong></div><div className="fact"><span>Tara</span><strong>{Number(service.tare_kg).toLocaleString("es-CL")} kg</strong></div><div className="fact"><span>Peso neto</span><strong>{(Number(service.gross_kg) - Number(service.tare_kg)).toLocaleString("es-CL")} kg</strong></div></div>}
          {purchase&&purchaseReviews[0]&&<div className="note-block"><span>Revisión administrativa · {purchaseReviews[0].reviewer_name} · {chileDate(purchaseReviews[0].reviewed_at)}</span><p>Material recibido: {purchaseReviews[0].material_name} · Impurezas: {Number(purchaseReviews[0].impurity_kg).toLocaleString("es-CL")} kg · Ticket: {purchaseReviews[0].missing_ticket_reason?`no entregado (${purchaseReviews[0].missing_ticket_reason})`:"cotejado"}.</p>{purchaseReviews[0].observations&&<p>{purchaseReviews[0].observations}</p>}</div>}
          {!rental&&service.operating_company==="rerchar"&&canManage(actor)&&<><p className="helper-text">{purchase?receiptEntries[0]?"Recepción cotejada. Abra el ingreso vinculado y continúe con guía valorizada, factura y aviso documental.":"Recepción cotejada. Cree el ingreso con los datos de este servicio y confirme pesos, guías y materiales antes del seguimiento.":"Continúe con la documentación y el seguimiento de guías antes del cierre comercial."}</p><Link className="button button-primary" href={purchase?receiptEntries[0]?`/ingresos/${receiptEntries[0].id}`:`/ingresos?servicio=${id}#nuevo-ingreso`:`/solicitudes/${id}/seguimiento`}>{purchase?receiptEntries[0]?"Abrir ingreso vinculado →":"Crear ingreso de este servicio →":"Continuar seguimiento documental →"}</Link></>}
          {actor.role==="admin"&&<Link className="button button-outline" href={`/finanzas/${id}`}>Valorizar y registrar cobros →</Link>}
          {!rental&&canPlan(actor)&&<Link className="button button-outline" href={wasteRecord[0]?`/cumplimiento/${wasteRecord[0].id}`:`/cumplimiento?service_id=${id}`}>{wasteRecord[0]?`Registro ambiental · ${wasteRecord[0].status}`:"Preparar ficha ambiental para el certificado"} →</Link>}
          {!rental&&certificate[0]&&<Link className="button button-outline" href={`/api/certificados/${certificate[0].id}/pdf`}>Descargar certificado PDF + QR</Link>}
          {!rental&&actor.role==="admin"&&!certificate[0]&&certificateReady&&<Link className="button button-outline" href={`/certificados?service_id=${id}`}>Preparar certificado →</Link>}
          {!rental&&actor.role==="admin"&&!certificate[0]&&!certificateReady&&<p className="certificate-step-hint">Para emitir el certificado, prepare y revise primero la ficha ambiental de este servicio.</p>}
        </section>}
      </div>
      <aside className="detail-side">
        <section className="section-card side-card"><div className="eyebrow">RECORRIDO · {rental?"ARRIENDO":"SERVICIO"}</div><div className="progress-list" role="list" aria-label="Etapas del servicio">{(rental?["solicitada","programada","completada"]:["solicitada","programada","en_ruta","pendiente_revision","completada"]).map((state, index, all) => <div role="listitem" className={`progress-step ${all.indexOf(service.status)>index ? "done" : ""} ${service.status===state?"current":""}`} aria-current={service.status===state?"step":undefined} key={state}><span className="progress-number">{String(index + 1).padStart(2,"0")}</span><span>{state === "en_ruta" ? "En ruta" : state === "pendiente_revision"?"Revisión administrativa":state.charAt(0).toUpperCase() + state.slice(1)}</span>{service.status===state&&<small className="progress-state">{state==="completada"?"Cerrado":"Actual"}</small>}</div>)}</div>{service.status==="cancelada"&&<p className="progress-cancelled">Servicio cancelado; consulte el motivo en el historial.</p>}</section>
        <ServiceEvidenceHistory id={id} evidence={evidence} query={paramsQuery}/>
        {containerMoves.length>0&&<section className="section-card side-card"><div className="eyebrow">CONTENEDORES</div><h2>Movimientos asociados</h2><ol className="timeline">{containerMoves.map((move)=><li key={move.id}><span className="timeline-marker"/><strong>{move.code} · {move.kind.replaceAll("_"," ")}</strong><small>{move.previous_location?`${move.previous_location} → `:""}{move.next_location} · {chileDate(move.created_at)}</small></li>)}</ol></section>}
        <ServiceHistory id={id} history={timeline} query={paramsQuery}/>
        <Link className="back-link" href="/solicitudes"><ArrowLeft size={16}/> Volver a solicitudes</Link>
      </aside>
    </div>
  </>;
}
