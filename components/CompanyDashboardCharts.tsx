import Link from "next/link";

export type MonthActivity={period:string;opened:string;closed:string};
export type ServiceStatus={label:string;status:string;count:number};

const number=(value:string)=>Number(value)||0;
const monthLabel=new Intl.DateTimeFormat("es-CL",{month:"short",timeZone:"UTC"});
const monthName=(period:string)=>monthLabel.format(new Date(`${period}-01T00:00:00Z`)).replace(".","");

export function ActivityChart({months,company,currentPeriod}:{months:MonthActivity[];company:string;currentPeriod:string}){
  const entered=months.reduce((sum,month)=>sum+number(month.opened),0);
  const closed=months.reduce((sum,month)=>sum+number(month.closed),0);
  const maximum=Math.max(4,Math.ceil(Math.max(...months.flatMap(month=>[number(month.opened),number(month.closed)]),0)/4)*4);
  const ticks=[maximum,maximum*3/4,maximum/2,maximum/4,0];
  const description=months.map(month=>`${monthName(month.period)}: ${number(month.opened)} ingresados, ${number(month.closed)} cerrados`).join("; ");
  return <section className="section-card company-chart-card company-chart-card--activity" aria-labelledby="activity-title">
    <div className="company-chart-head"><div><span className="eyebrow">ÚLTIMOS SEIS MESES</span><h2 id="activity-title">Actividad de servicios</h2><p>Ingresos y cierres registrados por mes</p></div><div className="company-chart-total"><strong>{entered}</strong><span>ingresados</span></div></div>
    <div className="company-chart-legend"><span><i className="legend-opened"/> Ingresados <b>{entered}</b></span><span><i className="legend-closed"/> Cerrados <b>{closed}</b></span></div>
    {entered+closed>0?<figure className="company-chart-figure"><div className="company-chart-plot" role="img" aria-label={description}>
      <div className="company-chart-ticks" aria-hidden="true">{ticks.map(tick=><span key={tick}>{tick}</span>)}</div>
      <div className="company-chart-months"><div className="company-chart-grid" aria-hidden="true">{ticks.map(tick=><span key={tick}/>)}</div>
        {months.map(month=><div className={`company-chart-month ${month.period===currentPeriod?"is-current":""}`} key={month.period} aria-hidden="true"><div className="company-chart-bars">
          {(["opened","closed"] as const).map(kind=>{const count=number(month[kind]);return <span key={kind} className={`company-chart-bar company-chart-bar--${kind}`} style={{height:`${count/maximum*100}%`}} title={`${kind==="opened"?"Ingresados":"Cerrados"}: ${count}`}>{count>0&&<b>{count}</b>}</span>;})}
        </div><span className="company-chart-month-label">{monthName(month.period)}</span></div>)}
      </div>
    </div><figcaption>Mes en curso marcado con una línea. Fechas según Chile continental.</figcaption></figure>:<div className="company-chart-empty"><strong>Sin actividad en este período</strong><span>El gráfico se alimenta de las solicitudes reales de esta empresa.</span><Link href={`/solicitudes?empresa=${company}`}>Revisar solicitudes</Link></div>}
  </section>;
}

export function StatusComposition({items,company}:{items:ServiceStatus[];company:string}){
  const total=items.reduce((sum,item)=>sum+item.count,0);
  return <section className="section-card company-chart-card company-chart-card--status" aria-labelledby="status-title">
    <div className="company-chart-head"><div><span className="eyebrow">ESTADO ACTUAL</span><h2 id="status-title">Cartera operativa</h2><p>Todos los servicios, incluidos los cancelados</p></div><div className="company-chart-total"><strong>{total}</strong><span>servicios</span></div></div>
    {total>0?<><div className="company-composition" role="img" aria-label={items.map(item=>`${item.label}: ${item.count} de ${total}`).join("; ")}>
      {items.filter(item=>item.count>0).map(item=><span className={`company-composition-segment status-${item.status}`} key={item.status} style={{width:`${item.count/total*100}%`}} title={`${item.label}: ${item.count}`}/>)}
    </div><div className="company-status-chart">{items.map(item=><Link href={`/solicitudes?empresa=${company}&estado=${item.status}`} className="company-status-row" key={item.status}>
      <span className={`company-status-dot status-${item.status}`} aria-hidden="true"/><span className="status-label">{item.label}</span><strong>{item.count}</strong><small>{Math.round(item.count/total*100)}%</small>
    </Link>)}</div></>:<div className="company-chart-empty"><strong>Aún no hay servicios registrados</strong><span>Cuando comience la operación, aquí verá el avance por estado.</span><Link href={`/solicitudes?empresa=${company}`}>Revisar solicitudes</Link></div>}
  </section>;
}
