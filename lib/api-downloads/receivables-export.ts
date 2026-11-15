import {getActor} from "@/lib/auth";
import {chileCsvDay} from "@/lib/chile-csv";
import type {Company} from "@/lib/companies";
import {parseReceivableFilter,receivablesCsvHeader,receivablesCsvRows} from "@/lib/receivable-export";
import {listReceivablesPage,todayChile} from "@/lib/receivables";

export async function GET(request:Request){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  if(actor.role!=="admin")return new Response("Sin permiso",{status:403});
  const params=new URL(request.url).searchParams;
  const requestedCompany=params.get("empresa");
  if(requestedCompany!=="rerchar"&&requestedCompany!=="e_y_j")return new Response("Empresa inválida",{status:400});
  const company:Company=requestedCompany;
  const filter=parseReceivableFilter(params.get("estado"));
  const today=todayChile();
  const first=await listReceivablesPage(actor,company,filter,today,500,0);
  const encoder=new TextEncoder();
  let offset=first.items.length;
  const stream=new ReadableStream<Uint8Array>({
    start(controller){
      controller.enqueue(encoder.encode(receivablesCsvHeader()+receivablesCsvRows(first.items,company,today)));
      if(offset>=first.total)controller.close();
    },
    async pull(controller){
      try{
        const batch=await listReceivablesPage(actor,company,filter,today,500,offset);
        if(batch.items.length)controller.enqueue(encoder.encode(receivablesCsvRows(batch.items,company,today)));
        offset+=batch.items.length;
        if(!batch.items.length||offset>=batch.total)controller.close();
      }catch(error){controller.error(error);}
    },
  });
  return new Response(stream,{headers:{
    "Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":`attachment; filename="cobranzas-${company}-${chileCsvDay()}.csv"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
}
