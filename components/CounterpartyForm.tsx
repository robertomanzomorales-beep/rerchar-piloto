"use client";

import {saveCounterpartyAction} from "@/app/counterparty-actions";
import {SubmitButton} from "@/components/Transition";
import type {Counterparty} from "@/lib/counterparties";
import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {counterpartyDefaults,counterpartyHref,emptyCounterpartyState,type CounterpartyContext} from "@/lib/counterparty-form-state";

type Client={id:string;name:string;tax_id:string|null;email:string|null;address:string|null};
const areas=[
  ["compras","Compras de excedentes y solicitud de guía"],
  ["servicios","Servicios de transporte y arriendo"],
  ["contabilidad","Contabilidad"],
  ["operaciones","Operaciones y despacho"],
  ["prevencion","Prevención de riesgos"],
] as const;
export default function CounterpartyForm({clients,profile,selectedClient,context={}}:{clients:Client[];profile?:Counterparty;selectedClient?:Client;context?:CounterpartyContext}){
  const[state,action,pending]=useActionState(saveCounterpartyAction,emptyCounterpartyState,counterpartyHref(context,profile?.id??"nueva",{cliente:selectedClient?.id}));
  const[values,setValues]=useState<Record<string,string>>(()=>state.error?state.values:counterpartyDefaults(profile,selectedClient));
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error){setValues(state.values);errorRef.current?.focus();}},[state]);
  const control=(name:string)=>({name,value:values[name]??"",disabled:pending,onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setValues(previous=>({...previous,[name]:event.target.value}))});
  return <form action={action} className="form-grid" data-counterparty-form="save" aria-busy={pending}>
    <input type="hidden" name="id" value={profile?.id??""}/>{context.pagina&&<input type="hidden" name="pagina" value={context.pagina}/>}
    {state.error&&<div ref={errorRef} tabIndex={-1} className="notice notice-error request-form-error field-full" role="alert"><strong>No se pudo guardar la ficha.</strong><span>{state.error}</span><small>Los datos ingresados se conservan para corregirlos.</small></div>}
    <h2 className="field-full">1. Identificación de la empresa</h2>
    <label>Relación comercial<select {...control("kind")} required><option value="proveedor">Proveedor</option><option value="cliente">Cliente</option><option value="ambos">Cliente y proveedor</option></select></label>
    <label>Cliente ya registrado (necesario para Cliente o Ambos)<select {...control("client_id")}><option value="">Sin vínculo de cliente</option>{clients.map(c=><option value={c.id} key={c.id}>{c.name} · {c.tax_id||"RUT pendiente"}</option>)}</select></label>
    <label>Razón social *<input {...control("legal_name")} required minLength={2} maxLength={180}/></label>
    <label>Nombre de fantasía<input {...control("trade_name")} maxLength={180}/></label>
    <label>RUT *<input {...control("tax_id")} required maxLength={25} placeholder="76.347.909-9"/></label>
    <label>Giro o actividad económica *<input {...control("business_activity")} required maxLength={180}/></label>
    <label>Rubro o industria<input {...control("industry")} maxLength={120}/></label>
    <label>Dirección legal *<input {...control("legal_address")} required minLength={5} maxLength={250}/></label>
    <label>Comuna, ciudad y región *<input {...control("locality")} required maxLength={160}/></label>
    <label>Teléfono *<input {...control("phone")} required minLength={6} maxLength={40}/></label>
    <label>Correo general *<input {...control("general_email")} type="email" required maxLength={254}/></label>
    <label>Sitio web<input {...control("website")} maxLength={250}/></label>
    <label>Condición tributaria *<select {...control("tax_status")}><option value="afecto">Afecto a IVA</option><option value="exento">Exento</option><option value="otro">Otro</option></select></label>
    <label>Representante legal *<input {...control("legal_representative")} required minLength={2} maxLength={180}/></label>
    <h2 className="field-full">2. Facturación y estados de pago</h2>
    <label>Correo recepción de facturas *<input {...control("invoice_email")} type="email" required maxLength={254}/></label>
    <label>Condición de pago *<select {...control("payment_terms")}><option value="contado">Contado</option><option value="7">7 días</option><option value="15">15 días</option><option value="30">30 días</option></select></label>
    <label>¿Requiere OC para facturar?<select {...control("requires_oc")}><option value="no">No</option><option value="si">Sí</option></select></label>
    <label>¿La OC requiere HES para facturar?<select {...control("requires_hes")}><option value="no">No</option><option value="si">Sí</option></select></label>
    <label>¿Requiere EDP para validar el servicio?<select {...control("requires_edp")}><option value="no">No</option><option value="si">Sí</option></select></label>
    <label>Correo de envío de EDP y respaldo<input {...control("edp_email")} type="email" maxLength={254}/></label>
    <h2 className="field-full">3. Datos bancarios para pagos o devoluciones</h2>
    <p className="field-full helper-text">Obligatorios para proveedores; para clientes, complételos si corresponde hacer pagos o devoluciones. Cada cambio vuelve a revisión administrativa.</p>
    <label>Banco<input {...control("bank_name")} maxLength={100}/></label>
    <label>Tipo de cuenta<select {...control("account_type")}><option value="">Seleccione</option><option value="corriente">Corriente</option><option value="vista">Vista</option><option value="ahorro">Ahorro</option><option value="otro">Otro</option></select></label>
    <label>Número de cuenta<input {...control("account_number")} maxLength={60}/></label>
    <label>Titular de la cuenta<input {...control("account_holder")} maxLength={180}/></label>
    <label>RUT del titular<input {...control("account_holder_tax_id")} maxLength={25}/></label>
    <label>Moneda<input {...control("currency")} maxLength={20}/></label>
    <label>Correo de comprobantes<input {...control("proof_email")} type="email" maxLength={254}/></label>
    <label>SWIFT o IBAN, si aplica<input {...control("swift_iban")} maxLength={100}/></label>
    <label className="field-full">Observaciones bancarias<textarea {...control("bank_notes")} maxLength={500} rows={2}/></label>
    <h2 className="field-full">4. Contactos por área</h2>
    {areas.map(([area,title])=><fieldset className="field-full" key={area}>
      <legend>{title}</legend><div className="form-grid"><label>Nombre<input {...control(`${area}_name`)} maxLength={120}/></label>
      <label>Cargo<input {...control(`${area}_role`)} maxLength={100}/></label>
      <label>Teléfono<input {...control(`${area}_phone`)} maxLength={40}/></label>
      <label>Correo<input {...control(`${area}_email`)} type="email" maxLength={254}/></label></div>
    </fieldset>)}
    <div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar ficha</SubmitButton></div>
  </form>;
}
