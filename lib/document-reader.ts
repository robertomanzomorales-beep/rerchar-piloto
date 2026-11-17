import type {Worker as OCRWorker} from "tesseract.js";
import {extractDocumentFields,type DocumentReading} from "./document-fields";

const assets="/document-reader/v1";
function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>reject(new DOMException("Lectura cancelada","AbortError"));
    if(signal.aborted){abort();return;}
    signal.addEventListener("abort",abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener("abort",abort));
  });
}
export type ReadingControl={signal:AbortSignal;progress:(message:string)=>void};
export async function readDocument(file:Blob,control:ReadingControl):Promise<DocumentReading>{
  if(file.size<1||file.size>4*1024*1024)throw new Error("Seleccione un PDF, JPG, PNG o WebP de hasta 4 MB.");
  const bytes=new Uint8Array(await file.arrayBuffer());
  const pdf=bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70;
  const image=(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||
    [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)||
    String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if(!pdf&&!image)throw new Error("El archivo no es un PDF o imagen compatible.");
  let worker:OCRWorker|undefined;
  const ensure=()=>{if(control.signal.aborted)throw new DOMException("Lectura cancelada","AbortError");};
  const cancel=()=>{void worker?.terminate();};
  control.signal.addEventListener("abort",cancel,{once:true});
  const recognize=async(source:HTMLCanvasElement)=>{
    ensure();
    if(!worker){
      control.progress("Preparando lectura de la imagen…");
      const {createWorker}=await import("tesseract.js");
      ensure();
      worker=await abortable(createWorker("spa",1,{workerPath:`${assets}/worker.min.js`,langPath:assets,corePath:`${assets}/core`,workerBlobURL:false,
        logger:message=>{if(message.status==="recognizing text")control.progress(`Leyendo imagen: ${Math.round(message.progress*100)} %`);}}).then(created=>{
          if(control.signal.aborted){void created.terminate();throw new DOMException("Lectura cancelada","AbortError");}
          return created;
        }),control.signal);
      ensure();
    }
    if(!worker)throw new Error("No fue posible iniciar la lectura.");
    const result=await abortable(worker.recognize(source),control.signal);ensure();
    return {text:result.data.text,uncertain:result.data.confidence<65};
  };
  let loading:ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>|undefined;
  const warnings:string[]=[];let text="";
  try{
    ensure();
    if(pdf){
      const pdfjs=await import("pdfjs-dist");ensure();
      pdfjs.GlobalWorkerOptions.workerSrc=`${assets}/pdf.worker.min.mjs`;
      loading=pdfjs.getDocument({data:bytes,useSystemFonts:true,stopAtErrors:true,
        cMapUrl:`${assets}/cmaps/`,cMapPacked:true,standardFontDataUrl:`${assets}/standard_fonts/`,wasmUrl:`${assets}/wasm/`});
      const document=await abortable(loading.promise,control.signal);ensure();
      if(document.numPages>4)throw new Error("La lectura admite hasta cuatro páginas. Separe la guía o ticket que desea revisar.");
      for(let number=1;number<=document.numPages;number++){
        control.progress(`Leyendo página ${number} de ${document.numPages}…`);
        const page=await document.getPage(number);ensure();
        const content=await page.getTextContent();
        let pageText="",previousY:number|undefined;
        for(const item of content.items){
          if(!("str" in item))continue;
          const y=item.transform[5];
          if(previousY!==undefined&&Math.abs(y-previousY)>3)pageText+="\n";
          pageText+=item.str+(item.hasEOL?"\n":" ");previousY=y;
        }
        // A scanned PDF can contain only a small text watermark. Try OCR
        // whenever no labelled operational field can be read from its text.
        if(extractDocumentFields(pageText).suggestions.length===0){
          const original=page.getViewport({scale:1});
          const scale=Math.min(2,2200/Math.max(original.width,original.height));
          const viewport=page.getViewport({scale});
          const canvas=documentCanvas(viewport.width,viewport.height);
          const render=page.render({canvas,viewport});
          const abortRender=()=>render.cancel();control.signal.addEventListener("abort",abortRender,{once:true});
          try{await abortable(render.promise,control.signal);const result=await recognize(canvas);pageText=result.text;if(result.uncertain)warnings.push(`Página ${number}: imagen de baja legibilidad; coteje todos los datos.`);}
          finally{control.signal.removeEventListener("abort",abortRender);canvas.width=0;canvas.height=0;}
        }
        text+=pageText+"\n";page.cleanup();ensure();
      }
    }else{
      const bitmap=await createImageBitmap(file);ensure();
      if(bitmap.width*bitmap.height>30_000_000){bitmap.close();throw new Error("La imagen es demasiado grande. Redúzcala o recorte sólo el documento.");}
      const scale=Math.min(1,2500/Math.max(bitmap.width,bitmap.height));
      const canvas=documentCanvas(bitmap.width*scale,bitmap.height*scale);
      try{const ctx=canvas.getContext("2d")!;ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const result=await recognize(canvas);text=result.text;if(result.uncertain)warnings.push("Imagen de baja legibilidad; coteje todos los datos.");}
      finally{bitmap.close();canvas.width=0;canvas.height=0;}
    }
    ensure();const result=extractDocumentFields(text);return {...result,warnings:[...warnings,...result.warnings]};
  }finally{
    control.signal.removeEventListener("abort",cancel);
    await worker?.terminate().catch(()=>{});await loading?.destroy().catch(()=>{});
  }
}
function documentCanvas(width:number,height:number){
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.ceil(width));canvas.height=Math.max(1,Math.ceil(height));
  if(!canvas.getContext("2d"))throw new Error("El navegador no pudo preparar la imagen.");
  return canvas;
}
