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
  const logo=quote.issuer==="rerchar"?await doc.embedPng(await readFile(resolve(process.cwd(),"public/rerchar-logo-transparente.png"))):null;
  const dark=rgb(0.12,0.18,0.16),green=rgb(0,0.45,0.32),gray=rgb(0.43,0.48,0.46),rule=rgb(0.82,0.87,0.84),pale=rgb(0.96,0.98,0.96);
  const safe=(s:unknown)=>[...String(s??"").normalize("NFC").replace(/\r\n?|\n|\u2028|\u2029|\t/g," ").replace(/\u2011/g,"-")]
    .map(ch=>/[\u0020-\u024f\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]/.test(ch)?ch:"?").join("");
  const money=(n:number)=>`$${n.toLocaleString("es-CL")}`;
  const fmt=(d:Date|string)=>new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeZone:"UTC"}).format(new Date(d));
  const issuer=issuers[quote.issuer];const totals=quoteTotals(lines,Number(quote.vat_rate));
  const includesUf=lines.some(line=>line.currency==="UF");
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
    const words=safe(text).trim().split(/\s+/),out:string[]=[];let line="";
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
    if(logo)page.drawImage(logo,{x:45,y:755,width:175,height:61});
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
  const pending=quote.commercial_kind==="compra_material"&&quote.tax_review_status==="pendiente";
  if(warning){page.drawRectangle({x:45,y:603,width:505,height:17,color:rgb(0.99,0.92,0.89)});write(fit(warning,bold,8,490),52,608,8,bold,rgb(0.65,0.18,0.12));}
  const titleLines=wrap(quote.title,bold,12,470);
  const proposalTop=warning?591:607,proposalHeight=Math.max(62,36+titleLines.length*15);
  page.drawRectangle({x:45,y:proposalTop-proposalHeight,width:505,height:proposalHeight,color:pale});
  write("PROPUESTA",59,proposalTop-23,8,bold,green);
  for(const [i,line] of titleLines.entries())write(line,59,proposalTop-43-i*15,12,bold);
  let y=proposalTop-proposalHeight-23;
  function presentation(label:string,body:string|null){
    if(!body?.trim())return;
    const paragraphs=body.split(/\r\n?|\n|\u2028|\u2029/).filter(part=>part.trim());
    if(!paragraphs.length)return;
    function nextPage(continuation=false){
      page=doc.addPage([595.28,841.89]);pages.push(page);header(true);y=682;
      if(continuation){write(`${label} (CONTINUACIÓN)`,45,y,8,bold,green);y-=18;}
    }
    if(y<115)nextPage();
    write(label,45,y,8,bold,green);y-=18;
    for(const paragraph of paragraphs){
      for(const part of wrap(paragraph,regular,8.5,496)){
        if(y<88)nextPage(true);
        write(part,49,y,8.5);y-=12;
      }
      y-=5;
    }
    y-=12;
  }
  presentation("RESEÑA DE LA EMPRESA",quote.company_intro);
  presentation("OBJETIVO DE LA PROPUESTA",quote.proposal_objective);
  if(y<195){page=doc.addPage([595.28,841.89]);pages.push(page);header(true);y=684;}
  function tableHeader(){page.drawRectangle({x:45,y:y-6,width:505,height:25,color:green});write(quote.commercial_kind==="compra_material"?"MATERIAL / OBSERVACIÓN":"DESCRIPCIÓN",54,y+2,8,bold,rgb(1,1,1));write(quote.commercial_kind==="compra_material"?"KG":"CANT.",324,y+2,8,bold,rgb(1,1,1));write(quote.commercial_kind==="compra_material"?"$/KG":"UNITARIO",400,y+2,8,bold,rgb(1,1,1));write(includesUf?"CLP REF.":"TOTAL",492,y+2,8,bold,rgb(1,1,1));y-=31;}
  tableHeader();
  lines.forEach((line,index)=>{
    const desc=wrap(line.description,regular,8,260);
    const classified=Boolean(line.segment);
    const destination=line.destination_name?wrap(`${categoryName(line.waste_category)} · ${line.destination_name}`,regular,7,260):[];
    const observation=line.line_note?wrap(`Obs.: ${line.line_note}`,regular,7,260):[];
    const height=Math.max(30,desc.length*13+9+(classified?13:0)+destination.length*11+observation.length*11);
    if(y-height<145){page=doc.addPage([595.28,841.89]);pages.push(page);header(true);y=684;tableHeader();}
    if(index%2===0)page.drawRectangle({x:45,y:y-height+5,width:505,height,color:pale});
    if(classified)write(fit(`${quotePrincipalLabel(line.principal)} · ${quoteSegmentLabel(line.segment)}`,bold,7.2,260),54,y,7.2,bold,green);
    desc.forEach((part,i)=>write(part,54,y-(classified?13:0)-i*13,8));
    destination.forEach((part,i)=>write(part,54,y-(classified?13:0)-desc.length*13-i*11,7,regular,gray));
    observation.forEach((part,i)=>write(part,54,y-(classified?13:0)-desc.length*13-destination.length*11-i*11,7,regular,gray));
    write(fit(`${Number(line.quantity).toLocaleString("es-CL",{maximumFractionDigits:3})} ${line.unit}`,regular,8,69),324,y,8);
    right(line.currency==="UF"?`${Number(line.unit_price_uf).toLocaleString("es-CL",{maximumFractionDigits:4})} UF`:money(Number(line.unit_price_clp)),480,y,8);
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
  if(pending)write("Valores netos según planilla; tratamiento tributario por revisar.",45,y-48,7,regular,gray);
  else if(!taxable)write("IVA aplicado: 0% según revisión registrada.",45,y-48,8,regular,gray);
  let footerY=y-103;
  if(includesUf){
    const reference=`Valores UF pactados por concepto. Equivalencia referencial: 1 UF = ${money(Number(quote.uf_rate_clp))} CLP al ${fmt(quote.uf_rate_on!)}. Totales CLP de referencia.`;
    const parts=wrap(reference,regular,8,490);
    if(footerY-parts.length*12<60){page=doc.addPage([595.28,841.89]);pages.push(page);header(true);footerY=680;}
    parts.forEach((part,i)=>write(part,45,footerY-i*12,8));footerY-=parts.length*12+17;
  }
  if(route){
    const details=[`Origen: ${route.origin}`,`Retiro: ${route.pickup}`,`Destino final: ${route.destination}`,
      `Regreso: ${route.return_to}`,`Circuito revisado: ${Number(route.total_km).toLocaleString("es-CL",{maximumFractionDigits:2})} km`]
      .flatMap(value=>wrap(value,regular,8,490));
    if(footerY-details.length*12<60){page=doc.addPage([595.28,841.89]);pages.push(page);header(true);footerY=680;}
    write("RECORRIDO DEL SERVICIO",45,footerY,8,bold,green);
    details.forEach((line,i)=>write(line,45,footerY-16-i*12,8));
    footerY-=details.length*12+34;
  }
  if(quote.notes?.trim()){
    let noteY=footerY;
    function nextNotesPage(){page=doc.addPage([595.28,841.89]);pages.push(page);header(true);noteY=680;}
    function notesHeading(continuation=false){
      if(noteY<92)nextNotesPage();
      write(continuation?"CONDICIONES Y OBSERVACIONES (CONTINUACIÓN)":"CONDICIONES Y OBSERVACIONES",45,noteY,8,bold,green);
      noteY-=18;
    }
    notesHeading();
    for(const paragraph of quote.notes.split(/\r\n?|\n|\u2028|\u2029/)){
      if(!paragraph.trim()){noteY-=7;continue;}
      for(const line of wrap(paragraph,regular,8,490)){
        if(noteY<60){nextNotesPage();notesHeading(true);}
        write(line,45,noteY,8);noteY-=12;
      }
    }
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
