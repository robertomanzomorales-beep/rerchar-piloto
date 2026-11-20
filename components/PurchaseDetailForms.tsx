"use client";

import Link from "next/link";
import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {addPurchaseLineAction,receivePurchaseAction,savePurchaseDraftAction} from "@/app/supply-actions";
import {purchaseDetailAnchor,purchaseDetailFormHref,type PurchaseDetailFormKind,type PurchaseDetailFormState,type PurchaseDetailValues} from "@/lib/purchase-detail-form-state";
import {SubmitButton} from "./Transition";

type Choice={id:string;name:string};
type Line={id:string;code:string;name:string;unit:string;quantity:string;received_qty:string;unit_price_clp:string|null;discount_clp:string};
const actions={line:addPurchaseLineAction,draft:savePurchaseDraftAction,receive:receivePurchaseAction};
const confirmations={line:"Artículo agregado correctamente.",draft:"Borrador guardado sin emitir.",receive:"Recepción guardada y stock actualizado."};

function usePurchaseForm(kind:PurchaseDetailFormKind,id:string,defaults:PurchaseDetailValues,saved=false){
  const [state,action]=useActionState<PurchaseDetailFormState,FormData>(actions[kind],{error:"",values:{},ok:saved},purchaseDetailFormHref(id,kind));
  const [fields,setFields]=useState<PurchaseDetailValues>(()=>({...defaults,...state.values}));
  const [edited,setEdited]=useState(false),notice=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(state.ok)setFields({...defaults});
    setEdited(false);
    if(state.error)notice.current?.focus();
  },[state]);
  const input=(name:string)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>{const value=event.target.value;setEdited(true);setFields(previous=>({...previous,[name]:value}));}});
  const unavailable=(name:string,choices:Choice[])=>Boolean(fields[name]&&!choices.some(choice=>choice.id===fields[name]));
  const picker=(name:string,choices:Choice[],placeholder="Seleccione",required=true)=><select {...input(name)} required={required} aria-invalid={unavailable(name,choices)||undefined}><option value="">{placeholder}</option>{unavailable(name,choices)&&<option value={fields[name]} disabled>Selección anterior no disponible: seleccione nuevamente</option>}{choices.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</select>;
  const feedback=<>{state.error&&<div ref={notice} role="alert" tabIndex={-1} className="notice notice-error request-form-error field-full"><strong>No se pudo guardar el cambio.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}{state.ok&&!edited&&<div role="status" className="notice notice-success field-full">{confirmations[kind]}</div>}</>;
  const form={id:purchaseDetailAnchor(kind),action,"data-purchase-detail-form":kind};
  return {state,fields,input,picker,unavailable,feedback,form};
}

export function PurchaseLineForm({id,items,saved}:{id:string;items:(Choice&{code:string})[];saved:boolean}){
  const {input,picker,unavailable,feedback,form}=usePurchaseForm("line",id,{},saved);
  return <form {...form} className="form-grid supply-inline"><input type="hidden" name="request_id" value={id}/>{feedback}
    <label>Agregar artículo{picker("item_id",items.map(item=>({id:item.id,name:`${item.code} · ${item.name}`})),"Seleccione otro artículo")}</label>
    <label>Cantidad<input {...input("quantity")} type="number" min="0.001" max="100000000" step="0.001" required/></label>
    {!items.length&&<p className="helper-text field-full">No quedan artículos activos por agregar a esta solicitud.</p>}
    <div className="field-full form-footer"><SubmitButton className="button button-outline" disabled={!items.length||unavailable("item_id",items)}>Agregar artículo</SubmitButton></div>
  </form>;
}

export function PurchaseDraftForm({id,defaults,lines,suppliers,profilesReady,canReviewProfiles,saved}:{id:string;defaults:PurchaseDetailValues;lines:Line[];suppliers:Choice[];profilesReady:boolean;canReviewProfiles:boolean;saved:boolean}){
  const initial={...defaults};for(const line of lines){initial[`price_${line.id}`]=line.unit_price_clp??"";initial[`discount_${line.id}`]=line.discount_clp??"0";}
  const {fields,input,picker,unavailable,feedback,form}=usePurchaseForm("draft",id,initial,saved);
  return <form {...form} className="form-grid"><input type="hidden" name="request_id" value={id}/>{feedback}
    <label>Empresa emisora<select {...input("issuer")}><option value="e_y_j">E y J Limitada</option><option value="rerchar">RERCHAR Chile SpA</option></select></label>
    {profilesReady&&<label>Ficha verificada del proveedor{picker("supplier_profile_id",suppliers,"Proveedor manual (sin ficha vinculada)",false)}</label>}
    <label>Proveedor (si es manual)<input {...input("supplier")} maxLength={160}/></label>
    <label>RUT proveedor (si es manual)<input {...input("supplier_tax_id")} maxLength={20}/></label>
    <label>Dirección proveedor (si es manual)<input {...input("supplier_address")} maxLength={250}/></label>
    <label>Contacto proveedor<input {...input("supplier_contact")} maxLength={120}/></label>
    <label>Centro de costo<input {...input("cost_center")} maxLength={120}/></label>
    <label>Condiciones de pago (si es manual)<input {...input("payment_terms")} maxLength={120}/></label>
    {profilesReady&&<p className="helper-text field-full">Al elegir una ficha verificada se toman su razón social, RUT, dirección y plazo de pago. {canReviewProfiles&&<>Puede <Link href="/fichas" className="text-link">revisar las fichas</Link>. </>}Sin ficha, complete proveedor y condiciones manualmente.</p>}
    <label>Fecha esperada<input {...input("expected_date")} type="date"/></label><label>IVA<select {...input("vat_rate")}><option value="0.19">19%</option><option value="0">0%</option></select></label>
    <div className="form-section-title field-full">Precios en CLP por artículo</div>
    {lines.map(line=><div key={line.id} className="two-fields field-full"><label>{line.name} · precio unitario ({Number(line.quantity).toLocaleString("es-CL")} {line.unit})<input {...input(`price_${line.id}`)} type="number" min="0" max="100000000" step="0.01" required/></label><label>Descuento por unidad<input {...input(`discount_${line.id}`)} type="number" min="0" max={fields[`price_${line.id}`]||undefined} step="0.01"/></label></div>)}
    <div className="field-full form-footer"><SubmitButton className="button button-outline" disabled={profilesReady&&unavailable("supplier_profile_id",suppliers)}>Guardar borrador sin emitir</SubmitButton></div>
  </form>;
}

export function PurchaseReceiptForm({id,submissionKey,withoutOrder,needsSupplier,supplier,lines,warehouses,saved}:{id:string;submissionKey:string;withoutOrder:boolean;needsSupplier:boolean;supplier:string;lines:Line[];warehouses:Choice[];saved:boolean}){
  const {state,fields,input,picker,unavailable,feedback,form}=usePurchaseForm("receive",id,{payment_status:"pendiente",supplier},saved);
  const selected=lines.find(line=>line.id===fields.line_id);
  const pending=selected?Math.max(0,Number(selected.quantity)-Number(selected.received_qty)):100000000;
  return <form {...form} className="form-grid"><input type="hidden" name="request_id" value={id}/><input type="hidden" name="submission_key" value={state.error&&state.values.submission_key||submissionKey}/><input type="hidden" name="without_order" value={withoutOrder?"true":"false"}/>{feedback}
    {needsSupplier&&<><label>Empresa compradora<select {...input("issuer")} required><option value="">Seleccione</option><option value="rerchar">RERCHAR Chile SpA</option><option value="e_y_j">E y J Limitada</option></select></label><label>Proveedor<input {...input("supplier")} required minLength={2} maxLength={160}/></label></>}
    <label>Artículo pendiente{picker("line_id",lines.map(line=>({id:line.id,name:`${line.code} · ${line.name} (pendiente: ${(Number(line.quantity)-Number(line.received_qty)).toLocaleString("es-CL",{maximumFractionDigits:3})} ${line.unit})` })),"Seleccione artículo")}</label>
    <label>Bodega de ingreso{picker("warehouse_id",warehouses,"Seleccione bodega")}</label>
    <label>Cantidad recibida<input {...input("quantity")} type="number" min="0.001" max={Math.min(100000000,pending).toFixed(3)} step="0.001" required/></label>
    <label>Número de guía (si existe)<input {...input("guide_number")} required={!withoutOrder} maxLength={80}/></label>
    <label>Factura (opcional)<input {...input("invoice_number")} maxLength={80}/></label>
    <label>Pago<select {...input("payment_status")}><option value="pendiente">Pendiente</option><option value="pagada">Pagada</option></select></label>
    {!warehouses.length&&<p className="helper-text field-full">Registre primero una bodega en <Link href="/inventario">Inventario</Link>.</p>}
    <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!warehouses.length||!lines.length||unavailable("warehouse_id",warehouses)||unavailable("line_id",lines)}>Guardar recepción y actualizar stock</SubmitButton></div>
  </form>;
}
