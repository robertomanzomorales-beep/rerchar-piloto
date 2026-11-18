export function testRut(body:string){
  let total=0,factor=2;for(const digit of [...body].reverse()){total+=Number(digit)*factor;factor=factor===7?2:factor+1;}
  const dv=11-total%11;return body+"-"+(dv===11?"0":dv===10?"K":dv);
}
export const companyRut=testRut("70000001"),eyjRut=testRut("70000002"),thirdRut=testRut("76000001");
export function dte(options:{type?:number;folio?:string;issuer?:string;receiver?:string;total?:string;name?:string;product?:string}={}){
  const type=options.type??33,exempt=type===34;
  return `<?xml version="1.0" encoding="UTF-8"?><DTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><Documento ID="DOC-${type}-${options.folio??"1"}"><Encabezado><IdDoc><TipoDTE>${type}</TipoDTE><Folio>${options.folio??"1"}</Folio><FchEmis>2026-10-01</FchEmis><FchVenc>2026-10-31</FchVenc></IdDoc><Emisor><RUTEmisor>${options.issuer??companyRut}</RUTEmisor><RznSoc>${options.name??"Emisor de prueba"}</RznSoc></Emisor><Receptor><RUTRecep>${options.receiver??thirdRut}</RUTRecep><RznSocRecep>Receptor de prueba</RznSocRecep></Receptor><Totales>${exempt?"<MntExe>100000</MntExe>":"<MntNeto>100000</MntNeto><IVA>19000</IVA>"}<MntTotal>${options.total??(exempt?"100000":"119000")}</MntTotal></Totales></Encabezado><Detalle><NroLinDet>1</NroLinDet><NmbItem>${options.product??"Servicio de prueba"}</NmbItem><MontoItem>100000</MontoItem></Detalle>${type===61||type===56?"<Referencia><NroLinRef>1</NroLinRef><TpoDocRef>33</TpoDocRef><FolioRef>1</FolioRef><FchRef>2026-10-01</FchRef></Referencia>":""}</Documento></DTE>`;
}
export function envelope(...documents:string[]){return `<EnvioDTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><SetDTE ID="ENVIO">${documents.map(xml=>xml.replace(/<\?xml[^>]*\?>/,"")).join("")}</SetDTE></EnvioDTE>`;}
export const bytes=(text:string)=>Buffer.from(text,"utf8");
