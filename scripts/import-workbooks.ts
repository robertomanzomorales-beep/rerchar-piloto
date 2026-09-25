/** After db:migrate: node --import tsx scripts/import-workbooks.ts /tmp/rerchar-workbooks.jsonl */
import {createReadStream} from "node:fs";
import {createInterface} from "node:readline";
import {db,transaction} from "../lib/db";

type Row={type:"row";sheet:string;row:number;cells:{col:string;value:unknown;formula?:string}[]};
type Source={type:"source";filename:string;sha256:string};
async function main(){
  const path=process.argv[2];if(!path)throw new Error("Indique la ruta del JSONL extraído.");
  const lines=createInterface({input:createReadStream(path,{encoding:"utf8"}),crlfDelay:Infinity});
  let current:Source|null=null,rows:Row[]=[];
  async function flush(){
    if(!current)return;
    const source=current;
    const snapshot=rows;current=null;rows=[];
    const [existing]=await db.query("SELECT id FROM legacy_workbook_sources WHERE sha256=$1",[source.sha256]);
    if(existing){console.log(`Ya importado: ${source.filename}`);return;}
    await transaction(async tx=>{
      const [created]=await tx.query<{id:string}>(`INSERT INTO legacy_workbook_sources(filename,sha256,row_count)
        VALUES($1,$2,$3) RETURNING id`,[source.filename,source.sha256,snapshot.length]);
      for(let i=0;i<snapshot.length;i+=100){
        const batch=snapshot.slice(i,i+100).map(r=>({sheet:r.sheet,row:r.row,cells:r.cells}));
        await tx.query(`INSERT INTO legacy_workbook_rows(source_id,sheet_name,row_number,cells)
          SELECT $1,sheet,row_number,cells FROM jsonb_to_recordset($2::jsonb)
          AS entry(sheet text,row_number integer,cells jsonb)`,[created.id,JSON.stringify(batch.map(x=>({sheet:x.sheet,row_number:x.row,cells:x.cells})))]);
      }
    });
    console.log(`Importado: ${source.filename} · ${snapshot.length} filas`);
  }
  for await(const line of lines){
    if(!line.trim())continue;
    const data=JSON.parse(line) as Source|Row|{type:"end"};
    if(data.type==="source"){
      if(current)throw new Error("Falta terminador de libro anterior.");
      if(!/^[a-f0-9]{64}$/.test(data.sha256)||data.filename.length>200)throw new Error("Encabezado inválido.");
      current=data;
    }else if(data.type==="row"){
      if(!current||!data.sheet||!Number.isInteger(data.row)||data.row<1||!Array.isArray(data.cells))throw new Error("Fila inválida.");
      rows.push(data);
    }else if(data.type==="end"){
      if(!current)throw new Error("Terminador sin libro.");
      await flush();
    }else throw new Error("Tipo de línea desconocido.");
  }
  if(current)throw new Error("Archivo incompleto: falta terminador final.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
