import {recordPage} from "./record-pagination";

export const maintenanceFields={
  asset:["asset_id","brand","model","model_year","reading_unit"],reading:["asset_id","reading","note"],
  plan:["asset_id","title","frequency_kind","interval_days","next_due_date","interval_reading","next_due_reading","lead_days","lead_reading"],
  hour_plan:["asset_id","template_key","next_due_reading","lead_reading"],
  order:["asset_id","plan_id","incident_id","kind","title","description","scheduled_for","blocks_asset"],
  start:["order_id"],reserve:["order_id","item_id","warehouse_id","quantity","reason"],
  close:["order_id","resolution","supplier","labor_cost","parts_cost","reading"],cancel:["order_id","reason"],
  tire:["code","brand","size","warehouse_id"],move_tire:["tire_id","action","asset_id","position","reason","warehouse_id"],
  report:["asset_id","severity","observed_on","description"],resolve:["id","resolution"],
} as const;
export type MaintenanceFormKind=keyof typeof maintenanceFields;
type Field=(typeof maintenanceFields)[MaintenanceFormKind][number];
export type MaintenanceValues=Partial<Record<Field,string>>;
export type MaintenanceFormState={error:string;values:MaintenanceValues};
const limits:Record<Field,number>={asset_id:36,brand:90,model:90,model_year:10,reading_unit:10,reading:24,note:500,title:160,frequency_kind:10,interval_days:10,next_due_date:10,interval_reading:24,next_due_reading:24,lead_days:10,lead_reading:24,template_key:100,plan_id:36,incident_id:36,kind:20,description:1500,scheduled_for:10,blocks_asset:3,order_id:36,item_id:36,warehouse_id:36,quantity:24,reason:500,resolution:1600,supplier:150,labor_cost:24,parts_cost:24,code:45,size:60,tire_id:36,action:10,position:35,severity:10,observed_on:10,id:36};
export function maintenanceDraft(kind:MaintenanceFormKind,form:FormData):MaintenanceValues{
  return Object.fromEntries(maintenanceFields[kind].map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).slice(0,limits[key]):""]));
}
export const maintenancePageKeys=["pagina","pagina_planes","pagina_ordenes","pagina_averias","pagina_neumaticos"] as const;
export type MaintenancePageKey=(typeof maintenancePageKeys)[number];
const contextKeys=["empresa","averias",...maintenancePageKeys] as const;
export type MaintenanceContext=Partial<Record<(typeof contextKeys)[number],string>>;
export function maintenanceContext(input:MaintenanceContext):MaintenanceContext{
  const result:MaintenanceContext={};
  if(input.empresa==="rerchar"||input.empresa==="e_y_j")result.empresa=input.empresa;
  if(input.averias==="abiertas")result.averias=input.averias;
  for(const key of maintenancePageKeys){const page=recordPage(input[key]);if(page>1)result[key]=String(page);}
  return result;
}
export function maintenanceContextFromForm(form:FormData){return maintenanceContext(Object.fromEntries(contextKeys.map(key=>[key,String(form.get(key)??"")])));}
const anchors:Record<MaintenanceFormKind,string>={asset:"ficha-activo",reading:"lecturas",plan:"crear-pauta",hour_plan:"pautas-horometro",order:"crear-orden",start:"iniciar-orden",reserve:"repuestos-orden",close:"cierre-orden",cancel:"cancelar-orden",tire:"neumaticos",move_tire:"neumaticos",report:"reportar-averia",resolve:"averias"};
export function maintenanceAnchor(kind:MaintenanceFormKind,sourceId=""){
  if(sourceId&&/^[\da-f-]{36}$/i.test(sourceId)){
    if(kind==="move_tire")return `neumatico-${sourceId}`;
    if(kind==="resolve")return `averia-${sourceId}`;
    if(kind==="order")return `ot-${sourceId}`;
  }
  return anchors[kind];
}
export function maintenanceHref(context:MaintenanceContext,anchor="",flags:{ok?:string;error?:string;origen?:string;edicion?:string}={},scope:"maintenance"|"fleet"|string="maintenance"){
  const path=scope==="fleet"?"/flota":/^[\da-f-]{36}$/i.test(scope)?`/mantenimiento/${scope}`:"/mantenimiento";
  const query=new URLSearchParams(maintenanceContext(context) as Record<string,string>);
  for(const [key,value]of Object.entries(flags))if(value)query.set(key,value);
  return `${path}${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
}
