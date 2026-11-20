"use client";

import {Fragment,useActionState,useEffect,useRef} from "react";
import {addQuoteLineAction,updateQuoteLineAction,updateQuotePresentationAction,quoteUfRateAction} from "@/app/quote-actions";
import {SubmitButton} from "@/components/Transition";
import {QuoteClassification} from "@/components/QuoteClassification";
import {QuoteDestinationFields} from "@/components/QuoteDestinationFields";
import type {QuoteContentState} from "@/lib/quote-content-state";
import type {QuoteDestination} from "@/lib/destinations";
import type {QuoteLine} from "@/lib/quotes";

const initialState:QuoteContentState={error:"",values:{}};

function FormError({state}:{state:QuoteContentState}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!state.error||!ref.current)return;
    const details=ref.current.closest("details");
    if(details)details.open=true;
    ref.current.focus();
  },[state]);
  return state.error?<div ref={ref} tabIndex={-1} role="alert" className="notice notice-error request-form-error">
    <strong>No se pudieron guardar los cambios.</strong><span>{state.error}</span>
    <small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small>
  </div>:null;
}

export function QuotePresentationForm({id,intro,objective,notes}:{id:string;intro:string;objective:string;notes:string}){
  const [state,action]=useActionState(updateQuotePresentationAction,initialState,"/cotizaciones/"+id+"?formulario=presentation#presentacion");
  const values={company_intro:intro,proposal_objective:objective,notes,...state.values};
  return <form action={action} className="form-grid">
    <input type="hidden" name="quote_id" value={id}/><FormError state={state}/>
    <Fragment key={JSON.stringify(state.values)}>
      <label className="field-full">Presentación breve de la empresa<textarea name="company_intro" required minLength={10} maxLength={700} rows={3} defaultValue={values.company_intro}/></label>
      <label className="field-full">Objetivo de esta propuesta<textarea name="proposal_objective" required minLength={10} maxLength={700} rows={3} defaultValue={values.proposal_objective}/></label>
      <label className="field-full">Condiciones y observaciones<textarea name="notes" maxLength={1000} rows={5} defaultValue={values.notes}/></label>
    </Fragment>
    <p className="helper-text field-full">Puede corregir las condiciones del PDF mientras la cotización sea un borrador. Revise el texto si lo pegó desde Word.</p>
    <div className="field-full form-footer"><SubmitButton className="button button-outline">Guardar presentación</SubmitButton></div>
  </form>;
}

export function QuoteUfRateForm({id,rate,on}:{id:string;rate:string;on:string}){
  const [state,action]=useActionState(quoteUfRateAction,initialState,"/cotizaciones/"+id+"?formulario=uf#referencia-uf");
  const values={rate,on,...state.values};
  return <form action={action} className="form-grid">
    <input type="hidden" name="quote_id" value={id}/><FormError state={state}/>
    <Fragment key={JSON.stringify(state.values)}>
      <label>Valor de 1 UF en CLP<input name="rate" type="number" min="1000" max="1000000" step="0.01" required defaultValue={values.rate}/></label>
      <label>Fecha de referencia<input name="on" type="date" required defaultValue={values.on}/></label>
    </Fragment>
    <div className="field-full form-footer"><SubmitButton className="button button-outline">Guardar referencia UF</SubmitButton></div>
  </form>;
}

type LineFormProps={
  id:string;company:"rerchar"|"e_y_j";purchaseOnly:boolean;hasUf:boolean;
  materials:{id:string;name:string}[];destinations:QuoteDestination[];line?:QuoteLine;
};

export function QuoteLineForm({id,company,purchaseOnly,hasUf,materials,destinations,line}:LineFormProps){
  const editing=Boolean(line),kind=editing?"edit":"add";
  const permalink="/cotizaciones/"+id+"?formulario="+kind+(line?"&concepto="+line.id:"")+(editing?"#edicion-conceptos":"#conceptos");
  const [state,action]=useActionState(editing?updateQuoteLineAction:addQuoteLineAction,initialState,permalink);
  const values={
    principal:line?.principal??(purchaseOnly?"compra":""),segment:line?.segment??(purchaseOnly?"compra_metal":""),
    description:line?.description??"",unit:line?.unit??"servicio",material_id:line?.material_id??"",
    waste_category:line?.waste_category??"",destination_id:line?.destination_id??"",quantity:line?.quantity??"",
    currency:line?.currency??"CLP",unit_price_clp:line?(line.currency==="UF"?line.unit_price_uf??"0":line.unit_price_clp):company==="e_y_j"?"0":"",
    line_note:line?.line_note??"",taxable:(line?line.taxable:!purchaseOnly)?"on":"",...state.values,
  };
  return <form action={action} className={editing?"form-grid":"form-stack compact quote-concept-form"}>
    <input type="hidden" name="quote_id" value={id}/>{line&&<input type="hidden" name="line_id" value={line.id}/>}
    <FormError state={state}/>
    {/* Restore the whole field group after a rejected action, including dependent selects. */}
    <Fragment key={JSON.stringify(state.values)}>
      <QuoteClassification principal={values.principal} segment={values.segment} unit={values.unit}
        required={editing?Boolean(line?.principal):true} company={company} materials={materials}
        materialId={values.material_id} purchaseOnly={purchaseOnly} withDescription description={values.description}/>
      <QuoteDestinationFields destinations={destinations} category={values.waste_category} destinationId={values.destination_id}/>
      <label>Cantidad<input name="quantity" type="number" min="0.001" max="100000000" step="0.001" defaultValue={values.quantity} required/></label>
      <label>Moneda<select name="currency" defaultValue={values.currency}><option value="CLP">CLP</option>{hasUf&&!purchaseOnly&&<option value="UF">UF</option>}</select></label>
      {!editing&&company==="e_y_j"?<><input name="unit_price_clp" type="hidden" value="0"/><p className="helper-text">Primero incorpore el servicio; luego calcule ruta y costos antes de editar el precio.</p></>:
        <label>Precio unitario (según moneda)<input name="unit_price_clp" type="number" min="0" max="100000000" step="0.0001" defaultValue={values.unit_price_clp} required/></label>}
      <label className="field-full">Observación del ítem<textarea name="line_note" defaultValue={values.line_note} maxLength={500} rows={2}/></label>
      {!purchaseOnly&&<label className="check-row"><input name="taxable" type="checkbox" defaultChecked={values.taxable==="on"}/> Afecto a IVA</label>}
    </Fragment>
    <div className="field-full form-footer"><SubmitButton className={"button "+(editing?"button-primary":"button-outline")}>{editing?"Guardar corrección":"Añadir a la cotización"}</SubmitButton></div>
  </form>;
}
