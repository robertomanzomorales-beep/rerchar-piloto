type QuoteStepsProps={current:1|2|3;linked?:boolean;contentTarget?:"conceptos"|"edicion-conceptos"};

const steps=[
  {number:1,label:"Cliente y presentación",target:"presentacion"},
  {number:2,label:"Conceptos y costos",target:"conceptos"},
  {number:3,label:"Revisión y entrega",target:"entrega"},
] as const;

export function QuoteSteps({current,linked=false,contentTarget="conceptos"}:QuoteStepsProps){
  return <nav className="quote-steps" aria-label="Etapas de la cotización">
    <ol>{steps.map(step=>{
      const state=step.number<current?"complete":step.number===current?"current":"upcoming";
      const content=<><span className="quote-step-number">{String(step.number).padStart(2,"0")}</span><span className="quote-step-copy"><strong>{step.label}</strong><small>{state==="complete"?"Completado":state==="current"?"Etapa actual":"Siguiente"}</small></span></>;
      return <li key={step.number} className={`quote-step quote-step--${state}`}>
        {linked?<a href={`#${step.number===2?contentTarget:step.target}`} aria-current={state==="current"?"step":undefined}>{content}</a>:<span aria-current={state==="current"?"step":undefined}>{content}</span>}
      </li>;
    })}</ol>
  </nav>;
}
