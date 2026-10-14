# Estados de pago de E y J: formatos y uso

## Fuentes recibidas

- `EDP N° 01 Echeverria Izquierdo - Enero 2026.xlsx`, hoja `Enero 2026`: servicios de transporte y disposición final, con peso, ticket, hoja de servicio, guía de despacho, SIDREP y valorización en CLP y UF por tonelada.
- `EDP N°01 - AGOSTO 2026 ARRIENDO EXCAVADORA JRC.xlsx`, hoja `JULIO 2026`: período del estado de pago, fechas de arriendo, tarifa en UF, valor UF en CLP, neto, IVA y total.

Los archivos son referencias de formato. La migración no crea EDP históricos ni introduce clientes, folios, tarifas o valores UF reales. La administración registra y verifica esos datos contra el contrato y los respaldos originales.

## Correspondencia de campos

| Formato de planilla | Pantalla de EDP | Regla |
| --- | --- | --- |
| N° EDP, período, razón social, RUT, domicilio y contacto del cliente | Encabezado | El cliente se selecciona del maestro y los datos del documento quedan como copia editable; contacto del emisor y administrador de contrato son opcionales por documento. |
| Fecha, descripción, peso kg, ticket, hoja de servicio, guía y SIDREP | Ítem operativo de residuos | Cada fila conserva sus números de respaldo; se marca si corresponde a disposición final. |
| Transporte / servicio en CLP | Cobro `CLP × cantidad de servicios` | Valor unitario por cantidad. |
| Disposición en UF por tonelada | Cobro `UF × toneladas de disposición` | Suma sólo los kg de ítems marcados como disposición, divide por 1.000 y aplica la UF registrada. El transporte del mismo ticket no duplica el peso. |
| Arriendo de excavadora y fechas desde/hasta | Ítem operativo de arriendo | Se registra el tramo de arriendo como respaldo. |
| Tarifa UF de arriendo y UF del período | Cobro `UF × cantidad de unidades` | Tarifa UF por cantidad por valor UF en CLP. |
| Neto, IVA 19% y total | Resumen valorizado | Cada línea se redondea a CLP; IVA se redondea sobre el neto. No se emite factura tributaria. |

## Flujo

1. Seleccionar **E y J** y abrir **Estados de pago** en **Cierre y control**.
2. Administración crea el encabezado y elige **Transporte y disposición** o **Arriendo**. Si lo crea desde **Calendario de cortes y envíos**, el borrador queda vinculado al período en la misma transacción y vuelve al calendario para incorporar los respaldos. Se verifica cliente, formato y fecha del período; un reenvío no genera un segundo EDP. También se puede crear sin calendario y vincularlo después.
3. En un borrador, **Incorporar servicio ejecutado** ofrece los servicios completados de E y J para el mismo cliente y el formato correcto. Copia fecha real de cierre, peso neto (bruto menos tara), guía, ticket, hoja y SIDREP, o las fechas de arriendo. La fuente queda vinculada y el ítem conserva una copia editable para revisión. Si falta el cierre o pesaje, se corrige primero en Operaciones. También puede agregar una operación manual respaldada.
4. El mismo servicio de residuos puede originar un ítem de transporte y uno de disposición final, como en la planilla: cada categoría se incorpora una sola vez y no se puede usar el servicio en otro EDP. Sólo la categoría de disposición suma toneladas para el cobro en UF/ton. La fecha del servicio puede diferir del mes del encabezado, tal como ocurre en el formato recibido; administración verifica qué período contractual corresponde.
5. Agrega los cobros según contrato. No se copia automáticamente un importe desde el servicio: para UF registra valor y fecha de la UF utilizada, y para CLP revisa tarifa y cantidad.
6. Revisa la vista imprimible, el neto, el IVA y el total. **Descargar EDP en PDF** genera un archivo propio para el formato de residuos (horizontal, con fecha, peso, ticket, hoja, guía y SIDREP) o arriendo (vertical, con fechas desde/hasta). La valorización incluye unitario, UF y fecha, cantidad, neto, IVA y total. Un borrador incompleto muestra los importes pendientes; no los reemplaza por cero. El PDF paginado conserva todas las filas y observaciones. También puede imprimir la vista desde el navegador.
7. Marca **enviado**. Un documento enviado se puede **aprobar** u **observar**; un observado vuelve a ser editable. El aprobado queda cerrado. Operaciones puede consultar, administración puede editar y cambiar estados.
8. Sobre un EDP **aprobado**, Administración vincula el folio, emisión, vencimiento y total real de la factura emitida fuera del sistema. Se revisa si el folio ya existe para el mismo cliente y E y J en Finanzas o Cobranza; en ese caso se reutiliza la cuenta y no se suma otro saldo. Si el total real difiere del EDP o de la suma de varios EDP vinculados al folio, se exige una explicación registrada en Auditoría. La vista del EDP muestra factura, abonos y saldo; Cobranza permite registrar abonos y conserva los filtros de vencimiento. No se crea un DTE.
9. Si la factura externa se anula sin pagos, se desvincula del EDP y el EDP aprobado vuelve a la alerta **sin factura asociada**. Una factura con pagos no puede anularse desde el sistema.

## Publicación

Las migraciones de Neon van en orden: `020_stock_materiales_y_recepcion_directa.sql`, luego `021_estados_pago_eyj.sql`. Se registran en `schema_migrations`; `npm run db:migrate` omite las ya aplicadas. La pantalla de RERCHAR conserva un panel de lectura mientras falta la 020, con stock pendiente, y E y J muestra EDP pendiente mientras falta la 021.

El vínculo del respaldo a servicios requiere también `037_resultado_diario.sql` y `040_edp_servicios.sql`. Si aún falta esta última, el EDP anterior sigue abriendo y la opción de incorporar un servicio aparece tras ejecutar la migración.

La asociación con la factura y Cobranza requiere `039_cobranzas.sql` y `041_edp_factura_cobranza.sql`. Antes de la 041, las pantallas anteriores continúan visibles; tras aplicarla, se habilitan el formulario de factura y la alerta de EDP aprobados pendientes de vínculo. Los ejemplos de EDP sirven como formato y no se cargan como documentos históricos reales.
