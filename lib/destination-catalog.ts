export const wasteCategories=[
  {value:"domiciliario",label:"Domiciliario / asimilable"},
  {value:"reciclable",label:"Reciclable"},
  {value:"chatarra",label:"Chatarra"},
  {value:"rcd",label:"RCD"},
  {value:"industrial_no_peligroso",label:"Industrial no peligroso"},
  {value:"respel",label:"RESPEL"},
] as const;
export const disposalUnits=[{value:"tonelada",label:"tonelada"},{value:"m³",label:"m³"}] as const;
export const facilityTypes=[
  {value:"planta",label:"Planta"},{value:"valorizacion",label:"Centro de valorización"},
  {value:"tratamiento",label:"Tratamiento"},{value:"relleno",label:"Relleno sanitario"},
  {value:"otro",label:"Otro / por confirmar"},
] as const;
export const segmentWasteCategory:Record<string,string>={
  retiro_chatarra:"chatarra",retiro_domiciliario:"domiciliario",retiro_reciclable:"reciclable",
  transporte_respel:"respel",recepcion_chatarra:"chatarra",
};
export const categoryName=(key:string|null)=>wasteCategories.find(item=>item.value===key)?.label??"Sin categoría";
export const destinationNeeded=(segment:string|null)=>Boolean(segment&&(segmentWasteCategory[segment]||segment==="disposicion_final"));
export function destinationDay(value:Date|string|null){return value?new Date(value).toISOString().slice(0,10):"";}
export function destinationAvailability(destination:{status:string;authorization_valid_until:Date|string|null},today:string){
  if(destination.status==="suspendido")return {label:"Suspendido",tone:"suspended"};
  if(destination.status!=="habilitado")return {label:"Pendiente de validar",tone:"pending"};
  const expires=destinationDay(destination.authorization_valid_until);
  return expires&&expires>=today?{label:"Habilitado",tone:"ready"}:{label:expires?"Autorización vencida":"Vigencia pendiente",tone:"expired"};
}
