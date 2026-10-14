"use client";

import {useState} from "react";
import {quotePrincipals,quoteUnits} from "@/lib/quote-catalog";

export function QuoteClassification({principal="",segment="",unit,required=true,withUnit=true,filter=false,materials=[],materialId="",purchaseOnly=false,withTax=false,withDescription=false,description=""}:{principal?:string|null;segment?:string|null;unit?:string;required?:boolean;withUnit?:boolean;filter?:boolean;materials?:{id:string;name:string}[];materialId?:string|null;purchaseOnly?:boolean;withTax?:boolean;withDescription?:boolean;description?:string}){
  const [current,setCurrent]=useState(principal??"");
  const [selected,setSelected]=useState(segment??"");
  const [selectedMaterial,setSelectedMaterial]=useState(materialId??"");
  const group=quotePrincipals.find(item=>item.value===current);
  const existingUnit=unit&&!quoteUnits.some(item=>item.value===unit)?unit:"";
  return <>
    <label>Principal<select name="principal" value={current} required={required} onChange={event=>{setCurrent(event.target.value);setSelected("");}}>
      <option value="">{required?"Seleccione una categoría":filter?"Todas las categorías":"Sin clasificar (anterior)"}</option>
      {quotePrincipals.filter(item=>!purchaseOnly||item.value==="compra").map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
    </select></label>
    <label>Segmentación<select name="segment" value={selected} required={required} disabled={!current} onChange={event=>setSelected(event.target.value)}>
      <option value="">{current?filter?"Todas las segmentaciones":"Seleccione un servicio":"Primero seleccione Principal"}</option>
      {group?.segments.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
    </select></label>
    {current==="compra"&&<label className="field-full">Material (maestro de Entrada de material)<select name="material_id" value={selectedMaterial} onChange={event=>setSelectedMaterial(event.target.value)} required={purchaseOnly||withTax}>
      <option value="">{purchaseOnly?"Seleccione el material":"Seleccione si corresponde al catálogo"}</option>
      {materials.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>}
    {withUnit&&(current==="compra"&&(purchaseOnly||withTax)?<label>Unidad<input name="unit" value="kg" readOnly/></label>:<label>Unidad de cobro<select name="unit" key={current} defaultValue={current==="compra"?"kg":unit??"servicio"} required>
      {existingUnit&&<option value={existingUnit}>{existingUnit} (anterior)</option>}
      {quoteUnits.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
    </select></label>)}
    {withDescription&&(current==="compra"&&(purchaseOnly||withTax)?<input name="description" type="hidden" value={materials.find(item=>item.id===selectedMaterial)?.name??"Material del catálogo"}/>:<label className="field-full">Detalle del producto o servicio<input name="description" defaultValue={description} required minLength={2} maxLength={240} placeholder="Material, equipo o alcance específico"/></label>)}
    {withTax&&(current==="compra"?<p className="helper-text field-full">Compra por kilo: el IVA se revisa con Johana antes de entregar. La confirmación se registra en el borrador.</p>:<><label>IVA<select name="vat_rate" defaultValue="0.19"><option value="0.19">19%</option><option value="0">0%</option></select></label><label className="check-row field-full"><input name="taxable" type="checkbox" defaultChecked/> Este concepto está afecto al IVA seleccionado</label></>)}
  </>;
}
