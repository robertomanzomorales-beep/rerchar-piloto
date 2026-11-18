import Link from "next/link";
import {lastRecordPage,recordsPerPage} from "@/lib/record-pagination";

export default function RecordsPagination({page,total,href,label}:{page:number;total:number;href:(page:number)=>string;label:string}){
  const last=lastRecordPage(total);
  if(last===1)return null;
  return <nav className="records-pagination" aria-label={label}>
    <span>{page>1&&<Link className="button button-outline" href={href(page-1)}>Anterior</Link>}</span>
    <span>Página {page} de {last} · {(page-1)*recordsPerPage+1}–{Math.min(page*recordsPerPage,total)} de {total}</span>
    <span>{page<last&&<Link className="button button-outline" href={href(page+1)}>Siguiente</Link>}</span>
  </nav>;
}
