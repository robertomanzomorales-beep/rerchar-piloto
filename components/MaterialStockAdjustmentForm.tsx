"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {adjustMaterialStockAction} from "@/app/material-stock-actions";
import {materialStockAdjustmentHref,type MaterialStockContext,type MaterialStockFormState,type MaterialStockValues} from "@/lib/material-stock-form-state";
import {SubmitButton} from "./Transition";

export default function MaterialStockAdjustmentForm({catalog,context,today}:{
  catalog:{id:string;name:string;quantity_kg:string}[];context:MaterialStockContext;today:string;
}){
  const [state,action]=useActionState<MaterialStockFormState,FormData>(adjustMaterialStockAction,{error:"",values:{}},materialStockAdjustmentHref(context));
  const [fields,setFields]=useState<MaterialStockValues>(()=>({material_id:context.material??"",kind:"saldo_inicial",occurred_on:today,...state.values}));
  const notice=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error){const details=notice.current?.closest("details");if(details)details.open=true;notice.current?.focus();}},[state]);
  const input=(name:keyof MaterialStockValues)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setFields(previous=>({...previous,[name]:event.target.value}))});
  const available=catalog.some(m=>m.id===fields.material_id),missing=!!fields.material_id&&!available;
  return <form action={action} className="form-grid" data-material-stock-form="adjustment">
    <input type="hidden" name="stock_material" value={context.material??""}/><input type="hidden" name="stock_pagina" value={context.pagina??"1"}/>
    {state.error&&<div ref={notice} role="alert" tabIndex={-1} className="field-full notice notice-error request-form-error"><strong>No se pudo registrar el movimiento.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    <label>Material<select {...input("material_id")} required><option value="">Seleccione un material</option>{missing&&<option value={fields.material_id} disabled>Selección anterior no disponible</option>}{catalog.map(m=><option key={m.id} value={m.id}>{m.name} · {Number(m.quantity_kg).toLocaleString("es-CL",{maximumFractionDigits:2})} kg</option>)}</select></label>
    <label>Movimiento<select {...input("kind")}><option value="saldo_inicial">Saldo inicial conciliado</option><option value="ajuste_entrada">Ajuste de entrada</option><option value="ajuste_salida">Ajuste de salida</option></select></label>
    <label>Cantidad (kg)<input {...input("quantity_kg")} type="number" min="0.01" max="100000000" step="0.01" required/></label>
    <label>Fecha<input {...input("occurred_on")} type="date" required/></label>
    <label>Referencia de respaldo<input {...input("reference")} minLength={3} maxLength={80} required placeholder="Acta de conteo o documento"/></label>
    <label className="field-full">Motivo detallado<textarea {...input("reason")} minLength={10} maxLength={500} required rows={2}/></label>
    {missing&&<p className="field-full helper-text">El material seleccionado ya no está disponible. Seleccione otro material activo antes de registrar el movimiento.</p>}
    {!catalog.length&&<p className="field-full helper-text">No hay materiales activos disponibles para registrar un movimiento.</p>}
    <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!available}>Registrar movimiento</SubmitButton></div>
  </form>;
}
