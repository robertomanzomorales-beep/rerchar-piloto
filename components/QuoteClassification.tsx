"use client";

import {useState} from "react";
import {quotePrincipals,quoteUnits} from "@/lib/quote-catalog";

export function QuoteClassification({principal="",segment="",unit,required=true,withUnit=true,filter=false}:{principal?:string|null;segment?:string|null;unit?:string;required?:boolean;withUnit?:boolean;filter?:boolean}){
  const [current,setCurrent]=useState(principal??"");
  const [selected,setSelected]=useState(segment??"");
  const group=quotePrincipals.find(item=>item.value===current);
  const existingUnit=unit&&!quoteUnits.some(item=>item.value===unit)?unit:"";
  return <>
    <label>Principal<select name="principal" value={current} required={required} onChange={event=>{setCurrent(event.target.value);setSelected("");}}>
      <option value="">{required?"Seleccione una categoría":filter?"Todas las categorías":"Sin clasificar (anterior)"}</option>
      {quotePrincipals.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
    </select></label>
    <label>Segmentación<select name="segment" value={selected} required={required} disabled={!current} onChange={event=>setSelected(event.target.value)}>
      <option value="">{current?filter?"Todas las segmentaciones":"Seleccione un servicio":"Primero seleccione Principal"}</option>
      {group?.segments.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
    </select></label>
    {withUnit&&<label>Unidad de cobro<select name="unit" defaultValue={unit??"servicio"} required>
      {existingUnit&&<option value={existingUnit}>{existingUnit} (anterior)</option>}
      {quoteUnits.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
    </select></label>}
  </>;
}
