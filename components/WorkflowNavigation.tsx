type WorkflowLink={id:string;label:string;detail?:string};

export default function WorkflowNavigation({label,items}:{label:string;items:WorkflowLink[]}){
  return <nav className="workflow-navigation print-hide" aria-label={label}>
    <div className="workflow-navigation-heading"><span className="eyebrow">CONTINUAR GESTIÓN</span><strong>{label}</strong></div>
    <div className="workflow-navigation-links">{items.map(item=><a key={item.id} href={`#${item.id}`}><span>{item.label}</span>{item.detail&&<small>{item.detail}</small>}</a>)}</div>
  </nav>;
}
