import {getActor,canManage} from "@/lib/auth";
import {db} from "@/lib/db";
import {buildGuideWorkbook,type GuideExportRecord} from "@/lib/material-guide-export";

export const runtime="nodejs";
export async function GET(request:Request){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  if(!canManage(actor))return new Response("Sin permiso para exportar guías",{status:403});
  const month=new URL(request.url).searchParams.get("mes")??"";
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return new Response("Seleccione un mes válido",{status:400});
  const records=await db.query<GuideExportRecord>(`SELECT row_to_json(g) AS guide,row_to_json(i) AS item,c.name AS counterparty_name
    FROM material_guides g JOIN material_guide_items i ON i.guide_id=g.id
    JOIN clients c ON c.id=g.counterparty_id
    WHERE g.operating_company='rerchar' AND g.movement_on >= $1::date
      AND g.movement_on < $1::date + interval '1 month'
    ORDER BY g.movement_on,g.guide_number,i.line_number LIMIT 10001`,[`${month}-01`]);
  if(records.length>10000)return new Response("El mes supera 10.000 materiales; solicite una exportación segmentada.",{status:400});
  return new Response(new Uint8Array(buildGuideWorkbook(records,month)),{headers:{
    "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition":`attachment; filename="rerchar-control-guias-${month}.xlsx"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
}
