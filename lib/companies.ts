export const companies = {
  rerchar: { name: "RERCHAR CHILE SPA", short: "RERCHAR", code: "RER" },
  e_y_j: { name: "EMPRESAS DE SERVICIOS INTEGRALES E Y J LIMITADA", short: "E y J", code: "EYJ" },
} as const;

export type Company = keyof typeof companies;

// Las rutas de una empresa conservan su identidad aunque llegue una consulta contradictoria.
export function companyForPath(pathname:string,query:string|null):Company|null {
  const matches=(prefix:string)=>pathname===prefix||pathname.startsWith(`${prefix}/`);
  if(["/empresa/rerchar","/ingresos","/control-guias","/materiales-stock","/seguimiento-guias"].some(matches))return "rerchar";
  if(["/empresa/e_y_j","/estados-pago"].some(matches))return "e_y_j";
  return query==="rerchar"||query==="e_y_j"?query:null;
}

export function companyName(company: Company | null | undefined) {
  return company ? companies[company].name : "Empresa operadora por confirmar";
}

// El número de base de datos sigue siendo único y no se renumera la historia del piloto.
export function serviceFolio(service: { folio: string | number; operating_company?: Company | null }) {
  const number = String(service.folio).padStart(5, "0");
  return service.operating_company ? `${companies[service.operating_company].code}-${number}` : `PIL-${number}`;
}

export function quoteFolio(quote: { folio: string | number; issuer: Company; display_folio?: string | null }) {
  return quote.display_folio ?? `COT-${String(quote.folio).padStart(5, "0")}`;
}
