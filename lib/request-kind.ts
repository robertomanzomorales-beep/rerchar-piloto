// Una propuesta puede incluir varios conceptos. Sólo se infiere el tipo de
// solicitud cuando todos los conceptos clasificados comparten el mismo flujo.
export function requestTypesFromQuote(kind:"general"|"compra_material",principals:(string|null)[]):("compra"|"arriendo"|"retiro"|"traslado")[]{
  if(kind==="compra_material")return ["compra"];
  const types=new Set<"arriendo"|"retiro"|"traslado">();
  for(const principal of principals){
    if(principal==="arriendo")types.add("arriendo");
    else if(principal==="retiro")types.add("retiro");
    else if(principal)types.add("traslado");
  }
  // Las propuestas anteriores no clasificaban sus conceptos. El usuario elige
  // el flujo; el título libre no determina si corresponde traslado o arriendo.
  if(!types.size)return ["traslado","arriendo","retiro"];
  return [...types];
}
export function requestKindFromQuote(kind:"general"|"compra_material",principals:(string|null)[]){
  if(kind==="compra_material")return {category:"compra",serviceType:"compra"} as const;
  const types=requestTypesFromQuote(kind,principals);
  if(types.length===1&&types[0]==="arriendo")return {category:"servicios",serviceType:"arriendo"} as const;
  if(types.length===1&&types[0]==="retiro")return {category:"retiro",serviceType:"retiro"} as const;
  if(!types.includes("traslado"))return types.includes("arriendo")?{category:"servicios",serviceType:"arriendo"} as const:{category:"retiro",serviceType:"retiro"} as const;
  return {category:"servicios",serviceType:"traslado"} as const;
}
