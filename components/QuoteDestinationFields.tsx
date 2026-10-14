"use client";

import {useState} from "react";
import type {QuoteDestination} from "@/lib/destinations";
import {wasteCategories,categoryName} from "@/lib/destination-catalog";

export function QuoteDestinationFields({destinations,category="",destinationId=""}:{destinations:QuoteDestination[];category?:string|null;destinationId?:string|null}){
  const [selected,setSelected]=useState(destinationId??"");
  const destination=destinations.find(item=>item.id===selected);
  return <>
    <label>Tipo de residuo o material<select name="waste_category" defaultValue={category??""}>
      <option value="">No aplica / por definir</option>{wasteCategories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
    </select></label>
    <label>Destino final / planta receptora<select name="destination_id" value={selected} onChange={event=>setSelected(event.target.value)}>
      <option value="">Sin destino por ahora</option>{destinations.map(d=><option key={d.id} value={d.id}>{d.name}{d.status==="habilitado"?"":" · pendiente"}</option>)}
    </select></label>
    {destination&&<p className="helper-text field-full">{destination.status==="habilitado"?"Residuos admitidos":"Destino pendiente de autorización"}: {destination.accepted_categories.length?destination.accepted_categories.map(categoryName).join(", "):"ninguno validado"}. {destination.commune??""}</p>}
  </>;
}
