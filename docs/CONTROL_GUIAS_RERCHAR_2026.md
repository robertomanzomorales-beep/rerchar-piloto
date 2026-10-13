# Control de guías de RERCHAR · fuente operativa 2026

Fuente: `CONTROL GUIA RERCHAR CHILE AÑO 2026.xlsx`, hojas mensuales (en particular `SEPTIEMBRE`), `CONTROL FACT. SEPTIEMBRE` y `DIF. PESO SEPTIEMBRE`. El módulo `/control-guias` inicia una guía de RERCHAR sin crear una solicitud ficticia. Una guía tiene encabezado y uno o más materiales, como las filas que repiten el número de guía en la planilla.

| Planilla | Registro del módulo | Regla |
| --- | --- | --- |
| A–G: operación, fecha, N° guía, conductor, patente, empresa, material | Tipo y detalle de operación, fecha, número, transporte, contraparte e ítem de material | `venta`, `compra` o `traslado`; el detalle conserva expresiones como `VENTAS RT` |
| H–L: ticket faena, peso faena, complemento stock, ticket salida, salida | Campos del material y salida calculada | L = I + J; una salida sólo desde stock es válida |
| M–Q: ticket destino, llegada, devuelto, diferencia, observaciones | Llegada, devolución, diferencia y observaciones | P = N − (L − O); faltantes permanecen pendientes, no se vuelven cero |
| R–Y: impureza, peso factura, diferencia, precios y valores | Impureza, kg facturados, precios y totales calculados | T = (N − R) − S; W = U × (N − R); X = S × V; Y = W − X |
| Z–AC: factura, emisión, estado y pago | Número, fecha, estado y fecha de pago por ítem | Venta sin factura y factura no pagada generan alerta |
| AD–AJ: flete, transportista, factura, guía, pago y observación | Datos y estado de flete en encabezado | La referencia de guía distinta se marca para revisión |

La columna O es el material devuelto según la cabecera de la planilla. El ticket y peso de retorno se conservan aparte; no se aplican como otra resta. El control es operativo e imprimible; no emite documentos tributarios ni reemplaza la guía oficial.

Los controles anteriores asociados a servicios permanecen en sus fichas y se enlazan desde la vista general, sin duplicarse. La planilla histórica aún no está importada: sus filas con pesos ausentes, anulaciones y fórmulas requieren conciliación. `J` identifica material usado desde stock, pero no descuenta existencias ni afirma saldos hasta conciliar la bodega y los ingresos de material. Este límite también aparece en pantalla.

Para publicar el módulo, aplicar `db/019_control_guias_material.sql` en la base de datos y registrar esa migración antes de desplegar el código.
