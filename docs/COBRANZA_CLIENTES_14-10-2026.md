# Cobranza de clientes por empresa

La hoja `FACTURAS` de `SERVICIOS Y TRANSPORTES (CON ALERTAS) - 2026.xlsx` registra folio, cliente, monto facturado, emisión, vencimiento, pagos, saldo, días vencidos y alerta de 7 días. Las hojas mensuales relacionan propuesta/EDP, OC, factura y ejecución. Un mismo folio puede cubrir varios servicios o fletes falsos; el total de la propuesta no se reparte automáticamente entre filas.

## Flujo

1. En **Finanzas**, al asociar una factura externa de un servicio se registra el **total real del documento**, incluidas las cargas tributarias que correspondan, además de emisión y vencimiento. La tarifa neta queda separada.
2. En **Cobros extraordinarios**, una vez aprobado el cargo se informa el folio, emisión, vencimiento y total de la factura externa. Si coincide con una factura vigente del mismo cliente y empresa, se vincula. Si varios cargos comparten folio, todos apuntan a una única cuenta por cobrar. No se divide arbitrariamente su total ni se crea un DTE.
3. En **Cobranza clientes**, Administración filtra por empresa y por saldo, vencidas, próximos 7 días, pagadas o todas. Registra abonos comprobados de facturas extraordinarias, con fecha y referencia; los abonos de la factura principal siguen en Finanzas.
4. El panel de cada empresa muestra facturas vencidas, próximos vencimientos y documentos anteriores por conciliar. Anular un folio sin abonos devuelve sus cargos extraordinarios a `aprobado` y conserva el motivo en Auditoría.
5. Para E y J, un estado de pago aprobado puede enlazar una factura externa. Un folio ya registrado del mismo cliente se reutiliza, incluidos los cargos extraordinarios vinculados; varios EDP que comparten folio cuentan como una sola factura. La diferencia de montos entre factura y EDP asociados exige una explicación. Anular la factura sin abonos desvincula los EDP y reactiva el pendiente de facturación en el panel.
6. **Descargar vista CSV** exporta las facturas del filtro y empresa seleccionados con folio, cliente, origen, emisión, vencimiento, días vencidos, alerta, total, abonos, saldo y cantidad de EDP/cargos vinculados. Usa separador `;`, importes con coma decimal y fecha de Chile para abrirse en planillas locales. Igual que la vista, cubre hasta 500 facturas por empresa; el resumen superior contabiliza todas. Los documentos anteriores por conciliar no se suman ni exportan hasta confirmar el total real.

## Importes anteriores

La versión previa copiaba el neto valorizado al asociar una factura principal. La migración `039_cobranzas.sql` marca esas facturas como **por conciliar** sin cambiar el importe o los pagos históricos. Administración abre Finanzas, comprueba el documento externo y confirma el total; sólo después ese folio participa en los saldos y alertas. Los cargos extraordinarios que ya tenían folio requieren además vencimiento y total para vincularse.

La planilla se usó para diseñar y probar las reglas; no se cargaron facturas ni pagos históricos en la base productiva.
