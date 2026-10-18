import type {Quote,QuoteLine} from "@/lib/quotes";
import type {QuoteDestination} from "@/lib/destinations";
import {calculateQuoteCost,mapsConfigured,type QuoteRoute,type QuoteCosting} from "@/lib/quote-planning";
import {saveQuoteRouteAction,calculateMapRouteAction,saveQuoteCostingAction,applySuggestedPriceAction} from "@/app/quote-planning-actions";
import {SubmitButton} from "@/components/Transition";

type Asset={id:string;code:string;label:string;kind:string};
const money=(value:number)=>`$${value.toLocaleString("es-CL")}`;
const km=(value:string|number)=>`${Number(value).toLocaleString("es-CL",{maximumFractionDigits:2})} km`;
function Numeric({name,label,value="0",step="0.01",min="0"}:{name:string;label:string;value?:string|number;step?:string;min?:string}){
  return <label>{label}<input name={name} type="number" step={step} min={min} defaultValue={value} required/></label>;
}
export function QuotePlanningPanel({quote,lines,destinations,assets,route,cost,quotedNet}:{quote:Quote;lines:QuoteLine[];
  destinations:QuoteDestination[];assets:Asset[];route:QuoteRoute|null;cost:QuoteCosting|null;quotedNet:number}){
  const editable=quote.status==="borrador";
  const first=destinations.find(d=>d.id===lines.find(line=>line.destination_id)?.destination_id);
  const address=(d:QuoteDestination|undefined)=>d?.address?[d.address,d.commune].filter(Boolean).join(", "):
    d?.latitude&&d.longitude?`${d.latitude},${d.longitude}`:"";
  const plant=destinations.find(d=>d.name==="Planta RERCHAR Calama");
  const origin=route?.origin??(quote.issuer==="rerchar"?address(plant):"");
  const pickup=route?.pickup??quote.client_address??"";
  const destination=route?.destination??address(first);
  const back=route?.return_to??origin;
  let calculated:ReturnType<typeof calculateQuoteCost>|null=null,calculationError="";
  if(cost){try{calculated=calculateQuoteCost(cost,Number(route?.total_km??0),Number(quote.vat_rate));}
    catch(error){calculationError=error instanceof Error?error.message:"Revise el cálculo interno.";}}
  return <>
    <section className="section-card"><div className="page-title-row"><div><h2>Recorrido de la cotización</h2><p className="helper-text">Planta → retiro del cliente → destino final → regreso a planta. Un circuito principal por cotización.</p></div></div>
      {first&&<p className="helper-text">Destino del concepto: <strong>{first.name}</strong>. Confirme su dirección exacta antes de calcular.</p>}
      {route?<><div className="facts-grid"><div className="fact"><span>Planta → retiro</span><strong>{km(route.pickup_km)}</strong></div><div className="fact"><span>Retiro → destino</span><strong>{km(route.destination_km)}</strong></div><div className="fact"><span>Destino → planta</span><strong>{km(route.return_km)}</strong></div><div className="fact"><span>Circuito total</span><strong>{km(route.total_km)}</strong></div></div>
        <p className="helper-text">{route.origin} → {route.pickup} → {route.destination} → {route.return_to} · {route.source==="mapa"?"Referencia vial por mapas":"Registro manual"} · {new Date(route.calculated_at).toLocaleString("es-CL",{timeZone:"America/Santiago"})}</p>
        <p><a href={route.route_url} target="_blank" rel="noopener noreferrer">Abrir recorrido en Google Maps ↗</a></p>
        <p className={route.reviewed_for_truck?"helper-text":"notice notice-error"}>{route.reviewed_for_truck?`Ruta revisada para el vehículo. ${route.correction_reason??""}`:"Pendiente de revisión de restricciones para el camión. Google Maps puede proponer vías no aptas."}</p>
      </>:<p className="helper-text">Aún no se ha registrado el circuito ni sus kilómetros.</p>}
      {editable&&<><details className="quote-line-editor" open={!route}><summary><span>Registrar o corregir tramos</span><strong>Ruta manual</strong></summary>
        <form action={saveQuoteRouteAction} className="form-grid"><input name="quote_id" type="hidden" value={quote.id}/>
          <label>Planta de origen<input name="origin" defaultValue={origin} minLength={5} maxLength={250} required placeholder="Dirección completa, Calama"/></label>
          <label>Retiro en cliente<input name="pickup" defaultValue={pickup} minLength={5} maxLength={250} required/></label>
          <label>Destino final<input name="destination" defaultValue={destination} minLength={5} maxLength={250} required placeholder={first?.name??"Dirección completa de recepción"}/></label>
          <label>Retorno a la misma planta<input name="return_to" defaultValue={back} minLength={5} maxLength={250} required/></label>
          <Numeric name="pickup_km" label="Planta → retiro (km)" value={route?.pickup_km??"0"}/>
          <Numeric name="destination_km" label="Retiro → destino (km)" value={route?.destination_km??"0"}/>
          <Numeric name="return_km" label="Destino → planta (km)" value={route?.return_km??"0"}/>
          <label className="field-full">Motivo o respaldo de la ruta revisada<textarea name="correction_reason" minLength={5} maxLength={500} required defaultValue={route?.correction_reason??""} placeholder="Ruta revisada con operador; desvío de camión por..." rows={2}/></label>
          <label className="check-row field-full"><input type="checkbox" name="reviewed_for_truck" required defaultChecked={route?.reviewed_for_truck??false}/> Revisé el trayecto y las restricciones para el vehículo real</label>
          <div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar circuito revisado</SubmitButton></div>
        </form></details>
        <details className="quote-line-editor"><summary><span>Estimar distancias de los tres tramos</span><strong>Calcular con mapas</strong></summary>
          <p className="helper-text">Use direcciones completas o coordenadas verificadas. Distancia vial para automóvil como referencia. En Chile no hay cálculo automático certificado para camiones. Después de estimar, revise el recorrido y guarde los tramos corregidos arriba.</p>
          {mapsConfigured()?<form action={calculateMapRouteAction} className="form-grid"><input name="quote_id" type="hidden" value={quote.id}/>
            <label>Planta de origen<input name="origin" defaultValue={origin} required minLength={5} maxLength={250}/></label>
            <label>Retiro en cliente<input name="pickup" defaultValue={pickup} required minLength={5} maxLength={250}/></label>
            <label>Destino final<input name="destination" defaultValue={destination} required minLength={5} maxLength={250}/></label>
            <label>Retorno a la misma planta<input name="return_to" defaultValue={back} required minLength={5} maxLength={250}/></label>
            <div className="field-full form-footer"><SubmitButton className="button button-outline">Calcular kilómetros</SubmitButton></div>
          </form>:<p className="helper-text">Para habilitar mapas, configure GOOGLE_MAPS_ROUTES_API_KEY en el servidor. La ruta manual ya funciona.</p>}
        </details></>}
    </section>
    <section className="section-card"><h2>Cálculo interno de costos y precio</h2><p className="helper-text">Sólo administración y operaciones. Cada costo se ingresa por viaje; combustible considera kilómetros totales × viajes. El margen es porcentaje del precio neto de venta.</p>
      {calculationError&&<p className="notice notice-error">{calculationError}</p>}
      {calculated&&<><div className="facts-grid"><div className="fact"><span>Combustible · {cost?.trips} viaje(s)</span><strong>{money(calculated.fuel)}</strong></div><div className="fact"><span>Costo directo</span><strong>{money(calculated.direct)}</strong></div><div className="fact"><span>Contingencia</span><strong>{money(calculated.contingency)}</strong></div><div className="fact"><span>Costo total</span><strong>{money(calculated.cost)}</strong></div><div className="fact"><span>Venta neta sugerida</span><strong>{money(calculated.net)}</strong></div><div className="fact"><span>IVA sugerido</span><strong>{money(calculated.vat)}</strong></div><div className="fact"><span>Total sugerido</span><strong>{money(calculated.total)}</strong></div><div className="fact"><span>Neto ofertado − sugerido</span><strong>{money(quotedNet-calculated.net)}</strong></div></div>
        {quotedNet<calculated.net&&<p className="notice notice-error">El neto actual de la cotización está por debajo del precio sugerido. Revise los conceptos antes de emitir.</p>}
      </>}
      {editable&&<><details className="quote-line-editor" open={!cost}><summary><span>{cost?"Editar supuestos y costos":"Completar costos de la operación"}</span><strong>Calculadora</strong></summary>
        <form action={saveQuoteCostingAction} className="form-grid"><input name="quote_id" type="hidden" value={quote.id}/>
          <Numeric name="trips" label="Cantidad de viajes" value={cost?.trips??"1"} step="1" min="1"/>
          <label>Vehículo / equipo<select name="asset_id" defaultValue={cost?.asset_id??""}><option value="">Sin seleccionar</option>{assets.map(a=><option key={a.id} value={a.id}>{a.code} · {a.label} ({a.kind})</option>)}</select></label>
          <label>Equipo o modalidad<input name="equipment" defaultValue={cost?.equipment??""} maxLength={120} placeholder="Camión tolva, pluma, batea..."/></label>
          <Numeric name="capacity" label="Capacidad por viaje" value={cost?.capacity??"0"}/>
          <label>Unidad de capacidad<select name="capacity_unit" defaultValue={cost?.capacity_unit??"tonelada"}><option value="tonelada">Tonelada</option><option value="m³">m³</option></select></label>
          <Numeric name="km_per_liter" label="Rendimiento (km/L)" value={cost?.km_per_liter??"0"}/>
          <Numeric name="fuel_price_clp" label="Combustible (CLP/L)" value={cost?.fuel_price_clp??"0"}/>
          <Numeric name="equipment_cost_clp" label="Vehículo y equipo por viaje (CLP)" value={cost?.equipment_cost_clp??"0"}/>
          <Numeric name="tolls_clp" label="Peajes por viaje (CLP)" value={cost?.tolls_clp??"0"}/>
          <Numeric name="driver_hours" label="Horas conductor por viaje" value={cost?.driver_hours??"0"}/>
          <Numeric name="driver_hour_clp" label="Costo hora conductor (CLP)" value={cost?.driver_hour_clp??"0"}/>
          <Numeric name="support_hours" label="Horas apoyo por viaje" value={cost?.support_hours??"0"}/>
          <Numeric name="support_hour_clp" label="Costo hora apoyo (CLP)" value={cost?.support_hour_clp??"0"}/>
          <Numeric name="per_diem_clp" label="Viáticos por viaje (CLP)" value={cost?.per_diem_clp??"0"}/>
          <Numeric name="loading_clp" label="Carga y descarga por viaje (CLP)" value={cost?.loading_clp??"0"}/>
          <Numeric name="disposal_quantity" label="Cantidad a disponer por viaje" value={cost?.disposal_quantity??"0"}/>
          <label>Unidad de disposición<select name="disposal_unit" defaultValue={cost?.disposal_unit??"tonelada"}><option value="tonelada">Tonelada</option><option value="m³">m³</option></select></label>
          <Numeric name="disposal_unit_clp" label="Tarifa de disposición por unidad (CLP)" value={cost?.disposal_unit_clp??"0"}/>
          <Numeric name="stay_clp" label="Estadía por viaje (CLP)" value={cost?.stay_clp??"0"}/>
          <Numeric name="other_clp" label="Otros costos por viaje (CLP)" value={cost?.other_clp??"0"}/>
          <Numeric name="contingency_pct" label="Contingencia (%)" value={cost?.contingency_pct??"0"}/>
          <Numeric name="margin_pct" label="Margen deseado (%)" value={cost?.margin_pct??"0"}/>
          <div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar cálculo interno</SubmitButton></div>
        </form></details>
        {calculated&&lines.length===1&&Number(lines[0].quantity)===1&&lines[0].taxable&&lines[0].currency!=="UF"&&route?.reviewed_for_truck&&<form action={applySuggestedPriceAction} className="form-footer"><input name="quote_id" type="hidden" value={quote.id}/><SubmitButton className="button button-outline">Aplicar neto sugerido al único concepto</SubmitButton></form>}
        <p className="helper-text">Si hay varios conceptos o cantidades, ajuste sus precios unitarios arriba según el alcance. El cálculo interno no se adjunta ni se exporta al cliente.</p>
      </>}
    </section>
  </>;
}
