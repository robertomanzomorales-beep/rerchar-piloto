import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {PDFDocument,PDFString,rgb,type PDFFont,type PDFPage} from "pdf-lib";
import {issuers,quoteFolio,type Quote,type QuoteLine,type PublicQuoteRoute,quoteTotals} from "./quotes";
import {quotePrincipalLabel,quoteSegmentLabel} from "./quote-catalog";
import {categoryName} from "./destination-catalog";
import {normalizeQuoteText} from "./quote-text";

export async function renderQuotePdf(quote:Quote,lines:QuoteLine[],warning="",route:PublicQuoteRoute|null=null){
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const regular=await doc.embedFont(await readFile(resolve(process.cwd(),"public/fonts/montserrat-regular.ttf")),{subset:true});
  const bold=await doc.embedFont(await readFile(resolve(process.cwd(),"public/fonts/montserrat-bold.ttf")),{subset:true});
  const isRerchar=quote.issuer==="rerchar";
  const logo=isRerchar?await doc.embedPng(await readFile(resolve(process.cwd(),"public/rerchar-logo-transparente.png"))):null;
  const sicep=isRerchar?await doc.embedPng(await readFile(resolve(process.cwd(),"public/rerchar-sicep.png"))):null;
  const certifications=isRerchar?await doc.embedPng(await readFile(resolve(process.cwd(),"public/rerchar-certificaciones-iso.png"))):null;
  const ink=rgb(0.13,0.19,0.24),muted=rgb(0.39,0.45,0.49),rule=rgb(0.85,0.88,0.90);
  const accent=isRerchar?rgb(0.02,0.59,0.39):rgb(0.15,0.35,0.52);
  const blue=isRerchar?rgb(0.05,0.49,0.68):rgb(0.15,0.35,0.52);
  const pale=rgb(0.95,0.96,0.97),rowFill=rgb(0.982,0.986,0.990),white=rgb(1,1,1);
  const left=45,rightEdge=550,width=rightEdge-left,bottom=isRerchar?148:65;
  const safe=(s:unknown)=>[...normalizeQuoteText(s).replace(/\n/g," ").replace(/\u2011/g,"-")]
    .map(ch=>/[\u0020-\u024f\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]/.test(ch)?ch:"?").join("");
  const money=(n:number)=>`$${n.toLocaleString("es-CL")}`;
  const fmt=(d:Date|string)=>new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeZone:"UTC"}).format(new Date(d));
  const issuer=issuers[quote.issuer],totals=quoteTotals(lines,Number(quote.vat_rate));
  const includesUf=lines.some(line=>line.currency==="UF");
  const pages:PDFPage[]=[];let page=doc.addPage([595.28,841.89]);pages.push(page);
  function write(text:unknown,x:number,y:number,size=8.5,font:PDFFont=regular,color=ink){page.drawText(safe(text),{x,y,size,font,color});}
  function fit(text:unknown,font:PDFFont,size:number,available:number){
    let value=safe(text).replace(/\s+/g," ").trim();
    if(font.widthOfTextAtSize(value,size)<=available)return value;
    while(value&&font.widthOfTextAtSize(`${value}...`,size)>available)value=value.slice(0,-1);
    return `${value.trimEnd()}...`;
  }
  function right(text:unknown,edge:number,y:number,size=8.5,font:PDFFont=regular,color=ink){
    const value=safe(text);write(value,edge-font.widthOfTextAtSize(value,size),y,size,font,color);
  }
  function wrap(text:unknown,font:PDFFont,size:number,available:number){
    const words=safe(text).trim().split(/\s+/),out:string[]=[];let line="";
    for(const raw of words){
      let word=raw;
      while(font.widthOfTextAtSize(word,size)>available){
        if(line){out.push(line);line="";}
        let chunk="";for(const char of word){if(chunk&&font.widthOfTextAtSize(chunk+char,size)>available)break;chunk+=char;}
        out.push(chunk);word=word.slice(chunk.length);
      }
      const candidate=line?`${line} ${word}`:word;
      if(font.widthOfTextAtSize(candidate,size)>available&&line){out.push(line);line=word;}else line=candidate;
    }
    if(line)out.push(line);return out;
  }
  function header(continuation=false){
    if(logo)page.drawImage(logo,{x:left,y:753,width:158,height:158*logo.height/logo.width});
    else {write("E y J",left,777,26,bold,blue);write("SERVICIOS INTEGRALES",left+1,758,7.8,bold,muted);}
    right(continuation?"COTIZACIÓN / CONTINUACIÓN":"COTIZACIÓN COMERCIAL",rightEdge,788,8.2,bold,blue);
    right(quoteFolio(quote),rightEdge,759,18,bold);
    write(issuer.name,left,732,8,bold);write(`RUT ${issuer.tax_id}`,left,717,7.5,regular,muted);
    page.drawLine({start:{x:left,y:705},end:{x:rightEdge,y:705},thickness:0.7,color:rule});
    page.drawLine({start:{x:left,y:705},end:{x:left+38,y:705},thickness:1.5,color:blue});
  }
  let y=0;
  function nextPage(){page=doc.addPage([595.28,841.89]);pages.push(page);header(true);y=684;}
  header();
  write("CLIENTE",left,685,7.3,bold,muted);
  const clientName=wrap(quote.client_name,bold,11.4,310);
  clientName.forEach((part,index)=>write(part,left,665-index*15,11.4,bold));
  let clientY=665-(clientName.length-1)*15-16;
  if(quote.client_tax_id){write(`RUT ${quote.client_tax_id}`,left,clientY,8.1);clientY-=15;}
  if(quote.client_address){
    const address=wrap(quote.client_address,regular,8,310);
    address.forEach((part,index)=>write(part,left,clientY-index*11,8));
    clientY-=address.length*11;
  }
  write("EMISIÓN",398,685,7.3,bold,muted);write(fmt(quote.issued_on),398,668,8.4);
  write("VÁLIDA HASTA",398,650,7.3,bold,muted);write(fmt(quote.valid_until),398,633,8.4);
  y=Math.min(609,clientY-14);
  if(warning){
    page.drawRectangle({x:left,y:y-13,width,height:20,color:rgb(0.995,0.963,0.90)});
    write(fit(warning,bold,7.3,width-16),left+8,y-6,7.3,bold,rgb(0.50,0.35,0.13));y-=35;
  }
  write("PROPUESTA",left,y,7.5,bold,accent);y-=21;
  for(const line of wrap(quote.title,bold,12.5,width)){write(line,left,y,12.5,bold);y-=17;}
  y-=13;
  function presentation(label:string,body:string|null){
    if(!body?.trim())return;
    const paragraphs=normalizeQuoteText(body).split("\n").filter(part=>part.trim());
    if(!paragraphs.length)return;
    const heading=(continuation=false)=>{write(continuation?`${label} (CONTINUACIÓN)`:label,left,y,7.6,bold,blue);y-=17;};
    if(y<bottom+44)nextPage();heading();
    for(const paragraph of paragraphs){
      for(const part of wrap(paragraph,regular,8.3,width)){
        if(y<bottom){nextPage();heading(true);}
        write(part,left,y,8.3);y-=12;
      }
      y-=4;
    }
    y-=14;
  }
  presentation("PRESENTACIÓN DE LA EMPRESA",quote.company_intro);
  presentation("OBJETIVO DE LA PROPUESTA",quote.proposal_objective);
  if(y<bottom+95)nextPage();
  function tableHeader(){
    page.drawRectangle({x:left,y:y-20,width,height:24,color:pale});
    write(quote.commercial_kind==="compra_material"?"MATERIAL / OBSERVACIÓN":"DESCRIPCIÓN",54,y-11,7.5,bold);
    write(quote.commercial_kind==="compra_material"?"KG":"CANT.",324,y-11,7.5,bold);
    right(quote.commercial_kind==="compra_material"?"$/KG":"UNITARIO",480,y-11,7.5,bold);
    right(includesUf?"CLP REF.":"TOTAL",542,y-11,7.5,bold);
    page.drawLine({start:{x:left,y:y-20},end:{x:rightEdge,y:y-20},thickness:0.7,color:rule});y-=36;
  }
  tableHeader();
  lines.forEach((line,index)=>{
    const desc=wrap(line.description,regular,8.2,260),classified=Boolean(line.segment);
    const destination=line.destination_name?wrap(`${categoryName(line.waste_category)} · ${line.destination_name}`,regular,7,260):[];
    const observation=line.line_note?wrap(`Obs.: ${line.line_note}`,regular,7,260):[];
    const height=Math.max(36,desc.length*12+12+(classified?12:0)+destination.length*10.5+observation.length*10.5);
    if(y-height<bottom+8){nextPage();tableHeader();}
    if(index%2===0)page.drawRectangle({x:left,y:y-height+10,width,height,color:rowFill});
    if(classified)write(fit(`${quotePrincipalLabel(line.principal)} · ${quoteSegmentLabel(line.segment)}`,bold,6.9,260),54,y,6.9,bold,muted);
    desc.forEach((part,i)=>write(part,54,y-(classified?12:0)-i*12,8.2));
    destination.forEach((part,i)=>write(part,54,y-(classified?12:0)-desc.length*12-i*10.5,7,regular,muted));
    observation.forEach((part,i)=>write(part,54,y-(classified?12:0)-desc.length*12-destination.length*10.5-i*10.5,7,regular,muted));
    write(fit(`${Number(line.quantity).toLocaleString("es-CL",{maximumFractionDigits:3})} ${line.unit}`,regular,8.2,69),324,y,8.2);
    right(line.currency==="UF"?`${Number(line.unit_price_uf).toLocaleString("es-CL",{maximumFractionDigits:4})} UF`:money(Number(line.unit_price_clp)),480,y,8.2);
    right(money(totals.lines[index]),542,y,8.2,bold);
    page.drawLine({start:{x:left,y:y-height+10},end:{x:rightEdge,y:y-height+10},thickness:0.4,color:rule});y-=height;
  });
  y-=8;if(y<bottom+105)nextPage();
  page.drawLine({start:{x:left,y:y+8},end:{x:rightEdge,y:y+8},thickness:0.7,color:rule});
  write("NETO",397,y-11,8,regular,muted);right(money(totals.net),542,y-11,8.5,bold);
  write(`IVA (${Number(quote.vat_rate)*100}%)`,397,y-29,8,regular,muted);right(money(totals.vat),542,y-29,8.5);
  page.drawRectangle({x:385,y:y-66,width:165,height:26,color:ink});
  write("TOTAL",397,y-57,9,bold,white);right(money(totals.total),542,y-57,10.2,bold,white);
  const pending=quote.commercial_kind==="compra_material"&&quote.tax_review_status==="pendiente";
  const taxNote=pending?"Valores netos según planilla; tratamiento tributario por revisar.":!lines.some(line=>line.taxable)?"IVA aplicado: 0% según revisión registrada.":"";
  wrap(taxNote,regular,7,310).forEach((part,i)=>write(part,left,y-18-i*10,7,regular,muted));
  let footerY=y-95;
  if(includesUf){
    const reference=`Valores UF pactados por concepto. Equivalencia referencial: 1 UF = ${money(Number(quote.uf_rate_clp))} CLP al ${fmt(quote.uf_rate_on!)}. Totales CLP de referencia.`;
    const parts=wrap(reference,regular,8,width);
    if(footerY-parts.length*12<bottom){nextPage();footerY=y;}
    parts.forEach((part,i)=>write(part,left,footerY-i*12,8));footerY-=parts.length*12+17;
  }
  if(route){
    const km=(value:string)=>`${Number(value).toLocaleString("es-CL",{maximumFractionDigits:2})} km`;
    const details=[`Origen: ${route.origin}`,`Retiro: ${route.pickup}`,`Destino final: ${route.destination}`,
      `Regreso: ${route.return_to}`,`Planta a retiro: ${km(route.pickup_km)} · Retiro a destino: ${km(route.destination_km)}`,
      `Destino a planta: ${km(route.return_km)} · Circuito total: ${km(route.total_km)}`].flatMap(value=>wrap(value,regular,8,width));
    const routeLink=route.route_url.startsWith("https://www.google.com/maps/dir/")?route.route_url:null;
    const space=details.length*12+34+(routeLink?18:0);
    if(footerY-space<bottom){nextPage();footerY=y;}
    write("RECORRIDO DEL SERVICIO",left,footerY,7.6,bold,blue);
    details.forEach((part,i)=>write(part,left,footerY-16-i*12,8));
    if(routeLink){
      const label="Ver recorrido de referencia en Google Maps",linkY=footerY-16-details.length*12;
      write(label,left,linkY,8,regular,blue);
      const action=doc.context.obj({S:"URI",URI:PDFString.of(routeLink)});
      page.node.addAnnot(doc.context.register(doc.context.obj({Type:"Annot",Subtype:"Link",
        Rect:[left,linkY-3,left+regular.widthOfTextAtSize(label,8),linkY+10],Border:[0,0,0],A:action})));
    }
    footerY-=space;
  }
  if(quote.notes?.trim()){
    let noteY=footerY;
    function nextNotesPage(){nextPage();noteY=y;}
    function notesHeading(continuation=false){
      if(noteY<bottom+29)nextNotesPage();
      write(continuation?"CONDICIONES Y OBSERVACIONES (CONTINUACIÓN)":"CONDICIONES Y OBSERVACIONES",left,noteY,7.6,bold,blue);noteY-=17;
    }
    notesHeading();
    for(const paragraph of normalizeQuoteText(quote.notes).split("\n")){
      if(!paragraph.trim()){noteY-=7;continue;}
      for(const part of wrap(paragraph,regular,8,width)){
        if(noteY<bottom){nextNotesPage();notesHeading(true);}
        write(part,left,noteY,8);noteY-=12;
      }
    }
  }
  for(const [i,p] of pages.entries()){
    if(sicep&&certifications){
      p.drawLine({start:{x:left,y:126},end:{x:rightEdge,y:126},thickness:0.6,color:rule});
      p.drawImage(sicep,{x:52,y:66,width:92,height:92*sicep.height/sicep.width});
      p.drawLine({start:{x:181,y:68},end:{x:181,y:109},thickness:0.5,color:rule});
      p.drawImage(certifications,{x:220,y:59,width:330,height:330*certifications.height/certifications.width});
    }
    p.drawLine({start:{x:left,y:45},end:{x:rightEdge,y:45},thickness:0.6,color:rule});
    p.drawText(fit(`${quoteFolio(quote)} · ${issuer.name}`,regular,6.5,410),{x:left,y:30,size:6.5,font:regular,color:muted});
    const pagination=`Página ${i+1} de ${pages.length}`;
    p.drawText(pagination,{x:rightEdge-regular.widthOfTextAtSize(pagination,6.5),y:30,size:6.5,font:regular,color:muted});
  }
  doc.setTitle(`Cotización ${quoteFolio(quote)} - ${quote.client_name}`);
  doc.setCreator("Plataforma operativa · RERCHAR y E y J");return doc.save();
}
