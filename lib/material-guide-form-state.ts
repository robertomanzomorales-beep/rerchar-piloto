import type {MaterialGuide,MaterialGuideItem} from "./material-guides";

const headerLimits={submission_key:36,guide_number:50,movement_on:10,movement_type:20,counterparty_id:36,
  movement_detail:100,origin:250,destination:250,driver_name:120,truck_plate:30,trailer_plate:30,freight_company:160,
  freight_cost_clp:30,freight_invoice_number:80,freight_guide_reference:80,freight_payment_required:20,freight_invoice_status:20,guide_notes:500} as const;
const itemLimits={item_id:36,line_number:4,material_id:36,material_name:160,origin_ticket:80,origin_kg:30,stock_kg:30,
  departure_ticket:80,destination_ticket:80,arrival_kg:30,returned_kg:30,return_ticket:80,return_kg:30,
  destination_impurity_kg:30,invoice_kg:30,agreed_price_clp:30,invoice_price_clp:30,invoice_number:80,
  invoice_issued_on:10,invoice_status:20,payment_on:10,valued_guide_number:80,notes:500} as const;
const billingLimits={item_id:36,invoice_number:80,issued_on:10,due_on:10,total_clp:30} as const;
const limits={...headerLimits,...itemLimits,...billingLimits};
export const guideHeaderFields=Object.keys(headerLimits) as (keyof typeof headerLimits)[];
export const guideItemFields=Object.keys(itemLimits) as (keyof typeof itemLimits)[];
export const guideBillingFields=Object.keys(billingLimits) as (keyof typeof billingLimits)[];
export type GuideField=keyof typeof limits;
export type GuideDraft=Partial<Record<GuideField,string>>;
export type GuideFormKind="create"|"item"|"header"|"billing";
export type GuideFormState={error:string;values:GuideDraft};
export function materialGuideDraft(kind:GuideFormKind,form:FormData):GuideDraft{
  const keys=kind==="create"?[...guideHeaderFields,...guideItemFields]:kind==="header"?guideHeaderFields:kind==="item"?guideItemFields:guideBillingFields;
  return Object.fromEntries(keys.map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).slice(0,limits[key]):""]));
}
const text=(value:unknown)=>value==null?"":value instanceof Date?value.toISOString().slice(0,10):String(value);
export function guideHeaderDefaults(guide:MaterialGuide|undefined,today:string):GuideDraft{
  const row=(guide??{}) as Record<string,unknown>;
  return {...Object.fromEntries(guideHeaderFields.map(key=>[key,text(row[key==="guide_notes"?"notes":key])])),movement_on:text(guide?.movement_on)||today,movement_type:guide?.movement_type??"venta"};
}
export function guideItemDefaults(item:MaterialGuideItem|undefined,lineNumber=1):GuideDraft{
  const row=(item??{}) as Record<string,unknown>;
  return {...Object.fromEntries(guideItemFields.map(key=>[key,text(row[key])])),item_id:item?.id??"",line_number:String(item?.line_number??lineNumber),material_name:item?.material_id?"":item?.material_name??""};
}
