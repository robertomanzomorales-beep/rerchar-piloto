import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {PDFDocument} from "pdf-lib";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {renderQuotePdf} from "../lib/quote-pdf";
import type {Quote,QuoteLine} from "../lib/quotes";

test("PDF de cotización conserva razón social y dirección completas en ambas empresas",async()=>{
  const clientName="SOCIEDAD INDUSTRIAL DE RECEPCIÓN Y VALORIZACIÓN DE MATERIALES DEL NORTE LIMITADA";
  const clientAddress="AVENIDA DE LA INDUSTRIA 1234, EDIFICIO DE OPERACIONES, OFICINA 2103, PUERTO SECO, CALAMA, REGIÓN DE ANTOFAGASTA";
  for(const issuer of ["rerchar","e_y_j"] as const){
    const quote:Quote={id:randomUUID(),folio:"12",display_folio:null,submission_key:randomUUID(),client_id:randomUUID(),issuer,
      client_name:clientName,client_tax_id:"12345678-5",client_email:"revision@example.invalid",client_address:clientAddress,
      title:"Transporte y recepción industrial",company_intro:null,proposal_objective:null,notes:"FIN-CONDICIONES",
      issued_on:"2026-11-20",valid_until:"2026-12-20",vat_rate:"0.19",status:"borrador",sent_at:null,created_at:new Date(),
      uf_rate_clp:null,uf_rate_on:null,client_order_reference:null,client_order_on:null,route_required:false,
      planning_review_after:null,commercial_kind:"general",tax_review_status:"no_aplica",tax_review_note:null,issued_version:1};
    const lines:QuoteLine[]=[{id:randomUUID(),position:1,description:"CONCEPTO DE PRUEBA COMPLETO",quantity:"1",unit:"servicio",
      unit_price_clp:"250000",taxable:true,currency:"CLP",unit_price_uf:null,principal:null,segment:null,waste_category:null,
      destination_id:null,destination_name:null,destination_required:false,material_id:null,line_note:null}];
    const loading=getDocument({data:await renderQuotePdf(quote,lines),useSystemFonts:true});
    try{
      const document=await loading.promise;
      assert.equal(document.numPages,1,"la identidad completa cabe con la propuesta breve");
      const page=await document.getPage(1),content=await page.getTextContent();
      const texts=content.items.flatMap(item=>"str" in item?[item.str]:[]);
      const text=texts.join(" ").replace(/\s+/g," ");
      for(const expected of [clientName,clientAddress,"RUT 12345678-5","CONCEPTO DE PRUEBA COMPLETO","FIN-CONDICIONES","$297.500"])
        assert.ok(text.includes(expected),`${issuer}: falta ${expected}`);
      const bounds=content.items.flatMap(item=>"str" in item&&item.str.trim()?[{text:item.str,x:item.transform[4],y:item.transform[5],width:item.width}]:[]);
      const nameLines=bounds.filter(item=>clientName.includes(item.text)&&item.text.length>12);
      const addressLines=bounds.filter(item=>clientAddress.includes(item.text)&&item.text.length>12);
      const proposal=bounds.find(item=>item.text==="PROPUESTA");
      assert.ok(nameLines.length>1&&addressLines.length>1,"la identidad ocupa líneas legibles sin recortes");
      assert.ok(proposal);
      assert.ok([...nameLines,...addressLines].every(item=>item.x+item.width<398&&item.y>proposal.y+10),"la identidad no pisa fechas ni propuesta");
    }finally{await loading.destroy();}

    const brief:Quote={...quote,client_name:"CLIENTE DE PRUEBA DE IMPRESIÓN INDUSTRIAL SPA",client_address:"Dirección de prueba, Antofagasta",
      title:"Propuesta de servicios industriales y control documental",
      company_intro:"Empresa de prueba: recepción, transporte y valorización de materiales industriales.",
      proposal_objective:"Realizar los servicios cotizados con trazabilidad documental y control de los materiales.",
      notes:"Condiciones de prueba. FIN-CONDICIONES-NORMAL"};
    const briefLines:QuoteLine[]=Array.from({length:2},(_,index)=>({...lines[0],id:randomUUID(),position:index+1,
      description:`CONCEPTO-00${index+1} Servicio industrial de transporte y gestión de material`,
      line_note:`Control documental del concepto ${index+1}`}));
    const briefPdf=await PDFDocument.load(await renderQuotePdf(brief,briefLines,"BORRADOR DE PRUEBA · SIN VALIDEZ COMERCIAL"));
    assert.equal(briefPdf.getPageCount(),1,`${issuer}: la identidad completa no debe aislar una condición breve en otra página`);
  }
});
