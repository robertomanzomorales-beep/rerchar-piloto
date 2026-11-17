# Revisión de la beta RERCHAR — entrega objetivo 18 de noviembre de 2026

Preparación técnica verificada el 16/11/2026. Acceso: https://rerchar-piloto.vercel.app/ingresar.

## Estado para la revisión

La última versión conserva el panel profesional de RERCHAR en verde y E y J en azul. Cobranza filtra en la base de datos, pagina todos los casos y exporta el filtro completo por lotes. Los abonos y anulaciones conservan empresa, filtro y página. La venta de material comparte facturas sin duplicar saldos y conserva las guías al anular.

La matriz vigente registra 84 observaciones: 75 disponibles para probar, 2 parciales y 7 ampliaciones a evaluar. Este control técnico no modifica los vistos buenos de los responsables.

## Recorrido por responsable

| Responsable / operación | Recorrido | Resultado a contrastar con su caso real |
| --- | --- | --- |
| Carol / RERCHAR | Cotización → solicitud → guía → ingreso de material → documentos administrativos | Folios, pesos, impurezas, guía valorizada, factura, estado de pago y expediente enlazados. |
| Carol / E y J | Cotización → OC o excepción autorizada → servicio → calendario → EDP | Empresa y formato correctos; servicios, documentos, consolidado Excel/CSV y factura vinculados. |
| Jorge / operación | Ruta y costos → planificación → parte diario → cierre | Costos y tarifas de su planilla, patente/conductor, jornadas y pendientes documentales coherentes. |
| Administración / cobros | Cobranza → filtros → páginas → CSV → abono o anulación | Mismo conjunto de facturas que el panel, saldo actualizado y retorno al filtro/página usados. |
| Johana / Francisco | Factura recibida → solicitud de transferencia → aprobación → comprobante → verificación | Respaldo y responsables registrados, sin duplicar el pago. |
| Don Hugo / recursos | Flota → mantenimiento → combustible → inventario | Disponibilidad, lecturas, costos, repuestos y alertas acordes con los datos que aporten. |
| Cliente / portal | Cotizaciones y servicios propios → documentos y certificado disponible | Sólo su empresa cliente; los documentos y estados coinciden con lo entregado. |

Registrar las diferencias por escrito en la matriz con empresa operadora, módulo, folio, paso realizado, resultado esperado/obtenido y captura. Mantener las reuniones como excepción después de esa revisión escrita.

## Dos dependencias abiertas

| Observación | Falta para cerrarla | Operación disponible mientras se completa |
| --- | --- | --- |
| 1. Formato de cotización / SICEP | Certificado vigente emitido a RERCHAR. El respaldo de LOA RENTAL no permite acreditar a RERCHAR. | PDF con la marca RERCHAR y los respaldos propios incorporados, sin atribuirle SICEP ajeno. |
| 76. Respuesta por enlace y acuse de correo | SMTP configurado y correo de prueba recibido en Gmail con SPF/DKIM correctos. Completar el recorrido público con una cotización de revisión acordada: PDF, enlace, respuesta y recepción del acuse. | Envío SMTP habilitado. También puede descargar el PDF y registrar entrega manual, destinatario y constancia; la decisión está disponible desde el portal autenticado. |

Los siete procesos clasificados como ampliación conservan su evaluación separada, entre ellos el circuito integral de compras del local y sus automatizaciones.

## Evidencia técnica del 16/11

- Se agregó un recorrido SMTP aislado para ambas empresas: verifica el PDF adjunto contra su respaldo, la copia, la decisión única y el acuse. Se corrigió el vencimiento del enlace para incluir todo el último día en horario de Chile, conservando el máximo de catorce días.
- El correo genérico enviado desde la casilla corporativa se recibió en Recibidos de Gmail. La prueba temporal fue desactivada; los recorridos automatizados usan destinatarios ficticios y un servidor local.
- 42 pruebas automáticas aprobadas y ninguna fallida, incluida Cobranza con 502 facturas, CSV, venta de material, EDP, cotizaciones por SMTP, inventario y transferencias.
- TypeScript y compilación de producción correctos.
- 68 migraciones aplicadas en la base aislada de revisión.
- 135 comprobaciones HTTP completadas con administración, operaciones, conductor, cliente y visitante sin sesión. Incluyen pantallas principales de ambas empresas, fichas, PDF, Excel, CSV, filtros inválidos y restricciones de acceso sobre dos clientes ficticios.
- La revisión HTTP comprueba respuesta de servidor, contenido y descargas. No sustituye la comprobación visual móvil ya registrada el 15/11 ni la revisión de casos reales por los responsables.
- Se corrigió una advertencia de React en el título accesible del gráfico sin alterar su diseño ni cálculos. No se agregaron migraciones ni se usaron registros reales para las pruebas locales.

Para continuidad del desarrollo, consultar `docs/CONTINUIDAD_RERCHAR.md` y verificar el check **Vercel – rerchar-piloto** del commit publicado. El proyecto duplicado `rerchar-piloto-pjlu` es independiente del despliegue principal.
