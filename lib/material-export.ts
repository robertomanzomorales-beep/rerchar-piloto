import {materialAmounts,type MaterialReceipt} from "./materials";

// Columnas B:V de «ENTRADA MATERIAL - 2026», con una fila por ingreso registrado.
export const entryHeaders=["FECHA","EMPRESA /FAENA","CONDUCTOR","RUT CONDUCTOR","PATENTE CAMIÓN",
  "PATENTE RAMPLA","TICKET DE PESAJE","MATERIAL","PESO","IMPUREZA","TOTAL KILOS RECIBIDOS",
  "N° INFORME DE IMPUREZA","OBSERVACIÓN","GD CODELCO","GD TRASLADO","HOJA DE INGRESO",
  "GD E° VALORIZADA","N°FACTURA","ESTADO","CERTIFICACIÓN N°","NUMERO DE ACTA"];

type Cell=string|number|Date|null;
const day=(value:Date|string)=>String(value instanceof Date?value.toISOString():value).slice(0,10);
export function entryRow(r:MaterialReceipt):Cell[]{
  const amount=materialAmounts(r);
  const base=r.net_basis==="proveedor"?r.supplier_kg:r.rerchar_kg;
  const payment:Record<string,string>={pendiente:"Pendiente",parcial:"Parcial",pagado:"Pagado",no_aplica:"No aplica"};
  return [new Date(`${day(r.movement_on)}T00:00:00Z`),[r.client_name,r.site_name].filter(Boolean).join(" / "),
    r.driver_name,r.driver_tax_id,r.truck_plate,r.trailer_plate,r.weighing_ticket,r.material_name,
    base==null?null:Number(base),Number(r.impurity_kg),amount.net_kg,r.impurity_report,r.notes,
    r.origin_guide,r.transfer_guide,r.entry_sheet,r.valued_guide,r.invoice_number,payment[r.payment_status]??r.payment_status,
    r.certificate_number,r.act_number];
}

function escapeXml(value:string){return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&apos;");}
const ref=(n:number)=>{let s="";for(let i=n;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
const excelDay=(date:Date)=>Math.round((date.getTime()-Date.UTC(1899,11,30))/86400000);
function cell(value:Cell,address:string,style=0){
  if(value==null||value==="")return "";
  if(value instanceof Date)return `<c r="${address}" s="2"><v>${excelDay(value)}</v></c>`;
  if(typeof value==="number")return Number.isFinite(value)?`<c r="${address}" s="3"><v>${value}</v></c>`:"";
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(data:Buffer){let c=0xffffffff;for(const byte of data)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zip(files:[string,string][]):Buffer{
  const parts:Buffer[]=[],directory:Buffer[]=[];let offset=0;
  for(const [path,xml] of files){
    const name=Buffer.from(path),bytes=Buffer.from(xml,"utf8"),crc=crc32(bytes);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);
    parts.push(local,name,bytes);
    const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);
    entry.writeUInt32LE(crc,16);entry.writeUInt32LE(bytes.length,20);entry.writeUInt32LE(bytes.length,24);
    entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);directory.push(entry,name);
    offset+=local.length+name.length+bytes.length;
  }
  const directorySize=directory.reduce((sum,part)=>sum+part.length,0);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);
  end.writeUInt16LE(files.length,10);end.writeUInt32LE(directorySize,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...parts,...directory,end]);
}

export function buildEntryWorkbook(rows:MaterialReceipt[],month:string):Buffer{
  const months=["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  const sheetName=`${months[Number(month.slice(5))-1]} ${month.slice(0,4)}`;
  const header=entryHeaders.map((name,i)=>cell(name,`${ref(i+2)}3`,1)).join("");
  const body=rows.map((r,i)=>`<row r="${i+4}" ht="23">${entryRow(r).map((v,j)=>cell(v,`${ref(j+2)}${i+4}`)).join("")}</row>`).join("");
  const widths=[15,31,23,17,17,17,18,30,14,14,22,21,45,18,18,18,22,18,17,19,18];
  const cols=`<col min="1" max="1" width="3" customWidth="1"/>`+widths.map((w,i)=>`<col min="${i+2}" max="${i+2}" width="${w}" customWidth="1"/>`).join("");
  const worksheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="B4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
    <sheetFormatPr defaultRowHeight="20"/><cols>${cols}</cols><sheetData>
    <row r="2" ht="34">${cell("ENTRADA DE MATERIAL RERCHAR","B2",4)}</row>
    <row r="3" ht="43">${header}</row>${body}</sheetData><mergeCells count="1"><mergeCell ref="B2:V2"/></mergeCells>
    <autoFilter ref="B3:V${Math.max(3,rows.length+3)}"/></worksheet>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <numFmts count="2"><numFmt numFmtId="164" formatCode="dd-mm-yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
    <fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts>
    <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF194D49"/><bgColor indexed="64"/></patternFill></fill></fills>
    <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
    <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs>
    <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  return zip([
    ["[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml",workbook],
    ["xl/_rels/workbook.xml.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml",styles],["xl/worksheets/sheet1.xml",worksheet],
  ]);
}
