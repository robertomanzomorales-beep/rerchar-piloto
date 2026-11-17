# Revisión de la beta RERCHAR — entrega objetivo 18 de noviembre de 2026

Preparación técnica verificada el 16/11/2026. Acceso: https://rerchar-piloto.vercel.app/ingresar.

## Estado para la revisión

La última versión conserva el panel profesional de RERCHAR en verde y E y J en azul. Cobranza filtra en la base de datos, pagina todos los casos y exporta el filtro completo por lotes. Los abonos y anulaciones conservan empresa, filtro y página. La venta de material comparte facturas sin duplicar saldos y conserva las guías al anular.

La matriz vigente registra 84 observaciones: 76 disponibles para probar, 1 parcial y 7 ampliaciones a evaluar. El formato N.º 1 incorpora los logos RERCHAR y SICEP, junto con la franja de certificaciones aportada por Roberto el 17/11. Este control técnico no modifica los vistos buenos de los responsables.

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

## Punto pendiente de prueba real

| Observación | Falta para cerrarla | Operación disponible mientras se completa |
| --- | --- | --- |
| 76. Respuesta por enlace y acuse de correo | Completar el recorrido público con una cotización de revisión acordada: recepción del PDF, apertura del enlace, respuesta y recepción del acuse. | SMTP configurado y correo genérico comprobado en Gmail con SPF/DKIM correctos. También puede descargar el PDF y registrar entrega manual, destinatario y constancia; la decisión está disponible desde el portal autenticado. |

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

## Verificación adicional del 17/11

- Se incorporaron los originales `sicep.png` y `CERT-PIE-Rerchar(1).png` al formato RERCHAR, conservando transparencia y proporciones. Se revisó el PDF de una página y su continuación. La observación N.º 1 pasa a disponible para revisión. Su alcance es incorporar los logos; se retira el requisito adicional de un certificado y la referencia ajena de la matriz.
- Se corrigió una confirmación que dependía de parámetros del enlace y podía aparecer sin respuesta registrada. La confirmación y el resultado del acuse ahora proceden de la base y de su auditoría, incluso al volver a abrir la página.
- El recorrido `npm run test:quote-response-http` verificó ambas empresas mediante seis cotizaciones ficticias. Incluye aceptación y rechazo, dos respuestas simultáneas con una sola decisión, enlace vencido o reemplazado, respuesta repetida y acuse rechazado por el servidor SMTP local. Los nueve mensajes de prueba permanecieron en memoria.
- Las 48 pruebas del proyecto, TypeScript y la compilación de producción pasaron. La prueba de revisión confirma que un acuse anterior no se atribuye a la nueva versión de una propuesta.
- Estos resultados completan evidencia técnica de N.º 76. Sigue pendiente el recorrido publicado con un caso de revisión acordado y la recepción del acuse por el destinatario. Los estados y aprobaciones de la matriz se conservan.

Para continuidad del desarrollo, consultar `docs/CONTINUIDAD_RERCHAR.md` y verificar el check **Vercel – rerchar-piloto** del commit publicado. El proyecto duplicado `rerchar-piloto-pjlu` es independiente del despliegue principal.
