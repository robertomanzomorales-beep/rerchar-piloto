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
  const description=months.map(month=>`${monthName(month.period)}: ${number(month.opened)} solicitudes creadas, ${number(month.closed)} servicios cerrados`).join("; ");
  const x=(index:number)=>58+index*(months.length>1?540/(months.length-1):0);
  const y=(count:number)=>170-count/maximum*140;
  const series=(kind:"opened"|"closed")=>months.map((month,index)=>`${index?"L":"M"}${x(index)} ${y(number(month[kind]))}`).join(" ");
  const enteredArea=`${series("opened")} L${x(months.length-1)} 170 L${x(0)} 170 Z`;
  return <section className={`section-card company-chart-card company-chart-card--activity${entered+closed===0?" company-chart-card--empty":""}`} aria-labelledby="activity-title">
    <div className="company-chart-head"><div><span className="eyebrow">EVOLUCIÓN · 6 MESES</span><h2 id="activity-title">Actividad de servicios</h2><p>Solicitudes creadas y operaciones cerradas</p></div><div className="company-chart-total"><strong>{entered}</strong><span>creadas</span></div></div>
    {entered+closed>0&&<div className="company-chart-legend"><span><i className="legend-opened"/> Solicitudes <b>{entered}</b></span><span><i className="legend-closed"/> Cierres <b>{closed}</b></span></div>}
    {entered+closed>0?<figure className="company-chart-figure"><svg className="company-activity-svg" viewBox="0 0 660 215" role="img" aria-label={description} preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id={`activity-area-${company}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--company-accent)" stopOpacity=".14"/><stop offset="100%" stopColor="var(--company-accent)" stopOpacity="0"/></linearGradient></defs>
      {ticks.map((tick,index)=><g key={index}><line className="activity-gridline" x1="46" x2="635" y1={y(tick)} y2={y(tick)}/><text className="activity-axis-label" x="33" y={y(tick)+3} textAnchor="end">{tick}</text></g>)}
      {months.map((month,index)=>month.period===currentPeriod?<rect className="activity-current-band" key={month.period} x={x(index)-39} y="26" width="78" height="144" rx="3"/>:null)}
      <path d={enteredArea} fill={`url(#activity-area-${company})`}/>
      <path className="activity-line activity-line--opened" d={series("opened")}/>
      <path className="activity-line activity-line--closed" d={series("closed")}/>
      {months.map((month,index)=><g key={month.period} className="activity-observation">
        <line className="activity-observation-guide" x1={x(index)} x2={x(index)} y1="30" y2="170"/>
        <circle className="activity-point activity-point--opened" cx={x(index)} cy={y(number(month.opened))} r="4"/>
        <circle className="activity-point activity-point--closed" cx={x(index)} cy={y(number(month.closed))} r="4"/>
        <text className={month.period===currentPeriod?"activity-month-label is-current":"activity-month-label"} x={x(index)} y="198" textAnchor="middle">{monthName(month.period)}</text>
        <rect className="activity-observation-hit" x={x(index)-40} y="27" width="80" height="151"/>
        <g className="activity-observation-tip" transform={`translate(${x(index)-56} 39)`}>
          <rect width="112" height="57" rx="3"/>
          <text className="activity-tip-month" x="9" y="16">{monthName(month.period)} {month.period.slice(0,4)}</text>
          <text x="9" y="33">Solicitudes <tspan x="102" textAnchor="end">{number(month.opened)}</tspan></text>
          <text x="9" y="48">Cierres <tspan x="102" textAnchor="end">{number(month.closed)}</tspan></text>
        </g>
        <title>{monthName(month.period)}: {number(month.opened)} solicitudes creadas y {number(month.closed)} servicios cerrados</title>
      </g>)}
    </svg><figcaption>Mes en curso destacado · fechas de Chile continental <span className="chart-mobile-hint">· deslice para recorrer los meses</span></figcaption></figure>:<div className="company-chart-empty"><strong>Sin actividad en el período</strong><span>Las cifras aparecerán cuando se registren solicitudes de esta empresa.</span><Link href={`/solicitudes?empresa=${company}`}>Abrir solicitudes</Link></div>}
    {entered+closed>0&&<details className="company-chart-data"><summary>Ver cifras por mes</summary><div className="company-chart-data-table"><table><thead><tr><th>Mes</th><th>Solicitudes</th><th>Cierres</th></tr></thead><tbody>{months.map(month=><tr key={month.period}><th scope="row">{monthName(month.period)} {month.period.slice(0,4)}</th><td>{number(month.opened)}</td><td>{number(month.closed)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}

const stateColors:Record<string,string>={solicitada:"#d9b16c",programada:"#7f9eaf",en_ruta:"#70b5ab",pendiente_revision:"#c99b7c",completada:"#438b6a",cancelada:"#c6d1ca"};

export function StatusComposition({items,company}:{items:ServiceStatus[];company:string}){
  const total=items.reduce((sum,item)=>sum+item.count,0);
  const completed=items.find(item=>item.status==="completada")?.count??0;
  const circumference=2*Math.PI*64;
  let offset=0;
  const segments=items.filter(item=>item.count>0).map(item=>{
    const length=item.count/total*circumference;
    const segment={...item,length,offset};offset+=length;return segment;
  });
  return <section className={`section-card company-chart-card company-chart-card--status${total===0?" company-chart-card--empty":""}`} aria-labelledby="status-title">
    <div className="company-chart-head"><div><span className="eyebrow">DISTRIBUCIÓN ACTUAL</span><h2 id="status-title">Estado de la operación</h2><p>La cartera de servicios, etapa por etapa.</p></div></div>
    {total>0?<><div className="company-status-body"><svg className="company-status-ring" viewBox="0 0 180 180" role="img" aria-label={`${total} servicios registrados; ${completed} completados. ${items.map(item=>`${item.label}: ${item.count}`).join(". ")}`}>
      <circle className="ring-track" cx="90" cy="90" r="64" fill="none" strokeWidth="15"/>
      {segments.map(segment=><circle key={segment.status} cx="90" cy="90" r="64" fill="none" stroke={stateColors[segment.status]??"#a5b6aa"} strokeWidth="15" strokeDasharray={`${segment.length.toFixed(3)} ${(circumference-segment.length).toFixed(3)}`} strokeDashoffset={-segment.offset} transform="rotate(-90 90 90)"/>)}
      <text className="ring-total" x="90" y="89" textAnchor="middle" style={{fontSize:total>99999?24:30}}>{total.toLocaleString("es-CL")}</text><text className="ring-caption" x="90" y="108" textAnchor="middle">servicios</text>
    </svg><div className="company-status-chart">{items.map(item=><Link href={`/solicitudes?empresa=${company}&estado=${item.status}`} className="company-status-row" key={item.status}>
      <span className="company-status-dot" style={{background:stateColors[item.status]??"#a5b6aa"}} aria-hidden="true"/><span className="status-label">{item.label}</span><strong>{item.count.toLocaleString("es-CL")}</strong><small>{Math.round(item.count/total*100)}%</small>
    </Link>)}</div></div><p className="company-composition-caption"><strong>{Math.round(completed/total*100)}% completados</strong> sobre todos los servicios registrados, incluidos los cancelados.</p></>:<div className="company-chart-empty"><strong>Aún no hay servicios registrados</strong><span>Cuando comience la operación, aquí verá el avance por estado.</span><Link href={`/solicitudes?empresa=${company}`}>Revisar solicitudes</Link></div>}
  </section>;
}
