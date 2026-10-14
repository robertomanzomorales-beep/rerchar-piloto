import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {PDFDocument,rgb,type PDFFont,type PDFPage} from "pdf-lib";
import {issuers,quoteFolio,type Quote,type QuoteLine,type PublicQuoteRoute,quoteTotals} from "./quotes";
import {quotePrincipalLabel,quoteSegmentLabel} from "./quote-catalog";
import {categoryName} from "./destination-catalog";

export async function renderQuotePdf(quote:Quote,lines:QuoteLine[],warning="",route:PublicQuoteRoute|null=null){
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const regular=await doc.embedFont(await readFile(resolve(process.cwd(),"public/fonts/montserrat-regular.ttf")),{subset:true});
  const bold=await doc.embedFont(await readFile(resolve(process.cwd(),"public/fonts/montserrat-bold.ttf")),{subset:true});
  const logo=await doc.embedPng(await readFile(resolve(process.cwd(),"public/rerchar-logo-transparente.png")));
  const dark=rgb(0.12,0.18,0.16),green=rgb(0,0.45,0.32),gray=rgb(0.43,0.48,0.46),rule=rgb(0.82,0.87,0.84),pale=rgb(0.96,0.98,0.96);
  const safe=(s:unknown)=>[...String(s??"").normalize("NFC")].map(ch=>/[\u0020-\u024f\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]/.test(ch)?ch:"?").join("");
  const money=(n:number)=>`$${n.toLocaleString("es-CL")}`;
  const fmt=(d:Date|string)=>new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeZone:"UTC"}).format(new Date(d));
  const issuer=issuers[quote.issuer];const totals=quoteTotals(lines,Number(quote.vat_rate));
  const pages:PDFPage[]=[];let page=doc.addPage([595.28,841.89]);pages.push(page);
  function write(text:unknown,x:number,y:number,size=9,font:PDFFont=regular,color=dark){page.drawText(safe(text),{x,y,size,font,color});}
  function fit(text:unknown,font:PDFFont,size:number,width:number){
    let value=safe(text).replace(/\s+/g," ").trim();
    if(font.widthOfTextAtSize(value,size)<=width)return value;
    while(value&&font.widthOfTextAtSize(`${value}...`,size)>width)value=value.slice(0,-1);
    return `${value.trimEnd()}...`;
  }
  function right(text:unknown,rightEdge:number,y:number,size=8,font:PDFFont=regular,color=dark){
    const value=safe(text);page.drawText(value,{x:rightEdge-font.widthOfTextAtSize(value,size),y,size,font,color});
  }
  function wrap(text:unknown,font:PDFFont,size:number,width:number){
    const words=safe(text).split(/\s+/),out:string[]=[];let line="";
    for(const raw of words){
      let word=raw;
      while(font.widthOfTextAtSize(word,size)>width){
        if(line){out.push(line);line="";}
        let chunk="";for(const char of word){if(chunk&&font.widthOfTextAtSize(chunk+char,size)>width)break;chunk+=char;}
        out.push(chunk);word=word.slice(chunk.length);
      }
      const candidate=line?`${line} ${word}`:word;
      if(font.widthOfTextAtSize(candidate,size)>width&&line){out.push(line);line=word;}else line=candidate;
    }
    if(line)out.push(line);return out;
  }
  function header(continuation=false){
    page.drawRectangle({x:0,y:830,width:595.28,height:12,color:green});
    if(quote.issuer==="rerchar")page.drawImage(logo,{x:45,y:755,width:175,height:61});
    else write("E Y J LIMITADA",45,785,17,bold,green);
    write(issuer.name,45,736,9,bold);write(`RUT ${issuer.tax_id}`,45,721,8,regular,gray);
    write(continuation?"COTIZACIÓN · CONTINUACIÓN":"COTIZACIÓN COMERCIAL",350,791,10,bold,green);
    write(quoteFolio(quote),350,763,19,bold);
    page.drawLine({start:{x:45,y:700},end:{x:550,y:700},thickness:1,color:rule});
  }
  header();
  write("CLIENTE",45,679,8,bold,gray);write(fit(quote.client_name,bold,12,300),45,659,12,bold);
  if(quote.client_tax_id)write(`RUT ${quote.client_tax_id}`,45,641,9);
  if(quote.client_address)write(fit(quote.client_address,regular,8,300),45,625,8,regular,gray);
  write("EMISIÓN",360,679,8,bold,gray);write(fmt(quote.issued_on),360,660,9);
  write("VÁLIDA HASTA",360,640,8,bold,gray);write(fmt(quote.valid_until),360,623,9);
  if(warning){page.drawRectangle({x:45,y:603,width:505,height:17,color:rgb(0.99,0.92,0.89)});write(fit(warning,bold,8,490),52,608,8,bold,rgb(0.65,0.18,0.12));}
  page.drawRectangle({x:45,y:545,width:505,height:62,color:pale});
  write("PROPUESTA",59,584,8,bold,green);
  for(const [i,line] of wrap(quote.title,bold,12,470).slice(0,2).entries())write(line,59,564-i*15,12,bold);
  let y=518;
  function tableHeader(){page.drawRectangle({x:45,y:y-6,width:505,height:25,color:green});write("DESCRIPCIÓN",54,y+2,8,bold,rgb(1,1,1));write("CANT.",324,y+2,8,bold,rgb(1,1,1));write("UNITARIO",400,y+2,8,bold,rgb(1,1,1));write("TOTAL",492,y+2,8,bold,rgb(1,1,1));y-=31;}
  tableHeader();
  lines.forEach((line,index)=>{
    const desc=wrap(line.description,regular,8,260).slice(0,3);
    const classified=Boolean(line.segment);
    const destination=line.destination_name?wrap(`${categoryName(line.waste_category)} · ${line.destination_name}`,regular,7,260).slice(0,2):[];
    const height=Math.max(30,desc.length*13+9+(classified?13:0)+destination.length*11);
    if(y-height<145){page=doc.addPage([595.28,841.89]);pages.push(page);header(true);y=684;tableHeader();}
    if(index%2===0)page.drawRectangle({x:45,y:y-height+5,width:505,height,color:pale});
    if(classified)write(fit(`${quotePrincipalLabel(line.principal)} · ${quoteSegmentLabel(line.segment)}`,bold,7.2,260),54,y,7.2,bold,green);
    desc.forEach((part,i)=>write(part,54,y-(classified?13:0)-i*13,8));
    destination.forEach((part,i)=>write(part,54,y-(classified?13:0)-desc.length*13-i*11,7,regular,gray));
    write(fit(`${Number(line.quantity).toLocaleString("es-CL",{maximumFractionDigits:3})} ${line.unit}`,regular,8,69),324,y,8);
    right(money(Number(line.unit_price_clp)),480,y,8);
    right(money(totals.lines[index]),544,y,8,bold);
    y-=height;
  });
  if(y<175){page=doc.addPage([595.28,841.89]);pages.push(page);header(true);y=665;}
  page.drawLine({start:{x:45,y:y+3},end:{x:550,y:y+3},thickness:1,color:rule});
  const taxable=lines.some(line=>line.taxable);
  write("NETO",398,y-18,9,bold);right(money(totals.net),544,y-18,9,bold);
  write(`IVA (${Number(quote.vat_rate)*100}%)`,398,y-38,9);right(money(totals.vat),544,y-38,9);
  page.drawRectangle({x:388,y:y-73,width:162,height:26,color:green});
  write("TOTAL",398,y-64,10,bold,rgb(1,1,1));right(money(totals.total),544,y-64,10,bold,rgb(1,1,1));
  if(!taxable)write("Ítems no afectos a IVA en esta cotización.",45,y-48,8,regular,gray);
  let footerY=y-103;
  if(route){
    const details=[`Origen: ${route.origin}`,`Retiro: ${route.pickup}`,`Destino final: ${route.destination}`,
      `Regreso: ${route.return_to}`,`Circuito revisado: ${Number(route.total_km).toLocaleString("es-CL",{maximumFractionDigits:2})} km`]
      .flatMap(value=>wrap(value,regular,8,490));
    if(footerY-details.length*12<60){page=doc.addPage([595.28,841.89]);pages.push(page);header(true);footerY=680;}
    write("RECORRIDO DEL SERVICIO",45,footerY,8,bold,green);
    details.forEach((line,i)=>write(line,45,footerY-16-i*12,8));
    footerY-=details.length*12+34;
  }
  if(quote.notes){
    const notes=wrap(quote.notes,regular,8,490);
    let noteY=footerY;
    if(noteY-notes.length*12<52){page=doc.addPage([595.28,841.89]);pages.push(page);header(true);noteY=680;}
    write("CONDICIONES Y OBSERVACIONES",45,noteY,8,bold,green);
    notes.forEach((line,i)=>write(line,45,noteY-16-i*12,8));
  }
  for(const [i,p] of pages.entries()){
    p.drawLine({start:{x:45,y:45},end:{x:550,y:45},thickness:1,color:rule});
    p.drawText(safe(`${quoteFolio(quote)} · ${issuer.name} · Página ${i+1} de ${pages.length}`),
      {x:45,y:30,size:7,font:regular,color:gray});
  }
  doc.setTitle(`Cotización ${quoteFolio(quote)} - ${quote.client_name}`);
  doc.setCreator("RERCHAR Industrial Waste Management System");
  return doc.save();
}
