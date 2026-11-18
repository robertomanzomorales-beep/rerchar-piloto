"use client";

import { useState } from "react";
import { createPlanAction, updateAssetAction } from "@/app/continuity-actions";
import type { AssetBrief } from "@/lib/continuity";
import { SubmitButton } from "./Transition";

type FormAsset=Pick<AssetBrief,"id"|"code"|"label"|"reading_unit"|"current_reading"|"has_readings"|"brand"|"model"|"model_year">;
const unitName=(unit:string)=>unit==="horas"?"horas":unit==="km"?"km":"sin lectura";

export function AssetDetailsForm({assets}:{assets:FormAsset[]}) {
  const [assetId,setAssetId]=useState("");
  const asset=assets.find(item=>item.id===assetId);
  const unitLocked=!!asset&&(asset.has_readings||Number(asset.current_reading)>0);
  return <form action={updateAssetAction} className="form-stack compact">
    <label>Activo<select name="asset_id" value={assetId} onChange={event=>setAssetId(event.target.value)} required><option value="">Seleccione</option>{assets.map(item=><option value={item.id} key={item.id}>{item.code} · {item.label}</option>)}</select></label>
    <fieldset key={assetId} className="maintenance-fields" disabled={!asset}>
      <div className="two-fields"><label>Marca<input name="brand" maxLength={90} defaultValue={asset?.brand??""}/></label><label>Modelo<input name="model" maxLength={90} defaultValue={asset?.model??""}/></label></div>
      <div className="two-fields"><label>Año<input name="model_year" type="number" min="1950" max="2100" defaultValue={asset?.model_year??""}/></label><label>Unidad de lectura<select name={unitLocked?undefined:"reading_unit"} defaultValue={asset?.reading_unit??"km"} disabled={unitLocked}><option value="km">Kilómetros</option><option value="horas">Horas</option><option value="sin">Sin lectura</option></select></label></div>
      {unitLocked&&<input name="reading_unit" type="hidden" value={asset!.reading_unit}/>}
    </fieldset>
    <p className="helper-text" role="status">{!asset?"Seleccione un activo para cargar su ficha actual.":unitLocked?`Unidad fija por historial de lecturas. Lectura actual: ${Number(asset.current_reading).toLocaleString("es-CL")} ${unitName(asset.reading_unit)}.`:"La unidad puede configurarse mientras el activo no tenga lecturas registradas."}</p>
    <SubmitButton className="button button-outline" disabled={!asset}>Actualizar ficha</SubmitButton>
  </form>;
}

export function MaintenancePlanForm({assets}:{assets:FormAsset[]}) {
  const [frequency,setFrequency]=useState("fecha");
  const [assetId,setAssetId]=useState("");
  const byDate=frequency==="fecha";
  const asset=assets.find(item=>item.id===assetId);
  const eligible=byDate?assets:assets.filter(item=>item.reading_unit!=="sin");
  return <form action={createPlanAction} className="form-stack compact">
    <label>Activo<select name="asset_id" value={assetId} onChange={event=>setAssetId(event.target.value)} required><option value="">Seleccione</option>{eligible.map(item=><option value={item.id} key={item.id}>{item.code} · {item.label}</option>)}</select></label>
    <label>Nombre de la pauta<input name="title" required minLength={3} maxLength={160} placeholder="Cambio de aceite y filtros"/></label>
    <label>Frecuencia<select name="frequency_kind" value={frequency} onChange={event=>{const next=event.target.value;setFrequency(next);if(next==="lectura"&&asset?.reading_unit==="sin")setAssetId("");}}><option value="fecha">Por fecha</option><option value="lectura">Por kilometraje u horómetro</option></select></label>
    {byDate?<>
      <div className="two-fields"><label>Cada cuántos días<input name="interval_days" type="number" min="1" max="3650" required placeholder="Ej. 180"/></label><label>Próxima fecha<input name="next_due_date" type="date" required/></label></div>
      <label>Alerta previa (días)<input name="lead_days" type="number" min="0" max="365" defaultValue="15" required/></label><input type="hidden" name="lead_reading" value="500"/>
    </>:<>
      <div className="two-fields"><label>Intervalo ({asset?.reading_unit==="horas"?"horas":"km/horas"})<input name="interval_reading" type="number" min="0.01" step="0.01" required placeholder={asset?.reading_unit==="horas"?"Ej. 250":"Ej. 10000"}/></label><label>Próxima lectura<input name="next_due_reading" type="number" min="0" step="0.01" required/></label></div>
      <label>Alerta previa ({asset?.reading_unit==="horas"?"horas":"km/horas"})<input name="lead_reading" type="number" min="0" step="0.01" defaultValue={asset?.reading_unit==="horas"?"25":"500"} key={asset?.reading_unit??"km"} required/></label><input type="hidden" name="lead_days" value="15"/>
    </>}
    <p className="helper-text">{byDate?"La próxima fecha se actualiza al cerrar la orden de trabajo.":"Seleccione un activo con odómetro u horómetro. La próxima lectura se actualiza al cerrar la orden de trabajo."}</p>
    <SubmitButton className="button button-outline" disabled={!asset}>Guardar pauta</SubmitButton>
  </form>;
}
