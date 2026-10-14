import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {PDFDocument,rgb,type PDFFont,type PDFPage} from "pdf-lib";
import type {Statement,Operation,StatementTotals} from "./payment-statements";

const dateOnly=(value:Date|string|null)=>value==null?"":value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const formatDate=(value:Date|string|null)=>value?new Intl.DateTimeFormat("es-CL",{
  day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(`${dateOnly(value)}T12:00:00Z`)):"—";
const number=(value:string|number|null,max=2)=>value==null?"—":Number(value).toLocaleString("es-CL",{maximumFractionDigits:max});
const money=(value:number|null)=>value==null?"Pendiente":`$${value.toLocaleString("es-CL",{maximumFractionDigits:0})}`;
const ufMoney=(value:string)=>`$${Number(value).toLocaleString("es-CL",{minimumFractionDigits:0,maximumFractionDigits:2})}`;
const safe=(value:unknown)=>[...String(value??"").normalize("NFC")].map(char=>
  /^[\u0020-\u024f\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]$/.test(char)?char:"?").join("");

export async function renderPaymentStatementPdf(statement:Statement,operations:Operation[],totals:StatementTotals){
  const rental=statement.statement_type==="arriendo";
  const width=rental?595.28:841.89,height=rental?841.89:595.28,margin=36,tableWidth=width-margin*2;
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const regular=await doc.embedFont(await readFile(resolve(process.cwd(),"public/fonts/montserrat-regular.ttf")),{subset:true});
  const bold=await doc.embedFont(await readFile(resolve(process.cwd(),"public/fonts/montserrat-bold.ttf")),{subset:true});
  const ink=rgb(.14,.20,.18),green=rgb(.02,.40,.29),muted=rgb(.40,.46,.43);
  const pale=rgb(.95,.975,.96),line=rgb(.80,.86,.82),white=rgb(1,1,1),alert=rgb(.995,.94,.88);
  const pages:PDFPage[]=[];let page!:PDFPage;let y=0;

  function text(value:unknown,x:number,at:number,size=8,font:PDFFont=regular,color=ink){
    page.drawText(safe(value),{x,y:at,size,font,color});
  }
  function right(value:unknown,x:number,at:number,size=8,font:PDFFont=regular,color=ink){
    const rendered=safe(value);text(rendered,x-font.widthOfTextAtSize(rendered,size),at,size,font,color);
  }
  function wrap(value:unknown,font:PDFFont,size:number,maxWidth:number){
    const words=safe(value||"—").replace(/\s+/g," ").trim().split(" "),lines:string[]=[];
    let current="";
    for(let word of words){
      while(word&&font.widthOfTextAtSize(word,size)>maxWidth){
        if(current){lines.push(current);current="";}
        let fragment="";
        for(const char of word){if(fragment&&font.widthOfTextAtSize(fragment+char,size)>maxWidth)break;fragment+=char;}
        lines.push(fragment);word=word.slice(fragment.length);
      }
      if(!word)continue;
      const next=current?`${current} ${word}`:word;
      if(current&&font.widthOfTextAtSize(next,size)>maxWidth){lines.push(current);current=word;}
      else current=next;
    }
    if(current)lines.push(current);
    return lines.length?lines:["—"];
  }
  function pageHeader(continuation=false){
    page=doc.addPage([width,height]);pages.push(page);
    page.drawRectangle({x:0,y:height-10,width,height:10,color:green});
    text("EMPRESA DE SERVICIOS INTEGRALES E Y J LTDA.",margin,height-37,11,bold,green);
    text("RUT 76.347.909-9",margin,height-55,8,regular,muted);
    text(continuation?"ESTADO DE PAGO · CONTINUACIÓN":"ESTADO DE PAGO",margin,height-84,16,bold);
    const heading=`N° ${statement.number}`;
    const headingSize=Math.min(16,16*(width/2-12)/bold.widthOfTextAtSize(safe(heading),16));
    right(heading,width-margin,height-83,headingSize,bold,green);
    page.drawLine({start:{x:margin,y:height-94},end:{x:width-margin,y:height-94},thickness:1,color:line});
    y=height-104;
  }
  function ensure(required:number){if(y-required<57)pageHeader(true);}
  pageHeader();

  const month=new Intl.DateTimeFormat("es-CL",{month:"long",year:"numeric",timeZone:"UTC"})
    .format(new Date(`${dateOnly(statement.period_on)}T12:00:00Z`));
  type Field={label:string;value:string;width:number};
  const fields:Field[][]=rental?[
    [{label:"EMPRESA",value:statement.client_name,width:261.5},{label:"RUT",value:statement.client_tax_id,width:261.5}],
    [{label:"DOMICILIO",value:statement.client_address,width:261.5},{label:"PERÍODO",value:month,width:261.5}],
    [{label:"CONTACTO",value:statement.client_contact,width:261.5},
      {label:"CONTRATO",value:statement.contract_reference||"—",width:261.5}],
    [{label:"CONTACTO E Y J",value:statement.issuer_contact||"—",width:261.5},
      {label:"FORMATO",value:"Arriendo",width:261.5}],
  ]:[
    [{label:"EMPRESA",value:statement.client_name,width:340},{label:"RUT",value:statement.client_tax_id,width:130},
      {label:"PERÍODO",value:month,width:130},{label:"FORMATO",value:"Residuos",width:170}],
    [{label:"DOMICILIO",value:statement.client_address,width:295},{label:"CONTACTO",value:statement.client_contact,width:235},
      {label:"CONTACTO E Y J",value:statement.issuer_contact||"—",width:240}],
  ];
  const rows=fields.map(row=>row.map(field=>wrap(field.value,regular,8.5,field.width-16)));
  const rowHeights=rows.map(row=>Math.max(...row.map(parts=>parts.length))*12+23);
  const panelHeight=rowHeights.reduce((sum,h)=>sum+h,0)+6;
  page.drawRectangle({x:margin,y:y-panelHeight,width:tableWidth,height:panelHeight,color:pale});
  let rowTop=y-5;
  fields.forEach((row,index)=>{
    let x=margin+10;
    row.forEach((field,fieldIndex)=>{
      text(field.label,x,rowTop-12,7,bold,muted);
      rows[index][fieldIndex].forEach((part,lineIndex)=>text(part,x,rowTop-27-lineIndex*12,8.5));
      x+=field.width;
    });
    rowTop-=rowHeights[index];
  });
  y-=panelHeight+(rental?14:8);
  const incomplete=totals.total_clp==null||operations.length===0;
  const status=statement.status.toUpperCase();
  const statusText=incomplete?`${status} · DATOS PENDIENTES DE REVISIÓN`:status;
  page.drawRectangle({x:margin,y:y-21,width:tableWidth,height:21,color:incomplete?alert:pale});
  text(statusText,margin+9,y-14,8,bold,incomplete?rgb(.57,.29,.12):green);
  y-=rental?38:30;

  function section(title:string){
    ensure(68);
    text(title.toUpperCase(),margin,y,10,bold,green);
    page.drawLine({start:{x:margin,y:y-8},end:{x:width-margin,y:y-8},thickness:.6,color:line});
    y-=rental?22:19;
  }
  type Column={title:string;width:number};
  function table(title:string,columns:Column[],records:string[][]){
    section(title);
    const header=()=>{
      ensure(38);
      page.drawRectangle({x:margin,y:y-28,width:tableWidth,height:28,color:green});
      let x=margin;
      for(const col of columns){
        wrap(col.title,bold,7,col.width-8).forEach((part,index)=>text(part,x+4,y-10-index*9,7,bold,white));
        x+=col.width;
      }
      y-=28;
    };
    header();
    if(!records.length){
      text("Pendiente de registrar",margin+8,y-19,8,regular,muted);y-=32;
    }
    records.forEach((record,index)=>{
      const wrapped=record.map((value,i)=>wrap(value,regular,7.4,columns[i].width-8));
      const rowHeight=Math.max(rental?26:23,11+Math.max(...wrapped.map(parts=>parts.length))*10.5);
      if(y-rowHeight<57){pageHeader(true);section(`${title} · continuación`);header();}
      if(index%2===0)page.drawRectangle({x:margin,y:y-rowHeight,width:tableWidth,height:rowHeight,color:pale});
      let x=margin;
      wrapped.forEach((parts,i)=>{parts.forEach((part,k)=>text(part,x+4,y-14-k*10.5,7.4));x+=columns[i].width;});
      page.drawLine({start:{x:margin,y:y-rowHeight},end:{x:width-margin,y:y-rowHeight},thickness:.35,color:line});
      y-=rowHeight;
    });
    y-=rental?15:8;
  }
  if(rental){
    table("Detalle de arriendo",[
      {title:"ÍTEM",width:40},{title:"DESCRIPCIÓN",width:277},{title:"DESDE",width:103},{title:"HASTA",width:103},
    ],operations.map(op=>[String(op.line_number),op.description,formatDate(op.rental_from),formatDate(op.rental_to)]));
  }else{
    table("Servicios y respaldo operativo",[
      {title:"ÍTEM",width:32},{title:"FECHA",width:59},{title:"DESCRIPCIÓN",width:250},
      {title:"PESO KG",width:63},{title:"TICKET DE PESAJE",width:82},
      {title:"HOJA DE SERVICIO",width:93},{title:"GUÍA DE DESPACHO",width:89},{title:"SIDREP",width:102},
    ],operations.map(op=>[String(op.line_number),formatDate(op.operation_on),
      op.is_disposal&&!/disposici[oó]n/i.test(op.description)?`Disposición final · ${op.description}`:op.description,number(op.weight_kg),
      op.weighing_ticket||"—",op.service_sheet||"—",op.guide_number||"—",op.sidrep||"—"]));
  }
  const chargeColumns:Column[]=rental?[
    {title:"DESCRIPCIÓN",width:215},{title:"VALOR UNITARIO",width:70},{title:"VALOR UF / FECHA",width:110},
    {title:"CANTIDAD",width:55},{title:"TOTAL CLP",width:73},
  ]:[
    {title:"DESCRIPCIÓN",width:332},{title:"VALOR UNITARIO",width:105},{title:"VALOR UF / FECHA",width:140},
    {title:"CANTIDAD",width:80},{title:"TOTAL CLP",width:113},
  ];
  table("Valorización",chargeColumns,totals.lines.map(({charge,quantity,total_clp})=>[
    charge.description,`${number(charge.unit_value)} ${charge.pricing==="clp_servicio"?"CLP":"UF"}`,
    charge.uf_value_clp?`${ufMoney(charge.uf_value_clp)} · ${formatDate(charge.uf_on)}`:"—",
    quantity==null?"Pendiente":`${number(quantity,charge.pricing==="uf_ton"?5:3)} ${charge.pricing==="uf_ton"?"ton":"un."}`,
    money(total_clp),
  ]));
  const manager=wrap(`Administrador de contrato: ${statement.contract_manager||"Pendiente de informar"}${statement.contract_reference?` · Contrato: ${statement.contract_reference}`:""}`,
    bold,8,rental?tableWidth:width-margin-235-margin-14);
  ensure(rental?80:Math.max(72,manager.length*12+20));
  const summaryX=width-margin-235;
  page.drawLine({start:{x:summaryX,y},end:{x:width-margin,y},thickness:1,color:line});
  text("TOTAL NETO ESTADO DE PAGO",summaryX,y-19,8,bold);right(money(totals.net_clp),width-margin-5,y-19,8,bold);
  text("IVA 19%",summaryX,y-38,8);right(money(totals.vat_clp),width-margin-5,y-38,8);
  page.drawRectangle({x:summaryX-4,y:y-72,width:239,height:26,color:green});
  text("TOTAL ESTADO DE PAGO",summaryX+2,y-63,8,bold,white);
  right(money(totals.total_clp),width-margin-5,y-63,9,bold,white);
  if(!rental&&totals.disposal_tons!=null)
    text(`Toneladas de disposición: ${number(totals.disposal_tons,5)} ton`,margin,y-18,8,regular,muted);
  if(!rental)manager.forEach((part,index)=>text(part,margin,y-38-index*12,8,bold));
  y-=rental?78:74;

  if(statement.notes){
    section("Observaciones");
    for(const part of wrap(statement.notes,regular,8,tableWidth)){
      ensure(18);text(part,margin,y,8);y-=12;
    }
    y-=10;
  }
  if(rental){
    ensure(manager.length*12+25);
    page.drawLine({start:{x:margin,y},end:{x:width-margin,y},thickness:.7,color:line});
    manager.forEach((part,index)=>text(part,margin,y-17-index*12,8,bold));
  }
  for(const [index,p] of pages.entries()){
    p.drawLine({start:{x:margin,y:42},end:{x:width-margin,y:42},thickness:.6,color:line});
    p.drawText(safe(`EDP N° ${statement.number} · E y J · Página ${index+1} de ${pages.length}`),
      {x:margin,y:27,size:7,font:regular,color:muted});
    const disclaimer="Documento interno. No sustituye factura tributaria.";
    p.drawText(disclaimer,{x:width-margin-regular.widthOfTextAtSize(disclaimer,7),y:27,size:7,font:regular,color:muted});
  }
  doc.setTitle(`Estado de pago N° ${statement.number} - ${statement.client_name}`);
  doc.setCreator("RERCHAR Industrial Waste Management System");
  return doc.save();
}
