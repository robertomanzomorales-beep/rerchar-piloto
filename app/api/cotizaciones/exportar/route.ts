import {getActor} from "@/lib/auth";
import {chileCsvDay} from "@/lib/chile-csv";
import {quoteFolio} from "@/lib/companies";
import {quotePrincipalLabel,quoteSegmentLabel} from "@/lib/quote-catalog";
import {QuoteError,reportQuoteLines} from "@/lib/quotes";

const csv=(value:string|number|null|undefined)=>{
  const raw=String(value??"");
  const safe=/^[=+\-@\t\r]/.test(raw)?`'${raw}`:raw;
  return `"${safe.replaceAll('"','""')}"`;
};

export async function GET(request:Request){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  if(actor.role==="conductor")return new Response("Sin permiso",{status:403});
  const params=new URL(request.url).searchParams;
  let rows;
  try{rows=await reportQuoteLines(actor,params.get("empresa")??"",params.get("principal")??"",params.get("segment")??"");}
  catch(error){if(error instanceof QuoteError)return new Response(error.message,{status:400});throw error;}
  const header=["Folio","Empresa emisora","Cliente","Propuesta","Estado","Emisión","Principal","Segmentación","Detalle","Cantidad","Unidad","Unitario CLP","Neto línea CLP","IVA línea CLP","Total línea CLP"];
  const lines=[header.map(csv).join(";")];
  for(const row of rows){
    const net=Math.round(Number(row.quantity)*Number(row.unit_price_clp));
    const vat=row.taxable?Math.round(net*Number(row.vat_rate)):0;
    lines.push([quoteFolio(row),row.issuer==="rerchar"?"RERCHAR":"E y J",row.client_name,row.title,row.status,
      row.issued_on instanceof Date?row.issued_on.toISOString().slice(0,10):String(row.issued_on).slice(0,10),
      row.principal?quotePrincipalLabel(row.principal):"",row.segment?quoteSegmentLabel(row.segment):"",
      row.description,row.quantity,row.unit,row.unit_price_clp,net,vat,net+vat].map(csv).join(";"));
  }
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`,{headers:{
    "Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":`attachment; filename="cotizaciones-${chileCsvDay()}.csv"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
}
