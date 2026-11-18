export const documentFields={
  movement_on:"Fecha de movimiento",driver_name:"Conductor",driver_tax_id:"RUT del conductor",
  truck_plate:"Patente camión",trailer_plate:"Patente rampla",material_name:"Material",
  origin:"Origen",destination:"Destino",weighing_ticket:"Ticket de pesaje",guide_number:"Número de guía",
  origin_guide:"Guía de origen",transfer_guide:"Guía de traslado",entry_sheet:"Hoja de ingreso",
  gross_kg:"Peso bruto (kg)",tare_kg:"Tara (kg)",net_reported_kg:"Neto del documento (kg)",
  supplier_kg:"Peso proveedor (kg)",rerchar_kg:"Peso RERCHAR (kg)",impurity_kg:"Impurezas (kg)",
} as const;
export type DocumentField=keyof typeof documentFields;
export type DocumentSuggestion={field:DocumentField;value:string;evidence:string};
export type DocumentReading={suggestions:DocumentSuggestion[];warnings:string[];ambiguousFields?:DocumentField[]};
export type DocumentAliases=Partial<Record<DocumentField,readonly DocumentField[]>>;

export function selectDocumentFields(reading:DocumentReading,fields:readonly DocumentField[],aliases:DocumentAliases={}):DocumentReading{
  const suggestions:DocumentSuggestion[]=[],warnings=[...reading.warnings],ambiguous=new Set(reading.ambiguousFields??[]);
  for(const field of new Set(fields)){
    const sources=[field,...(aliases[field]??[])];
    if(sources.some(source=>reading.ambiguousFields?.includes(source))){
      ambiguous.add(field);warnings.push(`${documentFields[field]}: hay valores ambiguos en el respaldo. Complete este campo manualmente.`);continue;
    }
    const candidates=sources.flatMap(source=>reading.suggestions.filter(item=>item.field===source));
    const distinct=new Map<string,DocumentSuggestion>();
    for(const item of candidates)if(!distinct.has(item.value))distinct.set(item.value,item);
    if(distinct.size>1){
      ambiguous.add(field);
      warnings.push(`${documentFields[field]}: aparecen valores distintos (${[...distinct.keys()].join(", ")}). Revise el respaldo y complete el campo manualmente.`);
    }else if(distinct.size===1){
      suggestions.push({...distinct.values().next().value!,field});
    }
  }
  return {suggestions,warnings:[...new Set(warnings)],...(ambiguous.size?{ambiguousFields:[...ambiguous]}:{})};
}
const plain=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
const labels:[DocumentField,string][]=[
  ["movement_on","FECHA(?: DE (?:MOVIMIENTO|PESAJE|EMISION))?"],
  ["driver_name","(?:NOMBRE(?: DEL)? CONDUCTOR|CONDUCTOR|CHOFER)"],
  ["driver_tax_id","(?:R[.]?U[.]?T[.]? (?:DEL )?(?:CONDUCTOR|CHOFER))"],
  ["truck_plate","(?:PATENTE(?: DEL)? CAMION|PATENTE TRACTO|PPU CAMION)"],
  ["trailer_plate","(?:PATENTE(?: DE)? (?:RAMPLA|REMOLQUE)|RAMPLA|REMOLQUE)"],
  ["material_name","(?:MATERIAL|RESIDUO|TIPO DE MATERIAL)"],
  ["origin","(?:ORIGEN|LUGAR DE ORIGEN)"],["destination","(?:DESTINO|LUGAR DE DESTINO)"],
  ["weighing_ticket","(?:TICKET(?: DE PESAJE)?|BOLETA DE PESAJE)"],
  ["origin_guide","GUIA(?: DE)? ORIGEN"],["transfer_guide","GUIA(?: DE)? TRASLADO"],
  ["guide_number","(?:GUIA(?: DE DESPACHO)?(?: ELECTRONICA)?)"],
  ["entry_sheet","HOJA(?: DE)? (?:INGRESO|ENTRADA)"],
  ["gross_kg","(?:PESO BRUTO|BRUTO)"],["tare_kg","(?:PESO TARA|TARA)"],
  ["net_reported_kg","(?:PESO NETO|NETO)"],["supplier_kg","PESO PROVEEDOR"],
  ["rerchar_kg","PESO RERCHAR"],["impurity_kg","(?:PESO IMPUREZAS|IMPUREZAS)"],
];

export function documentWeight(raw:string):string|null{
  const cleaned=raw.trim().replace(/\s/g,"");
  // Formato chileno: punto de miles y coma decimal. También se admiten
  // decimales con punto de uno o dos dígitos; nunca notación exponencial.
  let number:string;
  if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(cleaned))number=cleaned.replace(/\./g,"").replace(",",".");
  else if(/^\d+(?:,\d{1,2})?$/.test(cleaned))number=cleaned.replace(",",".");
  else if(/^\d+\.\d{1,2}$/.test(cleaned))number=cleaned;
  else return null;
  const value=Number(number);
  return Number.isFinite(value)&&value>=0&&value<=1_000_000_000?String(value):null;
}
function date(raw:string){
  const match=raw.match(/^(?:(\d{4})[-/](\d{2})[-/](\d{2})|(\d{2})[-/](\d{2})[-/](\d{4}))(?:\s|$)/);
  if(!match)return null;
  const [year,month,day]=match[1]?[+match[1],+match[2],+match[3]]:[+match[6],+match[5],+match[4]];
  const d=new Date(Date.UTC(year,month-1,day));
  return year>=2000&&year<=2100&&d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?
    `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`:null;
}
function validRut(raw:string){
  const rut=raw.replace(/[.\s]/g,"").toUpperCase();
  if(!/^\d{7,8}-[\dK]$/.test(rut))return null;
  const [digits,dv]=rut.split("-");let sum=0,factor=2;
  for(const digit of [...digits].reverse()){sum+=Number(digit)*factor;factor=factor===7?2:factor+1;}
  const result=11-sum%11,expected=result===11?"0":result===10?"K":String(result);
  return expected===dv?rut:null;
}
export function extractDocumentFields(text:string):DocumentReading{
  if(text.length>100_000)throw new Error("El documento contiene demasiado texto. Separe la guía o ticket que desea revisar.");
  const found=new Map<DocumentField,DocumentSuggestion[]>(),warnings=new Set<string>(),ambiguousFields:DocumentField[]=[];
  for(const original of text.split(/\r?\n/)){
    const line=original.trim();if(!line)continue;
    const normalized=plain(line);
    for(const [field,label] of labels){
      const match=normalized.match(new RegExp(`^${label}(?:\\s*\\((?:KG|KILOS|TON|T)\\))?\\s*(?:N[°ºO.]?\\s*)?(?::|=|#|\\s)\\s*(.+)$`));
      if(!match)continue;
      // Restrict extraction to a labelled value. A generic folio or RUT
      // is not enough to assign the issuer's identity to the driver.
      const offset=match[0].length-match[1].length;
      const raw=line.slice(offset).trim();let value:string|null=raw;
      if(field.endsWith("_kg")){
        const weight=plain(raw).match(/^(\d[\d., ]*?)(?:\s*(KG|KGS|KILOS|KILOGRAMOS|TON|TONELADAS|T))?\s*$/);
        const unit=weight?.[2]??normalized.slice(0,offset).match(/\((KG|KILOS|TON|T)\)/)?.[1];
        value=weight&&unit?documentWeight(weight[1]):null;
        if(value&&/^(TON|TONELADAS|T)$/.test(unit!))value=String(Math.round(Number(value)*1000*100)/100);
        if(value&&Number(value)>1_000_000_000)value=null;
      }else if(field==="movement_on")value=date(raw);
      else if(field==="driver_tax_id")value=validRut(raw);
      else if(field==="truck_plate"||field==="trailer_plate"){
        value=plain(raw).replace(/[.\s-]/g,"");if(!/^(?:[A-Z]{2}\d{4}|[A-Z]{4}\d{2})$/.test(value))value=null;
      }else if(["weighing_ticket","guide_number","origin_guide","transfer_guide","entry_sheet"].includes(field)){
        value=plain(raw).replace(/^(?:N[°ºO.]?|NUMERO)\s*:?\s*/,"").trim();
        if(!/^[A-Z0-9][A-Z0-9/-]{0,49}$/.test(value)||!/[0-9]/.test(value))value=null;
      }else if(raw.length>120||raw.length<2)value=null;
      if(!value){warnings.add(`${documentFields[field]}: no se pudo interpretar con certeza; revise el respaldo.`);continue;}
      const current=found.get(field)??[];
      if(!current.some(item=>item.value===value))current.push({field,value,evidence:line.slice(0,220)});
      found.set(field,current);
      break;
    }
  }
  const suggestions:DocumentSuggestion[]=[];
  for(const [field,items] of found){
    if(items.length===1)suggestions.push(items[0]);
    else{ambiguousFields.push(field);warnings.add(`${documentFields[field]}: aparecen valores distintos (${items.map(i=>i.value).join(", ")}). Seleccione el correcto directamente en el formulario.`);}
  }
  const get=(field:DocumentField)=>suggestions.find(i=>i.field===field)?.value;
  const gross=get("gross_kg"),tare=get("tare_kg"),net=get("net_reported_kg");
  if(gross&&tare&&(Number(tare)>Number(gross)||net&&Math.abs(Number(gross)-Number(tare)-Number(net))>0.02)){
    warnings.add("Bruto, tara y neto no concuerdan. Los pesos requieren cotejo manual.");
    for(let i=suggestions.length-1;i>=0;i--)if(["gross_kg","tare_kg","net_reported_kg"].includes(suggestions[i].field))suggestions.splice(i,1);
  }
  return {suggestions,warnings:[...warnings],...(ambiguousFields.length?{ambiguousFields}:{})};
}
