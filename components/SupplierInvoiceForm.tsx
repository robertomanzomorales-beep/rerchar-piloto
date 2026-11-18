"use client";

import Link from "next/link";
import {useActionState,useEffect,useRef,useState} from "react";
import {createSupplierInvoiceAction} from "@/app/operation-actions";
import {serviceFolio,type Company} from "@/lib/companies";
import type {SupplierInvoiceFormState,SupplierInvoicePurchase,SupplierInvoiceService} from "@/lib/supplier-invoice-form-state";
import {SubmitButton} from "./Transition";

export default function SupplierInvoiceForm({company,profilesReady,suppliers,purchases,services}:{company:Company|"";profilesReady:boolean;
  suppliers:{id:string;legal_name:string;tax_id:string}[];purchases:SupplierInvoicePurchase[];services:SupplierInvoiceService[];
}){
  const [state,action]=useActionState<SupplierInvoiceFormState,FormData>(createSupplierInvoiceAction,{error:"",values:{}});
  const restored=state.values;
  const [fields,setFields]=useState({issuer:restored.issuer||(company||"rerchar"),issued_on:restored.issued_on??"",
    supplier_profile_id:restored.supplier_profile_id??"",supplier_tax_id:restored.supplier_tax_id??"",supplier_name:restored.supplier_name??"",
    invoice_number:restored.invoice_number??"",due_on:restored.due_on??"",description:restored.description??"",
    net_clp:restored.net_clp??"",vat_clp:restored.vat_clp??"",total_clp:restored.total_clp??"",cost_area:restored.cost_area??"",
    purchase_id:restored.purchase_id??"",service_id:restored.service_id??"",notes:restored.notes??""});
  const update=(key:keyof typeof fields,value:string)=>setFields(previous=>({...previous,[key]:value}));
  const issuer=fields.issuer||"rerchar";
  const availablePurchases=purchases.filter(purchase=>purchase.issuer===issuer),availableServices=services.filter(service=>service.operating_company===issuer);
  const purchase=availablePurchases.find(p=>p.id===fields.purchase_id);
  const profileId=profilesReady?(purchase?.supplier_profile_id||fields.supplier_profile_id):"";
  const profile=suppliers.find(supplier=>supplier.id===profileId);
  const unavailableProfile=Boolean(profileId&&!profile);
  const invalidPurchase=Boolean(fields.purchase_id&&!purchase),invalidService=Boolean(fields.service_id&&!availableServices.some(s=>s.id===fields.service_id));
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error)errorRef.current?.focus();},[state]);
  return <form action={action} className="form-grid supplier-invoice-form">
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo registrar la factura.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    <label>Empresa receptora<select name="issuer" value={issuer} onChange={e=>setFields(previous=>({...previous,issuer:e.target.value,purchase_id:"",service_id:""}))}><option value="rerchar">RERCHAR CHILE SPA</option><option value="e_y_j">E y J Limitada</option></select></label>
    <label>Fecha emisión<input name="issued_on" type="date" required value={fields.issued_on} onChange={e=>update("issued_on",e.target.value)}/></label>
    {profilesReady&&<label>Ficha de proveedor verificada<select name="supplier_profile_id" value={profileId} disabled={Boolean(purchase?.supplier_profile_id)} onChange={e=>update("supplier_profile_id",e.target.value)}><option value="">Ingreso manual (sin cuenta verificada)</option>{unavailableProfile&&<option value={profileId} disabled>Ficha no disponible: revise su verificación</option>}{suppliers.map(s=><option value={s.id} key={s.id}>{s.legal_name} · {s.tax_id}</option>)}</select>{purchase?.supplier_profile_id&&<><input type="hidden" name="supplier_profile_id" value={profileId}/><small>Proveedor vinculado a la orden de compra.</small></>}</label>}
    <label>RUT proveedor (si es manual)<input name="supplier_tax_id" required={!profileId} minLength={5} maxLength={25} value={profile?.tax_id??fields.supplier_tax_id} disabled={Boolean(profileId)} onChange={e=>update("supplier_tax_id",e.target.value)}/></label>
    <label>Razón social (si es manual)<input name="supplier_name" required={!profileId} minLength={2} maxLength={180} value={profile?.legal_name??fields.supplier_name} disabled={Boolean(profileId)} onChange={e=>update("supplier_name",e.target.value)}/></label>
    {profilesReady&&<p className="field-full helper-text">Al seleccionar una ficha se toman la razón social y el RUT verificados. Para solicitar transferencia se exige una ficha verificada, incluso si la factura se registró manualmente. <Link href="/fichas/nueva" className="text-link">Crear ficha de proveedor</Link></p>}
    {unavailableProfile&&<p className="field-full notice notice-error" role="alert">La ficha del proveedor debe estar verificada antes de registrar esta factura. <Link href={`/fichas/${encodeURIComponent(profileId)}`}>Revisar ficha</Link>.</p>}
    <label>Número factura<input name="invoice_number" required maxLength={80} value={fields.invoice_number} onChange={e=>update("invoice_number",e.target.value)}/></label>
    <label>Vencimiento<input name="due_on" type="date" min={fields.issued_on||undefined} value={fields.due_on} onChange={e=>update("due_on",e.target.value)}/></label>
    <label className="field-full">Descripción<input name="description" required minLength={3} maxLength={500} value={fields.description} onChange={e=>update("description",e.target.value)}/></label>
    <label>Neto ($)<input name="net_clp" type="number" min="0" step="0.01" value={fields.net_clp} onChange={e=>update("net_clp",e.target.value)}/></label>
    <label>IVA ($)<input name="vat_clp" type="number" min="0" step="0.01" value={fields.vat_clp} onChange={e=>update("vat_clp",e.target.value)}/></label>
    <label>Total ($)<input name="total_clp" type="number" min="0" step="0.01" required value={fields.total_clp} onChange={e=>update("total_clp",e.target.value)}/></label>
    <label>Centro de costo<input name="cost_area" maxLength={160} value={fields.cost_area} onChange={e=>update("cost_area",e.target.value)}/></label>
    <label>Solicitud / orden de compra<select name="purchase_id" value={fields.purchase_id} aria-invalid={invalidPurchase||undefined} onChange={e=>update("purchase_id",e.target.value)}><option value="">No aplica</option>{invalidPurchase&&<option value={fields.purchase_id} disabled>Compra no disponible: seleccione nuevamente</option>}{availablePurchases.map(p=><option key={p.id} value={p.id}>{p.order_reference??`SC-${String(p.folio).padStart(5,"0")} (sin OC emitida)`} · {p.title}</option>)}</select></label>
    <label>Servicio<select name="service_id" value={fields.service_id} aria-invalid={invalidService||undefined} onChange={e=>update("service_id",e.target.value)}><option value="">No aplica</option>{invalidService&&<option value={fields.service_id} disabled>Servicio no disponible: seleccione nuevamente</option>}{availableServices.map(s=><option key={s.id} value={s.id}>{serviceFolio(s)}</option>)}</select></label>
    <p className="field-full helper-text">Las compras y servicios disponibles corresponden a la empresa receptora. Al cambiarla, seleccione nuevamente los documentos asociados.</p>
    <label className="field-full">Observaciones<textarea name="notes" rows={2} maxLength={1000} value={fields.notes} onChange={e=>update("notes",e.target.value)}/></label>
    <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={unavailableProfile||invalidPurchase||invalidService}>Registrar factura</SubmitButton></div>
  </form>;
}
