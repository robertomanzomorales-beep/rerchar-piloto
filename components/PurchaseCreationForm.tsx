"use client";

import Link from "next/link";
import {useActionState,useEffect,useRef,useState} from "react";
import {createPurchaseAction} from "@/app/supply-actions";
import type {PurchaseFormState} from "@/lib/purchase-form-state";
import {SubmitButton} from "./Transition";

type Item={id:string;code:string;name:string;unit:string};
export default function PurchaseCreationForm({items,submissionKey,permalink}:{items:Item[];submissionKey:string;permalink:string}){
  const [state,action]=useActionState<PurchaseFormState,FormData>(createPurchaseAction,{error:"",values:{}},permalink);
  const restored=state.values;
  const [fields,setFields]=useState({title:restored.title??"",category:restored.category??"repuestos",priority:restored.priority??"normal",
    item_id:restored.item_id??"",quantity:restored.quantity??"",notes:restored.notes??""});
  const update=(key:keyof typeof fields,value:string)=>setFields(previous=>({...previous,[key]:value}));
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error)errorRef.current?.focus();},[state]);
  const invalidItem=Boolean(fields.item_id&&!items.some(item=>item.id===fields.item_id));
  return <form action={action} className="form-stack purchase-creation-form">
    <input type="hidden" name="submission_key" value={restored.submission_key||submissionKey}/>
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo crear la solicitud.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    <label>Qué se necesita<input name="title" required minLength={3} maxLength={180} placeholder="Ej. Repuestos para flota" value={fields.title} onChange={e=>update("title",e.target.value)}/></label>
    <div className="two-fields"><label>Categoría<select name="category" value={fields.category} onChange={e=>update("category",e.target.value)}><option value="repuestos">Repuestos</option><option value="insumos">Insumos</option><option value="seguridad">Seguridad</option><option value="servicios">Servicios</option><option value="operacion">Operación</option><option value="otros">Otros</option></select></label>
      <label>Criticidad<select name="priority" value={fields.priority} onChange={e=>update("priority",e.target.value)}><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label></div>
    <label>Artículo<select name="item_id" required value={fields.item_id} aria-invalid={invalidItem||undefined} onChange={e=>update("item_id",e.target.value)}><option value="">Seleccione un artículo</option>{invalidItem&&<option value={fields.item_id} disabled>Artículo no disponible: seleccione nuevamente</option>}{items.map(item=><option value={item.id} key={item.id}>{item.code} · {item.name} ({item.unit})</option>)}</select></label>
    <label>Cantidad<input name="quantity" type="number" min="0.001" max="100000000" step="0.001" required value={fields.quantity} onChange={e=>update("quantity",e.target.value)}/></label>
    <label>Justificación y observaciones<textarea name="notes" rows={3} maxLength={2000} placeholder="Uso previsto y antecedentes" value={fields.notes} onChange={e=>update("notes",e.target.value)}/></label>
    {!items.length&&<p className="helper-text">Primero registre un artículo en <Link href="/inventario">Inventario</Link>.</p>}
    <SubmitButton className="button button-primary" disabled={!items.length||invalidItem}>Crear solicitud</SubmitButton>
  </form>;
}
