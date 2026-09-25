import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";

type Source={id:string;filename:string;row_count:number;imported_at:Date};
type Sheet={sheet_name:string;count:string};
type Row={row_number:number;cells:{col:string;value:string|number|boolean;formula?:string}[]};
export default async function OriginalSpreadsheets({searchParams}:{searchParams:Promise<{origen?:string;hoja?:string;pagina?:string;buscar?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const q=await searchParams;
  const sources=await db.query<Source>("SELECT * FROM legacy_workbook_sources ORDER BY imported_at DESC,filename");
  const source=sources.find(s=>s.id===q.origen)??sources[0];
  const sheets=source?await db.query<Sheet>(`SELECT sheet_name,count(*)::text AS count FROM legacy_workbook_rows
    WHERE source_id=$1 GROUP BY sheet_name ORDER BY sheet_name`,[source.id]):[];
  const sheet=sheets.find(s=>s.sheet_name===q.hoja)?.sheet_name??sheets[0]?.sheet_name;
  const page=Math.min(500,Math.max(1,Number.isFinite(Number(q.pagina))?Number(q.pagina)||1:1));
  const search=q.buscar?.trim().slice(0,100)??"";
  const rows=source&&sheet?await db.query<Row>(`SELECT row_number,cells FROM legacy_workbook_rows
    WHERE source_id=$1 AND sheet_name=$2 AND ($3::text='' OR cells::text ILIKE '%' || $3 || '%')
    ORDER BY row_number LIMIT 100 OFFSET $4`,[source.id,sheet,search,(page-1)*100]):[];
  function href(next:{origen?:string;hoja?:string;pagina?:number;buscar?:string}){
    const p=new URLSearchParams();if(next.origen)p.set("origen",next.origen);if(next.hoja)p.set("hoja",next.hoja);
    if(next.pagina&&next.pagina>1)p.set("pagina",String(next.pagina));if(next.buscar)p.set("buscar",next.buscar);
    return `/planillas?${p}`;
  }
  return <><div className="page-title-row"><div><div className="eyebrow">RESPALDO DE ORIGEN · ADMINISTRACIÓN</div><h1>Planillas originales</h1><p className="page-intro">Consulta de filas importadas con su libro, hoja y número de fila para verificar los datos reales antes de vincularlos con registros del sistema.</p></div></div>
    {!sources.length?<section className="section-card"><h2>Esperando importación de Excel</h2><p>Ejecute el extractor y la importación privada descritos en el README después de configurar la base de datos. Las planillas originales no se incluyen en el código del sitio.</p></section>:<>
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">LIBRO</div><h2>{source.filename}</h2></div><span className="count-pill">{source.row_count} filas</span></div>
        <div className="supply-filter">{sources.map(s=><Link key={s.id} href={href({origen:s.id})} className={`button ${s.id===source.id?"button-primary":"button-outline"}`}>{s.filename}</Link>)}</div></section>
      <section className="section-card"><h2>Hoja</h2><div className="supply-filter">{sheets.map(s=><Link key={s.sheet_name} href={href({origen:source.id,hoja:s.sheet_name})} className={`button ${s.sheet_name===sheet?"button-primary":"button-outline"}`}>{s.sheet_name} ({s.count})</Link>)}</div>
        <form method="get" className="supply-filter"><input type="hidden" name="origen" value={source.id}/><input type="hidden" name="hoja" value={sheet}/><label>Buscar en esta hoja<input name="buscar" defaultValue={search} maxLength={100}/></label><button type="submit" className="button button-outline">Buscar</button></form>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Fila Excel</th><th>Valores con columna original</th></tr></thead><tbody>{rows.map(r=><tr key={r.row_number}><td>{r.row_number}</td><td>{r.cells.map((cell,i)=><span key={`${cell.col}:${i}`} style={{display:"inline-block",margin:"0 1rem .5rem 0",verticalAlign:"top",maxWidth:"20rem",overflowWrap:"anywhere"}}><small className="table-sub">{cell.col}</small>{String(cell.value)}{cell.formula&&<small className="table-sub">Fórmula: {cell.formula}</small>}</span>)}</td></tr>)}</tbody></table>{rows.length===0&&<p className="muted">Sin resultados en esta hoja.</p>}</div>
        <div className="order-actions">{page>1&&<Link className="button button-outline" href={href({origen:source.id,hoja:sheet,pagina:page-1,buscar:search})}>← Anterior</Link>}{rows.length===100&&<Link className="button button-outline" href={href({origen:source.id,hoja:sheet,pagina:page+1,buscar:search})}>Siguiente →</Link>}</div></section></>}
  </>;
}
