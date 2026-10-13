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

Los controles anteriores asociados a servicios permanecen en sus fichas y se enlazan desde la vista general, sin duplicarse. La planilla histórica aún no está importada: sus filas con pesos ausentes, anulaciones y fórmulas requieren conciliación. Con la migración `020`, la columna `J` de **ventas nuevas** descuenta material del catálogo con saldo físico confirmado. La columna `I` (faena) sigue en tránsito y no se descuenta. Las guías creadas antes de `020` no generan un descuento retroactivo; se señalan cuando su salida desde stock requiere conciliación.

## Entrada de material y existencias

Fuente: `ENTRADA MATERIAL - 2026 (3).xlsx`, hojas mensuales y `DATOS`. El catálogo combina los nombres de materiales de esta planilla y de `CONTROL GUIA RERCHAR CHILE AÑO 2026.xlsx`, sin importar saldos, precios ni personas. `CONTROL BODEGA 2.xlsx` corresponde a insumos y EPP y se gestiona en el inventario de suministros, por separado.

| Entrada de material | Registro | Regla |
| --- | --- | --- |
| B–I: fecha, empresa/faena, conductor/RUT, camión/rampa, ticket, material | Ingreso directo de tercero o vinculado a servicio; catálogo con nombre alternativo | Directo exige conductor externo, RUT, patente, peso RERCHAR y guía de traslado/origen u hoja de ingreso; ticket opcional |
| J–L: peso, impureza, neto | Peso proveedor y RERCHAR, base elegida, impureza, neto calculado | Diferencia con neto anotado exige observación; al confirmar stock se usa peso físico RERCHAR menos impureza |
| M–R: informe, observaciones, guías y hoja de ingreso | Referencias y respaldo adjunto en PDF o imagen; hoja imprimible | Al menos ticket, guía o hoja documenta el ingreso; recepción directa requiere guía u hoja |
| S–V: factura, estado, certificado y acta | Referencias, estado de pago y adjuntos | El registro operativo no emite factura tributaria |

El alta de un ingreso **no suma stock automáticamente**. Administración u operaciones revisa la ficha y confirma que el material pasó a existencia comercial de RERCHAR. El asiento es idempotente y conserva el ingreso de origen. Administración puede cargar un único saldo inicial por material o ajustes con motivo y referencia. El saldo no se vuelve negativo y las correcciones de una guía generan movimientos inversos trazables. Un traslado o una compra registrados en CONTROL GUIA no aumentan por sí solos la existencia: se requiere recepción física confirmada.

Para publicar las existencias y la recepción directa después del módulo de guías, aplicar `db/020_stock_materiales_y_recepcion_directa.sql` y registrar esa migración antes de desplegar el código actualizado. No hay saldo inicial inferido desde datos históricos: un responsable debe conciliarlo con respaldo físico.
