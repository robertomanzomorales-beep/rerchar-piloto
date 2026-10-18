import {getActor} from "@/lib/auth";
import {chileCsvDay} from "@/lib/chile-csv";
import type {Company} from "@/lib/companies";
import {filterReceivables,parseReceivableFilter,receivablesCsv} from "@/lib/receivable-export";
import {listReceivables,todayChile} from "@/lib/receivables";

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
  const rows=filterReceivables(await listReceivables(actor,company),filter,today);
  return new Response(receivablesCsv(rows,company,today),{headers:{
    "Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":`attachment; filename="cobranzas-${company}-${chileCsvDay()}.csv"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
}
