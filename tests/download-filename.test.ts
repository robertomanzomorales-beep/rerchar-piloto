import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";
import {encodeDownloadFilename} from "../lib/download-filename";

const disposition=createRequire(import.meta.url)("next/dist/compiled/content-disposition") as {
  parse:(header:string)=>{type:string;parameters:{filename?:string}};
};

test("los nombres de descarga cumplen RFC 5987 y conservan Unicode y puntuación",()=>{
  for(const filename of ["guia.pdf","Guía Niño's (1).pdf","Factura proveedor (copia).pdf",
    "RUT de O'Connor (N° 1)*.pdf","áéíóú ñ.pdf","comprobante+cuota#1;final%.pdf",
    'archivo "control"\r\n.pdf',"archivo_(control)!$&+^_`|~.pdf","Guía ♻️ (1).pdf"]){
    const header=`attachment; filename="archivo"; filename*=UTF-8''${encodeDownloadFilename(filename)}`;
    assert.ok(!/[\r\n]/.test(header),"el nombre no puede introducir cabeceras adicionales");
    const parsed=disposition.parse(header);
    assert.equal(parsed.type,"attachment");
    assert.equal(parsed.parameters.filename,filename);
  }
});
