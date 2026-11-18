"use client";

import {useActionState,useEffect,useRef,useState} from "react";
import {createMaterialAction} from "@/app/operation-actions";
import type {MaterialReceiptFormState} from "@/lib/material-receipt-form-state";
import {ReceiptMaterialSelection,type ReceiptMaterialSelectionProps} from "./ReceiptMaterialSelection";
import {SubmitButton} from "./Transition";

export default function MaterialReceiptForm(props:Omit<ReceiptMaterialSelectionProps,"values"|"onRead">){
  const [state,action]=useActionState<MaterialReceiptFormState,FormData>(createMaterialAction,{error:"",values:{}});
  const restored=state.values;
  const [fields,setFields]=useState({kind:restored.kind??"ingreso",movement_on:restored.movement_on??"",
    material_name:restored.material_name??"",supplier_kg:restored.supplier_kg??"",rerchar_kg:restored.rerchar_kg??"",
    impurity_kg:restored.impurity_kg??"0",net_basis:restored.net_basis??"rerchar",net_reported_kg:restored.net_reported_kg??"",
    impurity_report:restored.impurity_report??"",certificate_number:restored.certificate_number??"",
    act_number:restored.act_number??"",invoice_number:restored.invoice_number??"",unit_price_clp:restored.unit_price_clp??"",
    payment_status:restored.payment_status??"pendiente",notes:restored.notes??""});
  const update=(key:keyof typeof fields,value:string)=>setFields(previous=>({...previous,[key]:value}));
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error)errorRef.current?.focus();},[state]);
  return <form action={action} className="form-grid material-receipt-form">
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo registrar el ingreso.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    <label>Tipo<select name="kind" value={fields.kind} onChange={e=>update("kind",e.target.value)}><option value="ingreso">Entrada de material</option><option value="excedente">Excedente RESITER / SPENCE</option></select></label>
    <label>Fecha de movimiento<input data-document-controlled name="movement_on" type="date" required value={fields.movement_on} onChange={e=>update("movement_on",e.target.value)}/></label>
    <ReceiptMaterialSelection {...props} values={restored} onRead={values=>setFields(previous=>({...previous,...Object.fromEntries(
      ["movement_on","material_name","supplier_kg","rerchar_kg","impurity_kg","net_reported_kg"].filter(key=>Object.hasOwn(values,key)).map(key=>[key,values[key as keyof typeof values]]))}))}/>
    <label>Nombre si no figura en catálogo<input data-document-controlled name="material_name" maxLength={180} value={fields.material_name} onChange={e=>update("material_name",e.target.value)}/></label>
    <div className="form-section-title field-full">Pesos de la planilla (kg)</div>
    <label>Peso proveedor<input data-document-controlled name="supplier_kg" type="number" min="0" max="100000000" step="0.01" required={fields.net_basis==="proveedor"} value={fields.supplier_kg} onChange={e=>update("supplier_kg",e.target.value)}/></label>
    <label>Peso RERCHAR<input data-document-controlled name="rerchar_kg" type="number" min="0" max="100000000" step="0.01" required={fields.net_basis==="rerchar"} value={fields.rerchar_kg} onChange={e=>update("rerchar_kg",e.target.value)}/></label>
    <label>Impurezas<input data-document-controlled name="impurity_kg" type="number" min="0" max="100000000" step="0.01" value={fields.impurity_kg} onChange={e=>update("impurity_kg",e.target.value)}/></label>
    <label>Base del neto<select name="net_basis" value={fields.net_basis} onChange={e=>update("net_basis",e.target.value)}><option value="rerchar">Peso RERCHAR − impurezas</option><option value="proveedor">Peso proveedor − impurezas</option></select></label>
    <label>Neto anotado (opcional)<input data-document-controlled name="net_reported_kg" type="number" min="0" max="100000000" step="0.01" value={fields.net_reported_kg} onChange={e=>update("net_reported_kg",e.target.value)}/></label>
    <label>Informe impurezas<input name="impurity_report" maxLength={80} value={fields.impurity_report} onChange={e=>update("impurity_report",e.target.value)}/></label>
    <div className="form-section-title field-full">Documentos y cobro</div>
    <p className="helper-text field-full">En una recepción directa, registre conductor externo, RUT, patente y guía de traslado, guía de origen u hoja de ingreso. El ticket puede agregarse después. Guardar el ingreso aún no suma stock: confírmelo en su ficha tras verificar el peso físico y la propiedad del material.</p>
    <label>Certificado<input name="certificate_number" maxLength={80} value={fields.certificate_number} onChange={e=>update("certificate_number",e.target.value)}/></label>
    <label>Acta<input name="act_number" maxLength={80} value={fields.act_number} onChange={e=>update("act_number",e.target.value)}/></label>
    <label>Factura (si ya existe)<input name="invoice_number" maxLength={80} value={fields.invoice_number} onChange={e=>update("invoice_number",e.target.value)}/></label>
    <label>Precio unitario ($/kg)<input name="unit_price_clp" type="number" min="0" max="100000000" step="0.01" value={fields.unit_price_clp} onChange={e=>update("unit_price_clp",e.target.value)}/></label>
    <label>Estado inicial<select name="payment_status" value={fields.payment_status} onChange={e=>update("payment_status",e.target.value)}><option value="pendiente">Pendiente</option><option value="no_aplica">No aplica</option></select></label>
    <label className="field-full">Observaciones<textarea name="notes" rows={2} maxLength={1000} value={fields.notes} onChange={e=>update("notes",e.target.value)}/></label>
    <div className="field-full form-footer"><SubmitButton className="button button-primary">Registrar ingreso</SubmitButton></div>
  </form>;
}
