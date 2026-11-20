"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {saveGuideControlAction} from "@/app/guide-actions";
import {guideControlFieldLimits,type GuideControlValues,type GuideControlState} from "@/lib/service-guide-state";
import {SubmitButton} from "./Transition";
import type {Company} from "@/lib/companies";

type Field=Exclude<keyof GuideControlValues,"control_id">;
const labels:Record<Field,string>={
  guide_number:"Número de guía",line_number:"Número de ítem / material",movement_date:"Fecha",movement_type:"Operación",
  driver_name:"Conductor",truck_plate:"Patente camión",material_name:"Material",origin_ticket:"Ticket faena",
  departure_ticket:"Ticket de salida",origin_kg:"Peso desde faena (kg)",complementary_kg:"Peso complementario desde stock (kg)",
  destination_ticket:"Ticket destino",arrival_kg:"Peso recibido en destino (kg)",returned_impurities_kg:"Impurezas / material devuelto (kg)",
  return_ticket:"Ticket retorno",return_weight_kg:"Peso de retorno (kg)",destination_impurities_kg:"Impureza descontada por destino (kg)",
  invoice_kg:"Peso factura (kg)",agreed_price_clp:"Precio acordado ($/kg)",invoice_price_clp:"Precio facturado ($/kg)",
  invoice_number:"Número factura",invoice_issued_on:"Fecha factura",payment_on:"Fecha pago",valued_guide_number:"Guía valorizada",
  freight_company:"Transportista",freight_invoice_number:"Factura flete",freight_guide_reference:"Guía del transportista",
  freight_payment_required:"Pago flete requerido",notes:"Observaciones",
};
const groups:{id:string;label:string;fields:Field[]}[]=[
  {id:"guia-identificacion",label:"Guía y material",fields:["guide_number","line_number","movement_date","movement_type","driver_name","truck_plate","material_name"]},
  {id:"guia-salida",label:"Salida de origen",fields:["origin_ticket","departure_ticket","origin_kg","complementary_kg"]},
  {id:"guia-llegada",label:"Llegada y retorno",fields:["destination_ticket","arrival_kg","returned_impurities_kg","return_ticket","return_weight_kg"]},
  {id:"guia-factura",label:"Factura y respaldo",fields:["destination_impurities_kg","invoice_kg","agreed_price_clp","invoice_price_clp","invoice_number","invoice_issued_on","payment_on","valued_guide_number"]},
  {id:"guia-flete",label:"Flete asociado",fields:["freight_company","freight_invoice_number","freight_guide_reference","freight_payment_required"]},
];
const dates=new Set<Field>(["movement_date","invoice_issued_on","payment_on"]);
const numbers=new Set<Field>(["line_number","origin_kg","complementary_kg","arrival_kg","returned_impurities_kg","return_weight_kg","destination_impurities_kg","invoice_kg","agreed_price_clp","invoice_price_clp"]);

export default function ServiceGuideForm({id,defaults,company}:{id:string;defaults:GuideControlValues;company:Company|null}){
  const editing=Boolean(defaults.control_id);
  const permalink="/solicitudes/"+id+"/guias"+(editing?"?editar="+defaults.control_id:"")+"#editar";
  const [state,action]=useActionState<GuideControlState,FormData>(saveGuideControlAction,{error:"",values:{}},permalink);
  const [fields,setFields]=useState<GuideControlValues>(()=>({...defaults,...state.values}));
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error)errorRef.current?.focus();},[state]);
  const input=(name:Field)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setFields(previous=>({...previous,[name]:event.target.value}))});
  function field(name:Field){
    if(name==="movement_type")return <label key={name}>{labels[name]}<select {...input(name)}><option value="servicio">Servicio</option><option value="compra">Compra</option><option value="venta">Venta</option><option value="traslado">Traslado</option><option value="otro">Otro</option></select></label>;
    if(name==="freight_payment_required")return <label key={name}>{labels[name]}<select {...input(name)}><option value="">Sin definir</option><option value="si">Sí</option><option value="no">No</option><option value="pendiente">Pendiente</option></select></label>;
    const numeric=numbers.has(name),line=name==="line_number";
    const max=name==="destination_impurities_kg"&&fields.arrival_kg?fields.arrival_kg:line?100:numeric?100000000:undefined;
    return <label key={name}>{labels[name]}<input {...input(name)} type={dates.has(name)?"date":numeric?"number":"text"}
      required={name==="guide_number"||name==="line_number"||name==="movement_date"}
      readOnly={editing&&(name==="guide_number"||name==="line_number")} maxLength={numeric||dates.has(name)?undefined:guideControlFieldLimits[name]}
      min={numeric?line?1:0:undefined} max={max} step={numeric?line?"1":"0.01":undefined}/></label>;
  }
  return <form action={action} className="form-grid service-guide-form">
    <input name="service_id" type="hidden" value={id}/><input name="control_id" type="hidden" value={fields.control_id??""}/>{company==="e_y_j"&&<input name="valued_guide_number" type="hidden" value={fields.valued_guide_number??""}/>}
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error">
      <strong>No se pudo guardar el control de guía.</strong><span>{state.error}</span>
      <small>Los datos ingresados se conservan. Corrija la información e intente nuevamente.</small>
    </div>}
    <nav className="guide-control-nav field-full" aria-label="Secciones del control de guía">
      {groups.map(group=><a key={group.id} href={"#"+group.id}>{group.label}</a>)}
    </nav>
    {groups.map(group=><div className="guide-control-group field-full" key={group.id} id={group.id}>
      <div className="form-section-title field-full">{group.label}</div>{group.fields.filter(name=>name!=="valued_guide_number"||company!=="e_y_j").map(field)}
      {group.id==="guia-salida"&&<p className="helper-text field-full">Para un ítem nuevo, registre al menos un peso de origen, destino o retorno. Los campos vacíos conservan su valor anterior al editar.</p>}
    </div>)}
    <label className="field-full">Observaciones<textarea {...input("notes")} maxLength={500} rows={3}/></label>
    <div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar control de guía</SubmitButton></div>
  </form>;
}
