export default function Loading(){
  return <div className="page-loading" role="status" aria-label="Abriendo sección">
    <div className="page-loading-mark" aria-hidden="true"><span className="loading-brand-rerchar">RERCHAR</span><span className="loading-brand-divider">·</span><span className="loading-brand-eyj">E y J</span></div>
    <span className="page-loading-rule" aria-hidden="true"><i/></span>
    <p>Abriendo sección</p>
  </div>;
}
