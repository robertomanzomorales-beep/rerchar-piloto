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
2. Administración crea el encabezado y elige **Transporte y disposición** o **Arriendo**.
3. Agrega operaciones respaldadas y cobros. En cada cobro en UF registra el valor UF y su fecha; el sistema no descarga una tasa automáticamente.
4. Revisa la vista imprimible, el neto, el IVA y el total; imprime o guarda en PDF desde el navegador.
5. Marca **enviado**. Un documento enviado se puede **aprobar** u **observar**; un observado vuelve a ser editable. El aprobado queda cerrado. Operaciones puede consultar, administración puede editar y cambiar estados.

## Publicación

Las migraciones de Neon van en orden: `020_stock_materiales_y_recepcion_directa.sql`, luego `021_estados_pago_eyj.sql`. Se registran en `schema_migrations`; `npm run db:migrate` omite las ya aplicadas. La pantalla de RERCHAR conserva un panel de lectura mientras falta la 020, con stock pendiente, y E y J muestra EDP pendiente mientras falta la 021.
