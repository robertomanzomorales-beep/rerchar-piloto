import {saveCounterpartyAction} from "@/app/counterparty-actions";
import {SubmitButton} from "@/components/Transition";
import type {Counterparty} from "@/lib/counterparties";

type Client={id:string;name:string;tax_id:string|null;email:string|null;address:string|null};
const areas=[
  ["compras","Compras de excedentes y solicitud de guía"],
  ["servicios","Servicios de transporte y arriendo"],
  ["contabilidad","Contabilidad"],
  ["operaciones","Operaciones y despacho"],
  ["prevencion","Prevención de riesgos"],
] as const;
export default function CounterpartyForm({clients,profile,selectedClient}:{clients:Client[];profile?:Counterparty;selectedClient?:Client}){
  const defaultText=(key:keyof Counterparty,fallback="")=>String(profile?.[key]??fallback);
  const client=selectedClient;
  return <form action={saveCounterpartyAction} className="form-grid">
    <input type="hidden" name="id" value={profile?.id??""}/>
    <h2 className="field-full">1. Identificación de la empresa</h2>
    <label>Relación comercial<select name="kind" defaultValue={profile?.kind??"proveedor"} required><option value="proveedor">Proveedor</option><option value="cliente">Cliente</option><option value="ambos">Cliente y proveedor</option></select></label>
    <label>Cliente ya registrado (necesario para Cliente o Ambos)<select name="client_id" defaultValue={profile?.client_id??client?.id??""}><option value="">Sin vínculo de cliente</option>{clients.map(c=><option value={c.id} key={c.id}>{c.name} · {c.tax_id||"RUT pendiente"}</option>)}</select></label>
    <label>Razón social *<input name="legal_name" required minLength={2} maxLength={180} defaultValue={defaultText("legal_name",client?.name)}/></label>
    <label>Nombre de fantasía<input name="trade_name" maxLength={180} defaultValue={defaultText("trade_name")}/></label>
    <label>RUT *<input name="tax_id" required maxLength={25} defaultValue={defaultText("tax_id",client?.tax_id??"")} placeholder="76.347.909-9"/></label>
    <label>Giro o actividad económica *<input name="business_activity" required maxLength={180} defaultValue={defaultText("business_activity")}/></label>
    <label>Rubro o industria<input name="industry" maxLength={120} defaultValue={defaultText("industry")}/></label>
    <label>Dirección legal *<input name="legal_address" required minLength={5} maxLength={250} defaultValue={defaultText("legal_address",client?.address??"")}/></label>
    <label>Comuna, ciudad y región *<input name="locality" required maxLength={160} defaultValue={defaultText("locality")}/></label>
    <label>Teléfono *<input name="phone" required minLength={6} maxLength={40} defaultValue={defaultText("phone")}/></label>
    <label>Correo general *<input name="general_email" type="email" required maxLength={254} defaultValue={defaultText("general_email",client?.email??"")}/></label>
    <label>Sitio web<input name="website" maxLength={250} defaultValue={defaultText("website")}/></label>
    <label>Condición tributaria *<select name="tax_status" defaultValue={profile?.tax_status??"afecto"}><option value="afecto">Afecto a IVA</option><option value="exento">Exento</option><option value="otro">Otro</option></select></label>
    <label>Representante legal *<input name="legal_representative" required minLength={2} maxLength={180} defaultValue={defaultText("legal_representative")}/></label>
    <h2 className="field-full">2. Facturación y estados de pago</h2>
    <label>Correo recepción de facturas *<input name="invoice_email" type="email" required maxLength={254} defaultValue={defaultText("invoice_email")}/></label>
    <label>Condición de pago *<select name="payment_terms" defaultValue={profile?.payment_terms??"30"}><option value="contado">Contado</option><option value="7">7 días</option><option value="15">15 días</option><option value="30">30 días</option></select></label>
    <label>¿Requiere OC para facturar?<select name="requires_oc" defaultValue={profile?.requires_oc?"si":"no"}><option value="no">No</option><option value="si">Sí</option></select></label>
    <label>¿La OC requiere HES para facturar?<select name="requires_hes" defaultValue={profile?.requires_hes?"si":"no"}><option value="no">No</option><option value="si">Sí</option></select></label>
    <label>¿Requiere EDP para validar el servicio?<select name="requires_edp" defaultValue={profile?.requires_edp?"si":"no"}><option value="no">No</option><option value="si">Sí</option></select></label>
    <label>Correo de envío de EDP y respaldo<input name="edp_email" type="email" maxLength={254} defaultValue={defaultText("edp_email")}/></label>
    <h2 className="field-full">3. Datos bancarios para pagos o devoluciones</h2>
    <p className="field-full helper-text">Obligatorios para proveedores; para clientes, complételos si corresponde hacer pagos o devoluciones. Cada cambio vuelve a revisión administrativa.</p>
    <label>Banco<input name="bank_name" maxLength={100} defaultValue={defaultText("bank_name")}/></label>
    <label>Tipo de cuenta<select name="account_type" defaultValue={defaultText("account_type")}><option value="">Seleccione</option><option value="corriente">Corriente</option><option value="vista">Vista</option><option value="ahorro">Ahorro</option><option value="otro">Otro</option></select></label>
    <label>Número de cuenta<input name="account_number" maxLength={60} defaultValue={defaultText("account_number")}/></label>
    <label>Titular de la cuenta<input name="account_holder" maxLength={180} defaultValue={defaultText("account_holder")}/></label>
    <label>RUT del titular<input name="account_holder_tax_id" maxLength={25} defaultValue={defaultText("account_holder_tax_id")}/></label>
    <label>Moneda<input name="currency" maxLength={20} defaultValue={defaultText("currency","CLP")}/></label>
    <label>Correo de comprobantes<input name="proof_email" type="email" maxLength={254} defaultValue={defaultText("proof_email")}/></label>
    <label>SWIFT o IBAN, si aplica<input name="swift_iban" maxLength={100} defaultValue={defaultText("swift_iban")}/></label>
    <label className="field-full">Observaciones bancarias<textarea name="bank_notes" maxLength={500} rows={2} defaultValue={defaultText("bank_notes")}/></label>
    <h2 className="field-full">4. Contactos por área</h2>
    {areas.map(([area,title])=>{const item=profile?.contacts?.find(c=>c.area===area);return <fieldset className="field-full" key={area}>
      <legend>{title}</legend><div className="form-grid"><label>Nombre<input name={`${area}_name`} maxLength={120} defaultValue={item?.name??""}/></label>
      <label>Cargo<input name={`${area}_role`} maxLength={100} defaultValue={item?.role??""}/></label>
      <label>Teléfono<input name={`${area}_phone`} maxLength={40} defaultValue={item?.phone??""}/></label>
      <label>Correo<input name={`${area}_email`} type="email" maxLength={254} defaultValue={item?.email??""}/></label></div>
    </fieldset>;})}
    <div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar ficha</SubmitButton></div>
  </form>;
}
