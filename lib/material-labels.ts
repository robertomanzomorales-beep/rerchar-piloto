const paymentLabels:Record<string,string>={pendiente:"Pendiente",parcial:"Pago parcial",pagado:"Pagado",no_aplica:"No aplica"};
export const materialPaymentLabel=(status:string)=>paymentLabels[status]??"Por confirmar";
export const materialInvoiceLabel=(direction:string|null)=>direction==="emitida"?"Emitida por RERCHAR":direction==="recibida"?"Recibida por RERCHAR":"Por confirmar";
export const materialReceiptLabel=(mode:string|null,kind:string)=>kind==="excedente"?"Excedente":mode==="directa"?"Recepción directa":mode==="programada"?"Vinculada a servicio":"Entrada de material";
