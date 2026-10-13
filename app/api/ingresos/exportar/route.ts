import {getActor,canManage} from "@/lib/auth";
import {MaterialError,exportMaterialReceipts} from "@/lib/materials";
import {buildEntryWorkbook} from "@/lib/material-export";

export const runtime="nodejs";
export async function GET(request:Request){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  if(!canManage(actor))return new Response("Sin permiso para exportar ingresos",{status:403});
  const params=new URL(request.url).searchParams;
  const month=params.get("mes")??"",clientId=params.get("cliente")??"";
  try{
    const rows=await exportMaterialReceipts(actor,month,clientId);
    const workbook=buildEntryWorkbook(rows,month);
    return new Response(new Uint8Array(workbook),{headers:{
      "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":`attachment; filename="rerchar-entrada-material-${month}.xlsx"`,
      "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
    }});
  }catch(error){
    if(error instanceof MaterialError)return new Response(error.message,{status:400});
    throw error;
  }
}
