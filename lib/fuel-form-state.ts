import {recordPage} from "./record-pagination";

export const fuelFields=["submission_key","asset_id","driver_id","service_id","fuel_date","liters","cost_clp","reading","full_tank","supplier","receipt_number","notes"] as const;
export type FuelValues=Partial<Record<(typeof fuelFields)[number],string>>;
export type FuelFormState={error:string;values:FuelValues;canRenew?:boolean};
const limits:Record<(typeof fuelFields)[number],number>={submission_key:36,asset_id:36,driver_id:36,service_id:36,fuel_date:10,liters:24,cost_clp:24,reading:24,full_tank:3,supplier:160,receipt_number:80,notes:1000};
export function fuelDraft(form:FormData):FuelValues{return Object.fromEntries(fuelFields.map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,limits[key]):""]));}
export type FuelContext={empresa?:string;pagina?:string;activo?:string};
const validId=(id?:string)=>!!id&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);
export function fuelContext(input:FuelContext):FuelContext{
  const result:FuelContext={};if(input.empresa==="rerchar"||input.empresa==="e_y_j")result.empresa=input.empresa;
  const page=recordPage(input.pagina);if(page>1)result.pagina=String(page);if(validId(input.activo))result.activo=input.activo!.toLowerCase();return result;
}
export function fuelContextFromForm(form:FormData){return fuelContext(Object.fromEntries(["empresa","pagina","activo"].map(key=>[key,String(form.get(key)??"")])));}
export function fuelHref(context:FuelContext,anchor="",flags:{ok?:string;error?:string}={}){
  const query=new URLSearchParams(fuelContext(context) as Record<string,string>);for(const [key,value]of Object.entries(flags))if(value)query.set(key,value);
  return `/combustible${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
}
