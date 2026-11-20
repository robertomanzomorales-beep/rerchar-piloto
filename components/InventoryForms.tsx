"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {adjustStockAction,createItemAction,createStockSkuRuleAction,createWarehouseAction,reserveStockAction,transferStockAction,updateItemValuationAction} from "@/app/supply-actions";
import {inventoryFormAnchor,inventoryFormHref,type InventoryContext,type InventoryFormKind,type InventoryFormState,type InventoryValues} from "@/lib/inventory-form-state";
import {SubmitButton} from "./Transition";

const actions={warehouse:createWarehouseAction,item:createItemAction,sku_rule:createStockSkuRuleAction,valuation:updateItemValuationAction,adjust:adjustStockAction,transfer:transferStockAction,reserve:reserveStockAction};
const buttons={warehouse:"Registrar bodega",item:"Registrar artículo",sku_rule:"Configurar categoría",valuation:"Guardar costo",adjust:"Guardar ajuste",transfer:"Transferir stock",reserve:"Reservar disponible"};
const confirmations={warehouse:"Bodega registrada correctamente.",item:"Artículo registrado correctamente.",sku_rule:"Regla de categoría registrada correctamente.",valuation:"Familia y costo actualizados correctamente.",adjust:"Ajuste guardado correctamente.",transfer:"Stock transferido correctamente.",reserve:"Reserva registrada correctamente."};
const initial:Partial<Record<InventoryFormKind,InventoryValues>>={item:{unit:"un",minimum_qty:"0"},adjust:{direction:"entrada"}};
const units=[{id:"un",name:"Unidades"},{id:"kg",name:"Kilogramos"},{id:"lt",name:"Litros"},{id:"m",name:"Metros"},{id:"m3",name:"Metros cúbicos"},{id:"caja_10",name:"Caja x10"},{id:"caja_50",name:"Caja x50"},{id:"pallet",name:"Pallet"},{id:"bolsa_10",name:"Bolsa x10"},{id:"centena",name:"Centena"}];
type Choice={id:string;name:string};
type Item=Choice&{code:string};

export function InventoryForm({kind,context,defaults={},items=[],warehouses=[],categories=[],saved=false}:{kind:InventoryFormKind;context:InventoryContext;defaults?:InventoryValues;items?:Item[];warehouses?:Choice[];categories?:string[];saved?:boolean}){
  const id=defaults.item_id??"";
  const [state,action]=useActionState<InventoryFormState,FormData>(actions[kind],{error:"",values:{},ok:saved},inventoryFormHref(context,kind,id));
  const [fields,setFields]=useState<InventoryValues>(()=>({...initial[kind],...defaults,...state.values}));
  const [edited,setEdited]=useState(false),notice=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!state.error&&!state.ok)return;
    if(state.ok)setFields({...initial[kind],...defaults,...state.values});
    setEdited(false);
    if(state.error){const details=notice.current?.closest("details");if(details)details.open=true;notice.current?.focus();}
  },[state]);
  const input=(name:string)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>{const value=event.target.value;setEdited(true);setFields(previous=>({...previous,[name]:value}));}});
  const picker=(name:string,choices:Choice[],placeholder:string|null="Seleccione")=>{
    const unavailable=Boolean(fields[name]&&!choices.some(choice=>choice.id===fields[name]));
    return <select {...input(name)} required aria-invalid={unavailable||undefined}>{placeholder!==null&&<option value="">{placeholder}</option>}{unavailable&&<option value={fields[name]} disabled>Selección anterior no disponible</option>}{choices.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</select>;
  };
  const stock=["adjust","transfer","reserve"].includes(kind);
  const itemChoices=items.map(item=>({id:item.id,name:`${item.code} · ${item.name}`}));
  const invalidSelection=stock&&Boolean(fields.item_id&&!items.some(item=>item.id===fields.item_id)||(kind==="transfer"?["from_id","to_id"]:["warehouse_id"]).some(name=>fields[name]&&!warehouses.some(warehouse=>warehouse.id===fields[name])));
  const missingResources=stock&&(!items.length||warehouses.length<(kind==="transfer"?2:1));
  const sameWarehouse=kind==="transfer"&&Boolean(fields.from_id&&fields.from_id===fields.to_id);
  const quantity=<label>Cantidad<input {...input("quantity")} type="number" min="0.001" max="100000000" step="0.001" required/></label>;
  const reason=<label>{kind==="reserve"?"Destino o motivo":"Motivo"}<input {...input("reason")} minLength={5} maxLength={500} required placeholder={kind==="reserve"?"Servicio o área que la utilizará":kind==="adjust"?"Inventario inicial, ajuste de conteo…":undefined}/></label>;
  return <form id={inventoryFormAnchor(kind,id)} action={action} className={kind==="reserve"?"form-grid supply-inline inventory-form":"form-stack compact inventory-form"} data-inventory-form={kind} data-inventory-item={kind==="valuation"?id:undefined}>
    <input type="hidden" name="return_to" value={inventoryFormHref(context,kind,id)}/>
    {state.error&&<div ref={notice} role="alert" tabIndex={-1} className="notice notice-error request-form-error field-full"><strong>No se pudo guardar el registro.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    {state.ok&&!edited&&<div ref={notice} role="status" tabIndex={-1} className="notice notice-success field-full">{confirmations[kind]}</div>}
    {kind==="warehouse"&&<div className="two-fields"><label>Código<input {...input("code")} required minLength={2} maxLength={30} placeholder="BOD-01"/></label><label>Nombre<input {...input("name")} required minLength={2} maxLength={120} placeholder="Bodega principal"/></label></div>}
    {kind==="item"&&<><div className="two-fields"><label>Código manual (opcional)<input {...input("code")} minLength={2} maxLength={40} placeholder="Vacío = código automático"/></label><label>Unidad{picker("unit",units,null)}</label></div>
      <label>Descripción<input {...input("name")} required minLength={2} maxLength={160}/></label><label>Categoría<input {...input("category")} maxLength={100} list="sku-categories" placeholder="Repuesto, EPP, insumo…"/></label><datalist id="sku-categories">{categories.map(category=><option key={category} value={category}/>)}</datalist>
      <div className="two-fields"><label>Stock mínimo (cantidad en la unidad elegida)<input {...input("minimum_qty")} type="number" min="0" max="100000000" step="0.001" required/></label><label>Stock máximo (cantidad en la unidad elegida)<input {...input("maximum_qty")} type="number" min={fields.minimum_qty||"0"} max="100000000" step="0.001"/></label></div>
      <label>Costo unitario estimado ($)<input {...input("unit_cost_clp")} type="number" min="0" max="1000000000" step="0.01"/></label></>}
    {kind==="sku_rule"&&<><label>Categoría<input {...input("category")} minLength={2} maxLength={100} required placeholder="Familia de artículos"/></label><label>Prefijo (2 a 10 letras o números)<input {...input("prefix")} minLength={2} maxLength={10} pattern="[A-Za-z0-9]{2,10}" required placeholder="REP"/></label></>}
    {kind==="valuation"&&<><input type="hidden" name="item_id" value={fields.item_id??id}/><label>Familia<input {...input("category")} maxLength={100} placeholder="Repuesto, EPP, insumo…"/></label><label>Costo unitario estimado ($)<input {...input("unit_cost_clp")} type="number" min="0" max="1000000000" step="0.01" placeholder="Sin costo registrado"/></label></>}
    {stock&&<><label>Artículo{picker("item_id",itemChoices)}</label>
      {kind==="adjust"&&<><div className="two-fields"><label>Bodega{picker("warehouse_id",warehouses)}</label><label>Sentido{picker("direction",[{id:"entrada",name:"Ingreso"},{id:"salida",name:"Salida"}],null)}</label></div>{quantity}<label>Referencia documento<input {...input("document_reference")} maxLength={100}/></label><label>Centro de costo<input {...input("cost_center")} maxLength={100}/></label></>}
      {kind==="transfer"&&<><div className="two-fields"><label>Origen{picker("from_id",warehouses)}</label><label>Destino{picker("to_id",warehouses)}</label></div>{quantity}</>}
      {kind==="reserve"&&<><label>Bodega{picker("warehouse_id",warehouses)}</label>{quantity}</>}{reason}
      {missingResources&&<p className="helper-text field-full">{kind==="transfer"?"Se necesitan un artículo y dos bodegas activas para transferir existencias.":"Registre un artículo y una bodega activa antes de continuar."}</p>}
      {sameWarehouse&&<p className="helper-text field-full" role="status">El origen y el destino deben ser bodegas distintas.</p>}
    </>}
    {kind==="reserve"?<div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={missingResources||invalidSelection}>Reservar disponible</SubmitButton></div>:<SubmitButton className="button button-outline" disabled={missingResources||invalidSelection||sameWarehouse}>{buttons[kind]}</SubmitButton>}
  </form>;
}
