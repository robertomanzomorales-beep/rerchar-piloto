// Una propuesta puede incluir varios conceptos. Sólo se infiere el tipo de
// solicitud cuando todos los conceptos clasificados comparten el mismo flujo.
export function requestKindFromQuote(kind:"general"|"compra_material",principals:(string|null)[]){
  if(kind==="compra_material")return {category:"compra",serviceType:"compra"} as const;
  const categories=[...new Set(principals.filter((value):value is string=>Boolean(value)))];
  if(categories.length===1&&categories[0]==="arriendo")return {category:"servicios",serviceType:"arriendo"} as const;
  if(categories.length===1&&categories[0]==="retiro")return {category:"retiro",serviceType:"retiro"} as const;
  return {category:"servicios",serviceType:"traslado"} as const;
}
