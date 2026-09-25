import Link from "next/link";
import {redirect} from "next/navigation";
import {PackageCheck} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {db} from "@/lib/db";
import {listMaterialReceipts,materialAmounts} from "@/lib/materials";
import {createMaterialAction} from "@/app/operation-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";

const date=(v:Date|string)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);

export default async function MaterialReceipts({searchParams}:{searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor();if(actor.role==="conductor")redirect("/");
  const [query,rows,clients,services]=await Promise.all([searchParams,listMaterialReceipts(actor),
    canManage(actor)?db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name"):Promise.resolve([]),
    canManage(actor)?db.query<{id:string;folio:string;client_name:string}>(`SELECT s.id,s.folio,c.name AS client_name FROM service_requests s
      JOIN clients c ON c.id=s.client_id WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 300`):Promise.resolve([])]);
  return <><div className="page-title-row"><div><div className="eyebrow">ENTRADAS Y EXCEDENTES 2026</div><h1>Ingresos de material</h1><p className="page-intro">Tickets, pesos de origen y llegada, impurezas, guías, facturas y respaldo por cliente.</p></div><span className="title-icon"><PackageCheck size={24}/></span></div><Notice error={query.error} ok={query.ok}/>
    {canManage(actor)&&<section className="section-card"><div className="section-heading"><div><div className="eyebrow">NUEVO REGISTRO</div><h2>Entrada o excedente</h2></div></div>
      <p className="helper-text">Indique la base del peso neto: en las planillas de entrada varía entre peso de proveedor y peso RERCHAR; en excedentes se calcula sobre RERCHAR. Una diferencia con el neto anotado requiere explicación.</p>
      <form action={createMaterialAction} className="form-grid">
        <label>Tipo<select name="kind" defaultValue="ingreso"><option value="ingreso">Entrada de material</option><option value="excedente">Excedente RESITER / SPENCE</option></select></label>
        <label>Fecha de movimiento<input name="movement_on" type="date" required/></label>
        <label>Cliente registrado<select name="client_id" required defaultValue=""><option value="">Seleccione</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Servicio vinculado (opcional)<select name="service_id" defaultValue=""><option value="">Sin vincular</option>{services.map(s=><option key={s.id} value={s.id}>RER-{String(s.folio).padStart(5,"0")} · {s.client_name}</option>)}</select></label>
        <label>Faena / lugar<input name="site_name" required maxLength={180}/></label><label>Origen<input name="origin" maxLength={180}/></label><label>Destino<input name="destination" maxLength={180}/></label>
        <div className="form-section-title field-full">Transporte y carga</div><label>Conductor<input name="driver_name" maxLength={120}/></label><label>RUT conductor<input name="driver_tax_id" maxLength={25}/></label><label>Camión<input name="truck_plate" maxLength={20}/></label><label>Rampa<input name="trailer_plate" maxLength={30}/></label><label>Ticket de pesaje<input name="weighing_ticket" required maxLength={80}/></label><label>Material<input name="material_name" required maxLength={180}/></label>
        <div className="form-section-title field-full">Pesos de la planilla (kg)</div>
        <label>Peso proveedor<input name="supplier_kg" type="number" min="0" step="0.01"/></label><label>Peso RERCHAR<input name="rerchar_kg" type="number" min="0" step="0.01"/></label><label>Impurezas<input name="impurity_kg" type="number" min="0" step="0.01" defaultValue="0"/></label><label>Base del neto<select name="net_basis"><option value="rerchar">Peso RERCHAR − impurezas</option><option value="proveedor">Peso proveedor − impurezas</option></select></label><label>Neto anotado (opcional)<input name="net_reported_kg" type="number" min="0" step="0.01"/></label><label>Informe impurezas<input name="impurity_report" maxLength={80}/></label>
        <div className="form-section-title field-full">Documentos y cobro</div>
        <label>Guía origen<input name="origin_guide" maxLength={80}/></label><label>Guía de traslado<input name="transfer_guide" maxLength={80}/></label><label>Hoja de entrada<input name="entry_sheet" maxLength={80}/></label><label>Guía valorizada<input name="valued_guide" maxLength={80}/></label><label>Certificado<input name="certificate_number" maxLength={80}/></label><label>Acta<input name="act_number" maxLength={80}/></label><label>Factura<input name="invoice_number" maxLength={80}/></label><label>Precio unitario ($/kg)<input name="unit_price_clp" type="number" min="0" step="0.01"/></label><label>Estado pago<select name="payment_status"><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagado">Pagado</option><option value="no_aplica">No aplica</option></select></label><label>Fecha de pago (si pagado)<input name="paid_on" type="date"/></label><label className="field-full">Observaciones<textarea name="notes" rows={2} maxLength={1000}/></label>
        <div className="field-full form-footer"><SubmitButton className="button button-primary">Registrar ingreso</SubmitButton></div></form></section>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">CONTROL</div><h2>Movimientos registrados</h2></div><span className="count-pill">{rows.length}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha / ticket</th><th>Cliente / faena</th><th>Material</th><th>Neto calculado</th><th>Estado</th></tr></thead><tbody>{rows.map(r=>{const amount=materialAmounts(r);return <tr key={r.id}><td><Link href={`/ingresos/${r.id}`}><strong>{r.weighing_ticket}</strong></Link><span className="table-sub">{date(r.movement_on)} · {r.kind}</span></td><td>{r.client_name}<span className="table-sub">{r.site_name}</span></td><td>{r.material_name}</td><td>{amount.net_kg?.toLocaleString("es-CL")??"—"} kg</td><td>{r.payment_status}</td></tr>;})}</tbody></table>{rows.length===0&&<p className="muted">Sin movimientos vinculados todavía. Consulte las planillas originales para conciliar registros históricos.</p>}</div></section></>;
}
