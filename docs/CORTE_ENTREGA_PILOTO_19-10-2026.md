# Corte de entrega para revisión del piloto · 19 de octubre de 2026

**Acceso:** https://rerchar-piloto.vercel.app/ingresar. Seleccione RERCHAR o E y J al ingresar. Esta entrega es una versión para revisión de los procesos documentados y de las observaciones, no la aceptación del sistema productivo ni una migración de datos históricos.

## Recorrido sugerido para la revisión

| Empresa | Desde el menú | Acción que puede comprobar el responsable |
| --- | --- | --- |
| RERCHAR | Comercial → Cotizaciones → Nueva cotización | Crear borrador con cliente, presentación y objetivo; agregar y corregir conceptos y condiciones; descargar el PDF y revisar el formato antes de entregarlo. La propuesta de compra de material se cotiza en kg y su tratamiento de IVA queda identificado. |
| RERCHAR | Operación → Solicitudes y despacho → Servicio → Seguimiento | Ver guía de despacho y registrar fecha de solicitud, plazo pactado, responsable, recepción de guía valorizada y envío de documentos. Operación → Guías valorizadas muestra atrasos y guías próximas a vencer. |
| RERCHAR | Operación → Control de guías · material e Ingreso de material | Revisar guía de compra o venta, pesajes, diferencias, existencia de material, documentos adjuntos, hoja de ingreso y borrador de solicitud de guía valorizada. Confirmar stock sólo tras la recepción física. |
| E y J | Comercial → Cotizaciones → Nueva cotización | Entrar desde E y J, comprobar emisor, vigencia inicial de diez días, servicios y disposición, ruta, costos, precio, PDF y decisión del cliente. |
| E y J | Operación → Solicitudes y despacho | Revisar guía de despacho, hoja de servicio, ticket, SIDREP y cierre; la guía valorizada de compra de RERCHAR no se exige para E y J. |
| E y J | Cierre y control → Calendario de EDP · E y J → Período | Revisar cliente, corte y envío; descargar consolidado CSV con documentos y pesajes estructurados; vincular o crear el EDP del período y cargar servicios elegibles. |
| E y J | Cierre y control → Estados de pago · E y J → EDP | Revisar operaciones, cargos CLP/UF y PDF; registrar envío/aprobación, OC del cliente posterior o excepción y factura externa. Consultar saldos en Cobranza clientes. |
| Ambas | Abastecimiento y Recursos compartidos | Comprobar compras, recepciones, facturas de proveedor, transferencias, inventario, flota, personal, mantenimiento y alertas con casos de prueba. |

## Evidencia técnica de este corte

- Se aplicaron las 59 migraciones numeradas disponibles (hasta la `060`) en una base aislada de revisión, sin tocar registros del cliente.
- Se abrieron con una sesión de administrador local las dos empresas, las fichas de cotización y servicio, el calendario/EDP y todas las entradas principales del menú. Las respuestas HTML fueron 200 y no devolvieron una página de error; esto comprueba carga de servidor, no cada interacción de usuario.
- Se descargaron dos PDF de cotización y un CSV consolidado EDP desde rutas autenticadas locales; ambos PDF se renderizaron y revisaron visualmente. El formato exacto acordado con cada cliente todavía debe cotejarse con sus originales.
- `npm test`, `npm run typecheck` y `npm run build` son controles de publicación. Registrar el resultado y el estado de Vercel al publicar cada lote.
- La URL pública responde en el acceso. Sin sesión, el panel redirige al ingreso y la descarga de EDP rechaza la solicitud. Una prueba autenticada con los usuarios reales en el despliegue sigue siendo parte de la revisión de RERCHAR.

## Aspectos que deben validar con datos reales

1. Texto, firmas, acreditaciones y condiciones de cada cotización antes de enviarla. Un PDF histórico ya descargado no cambia; vuelva a descargarlo después de corregir un borrador. Si el texto original ya contiene signos de interrogación en la base, debe corregirse en el formulario antes de generar el PDF.
2. Serie y último correlativo oficial de órdenes de compra, datos bancarios, RUT, destinatarios y permisos antes de emitir documentos externos.
3. Tarifas de Jorge y su vigencia, categoría del residuo, permisos del destino, precios de disposición, equivalencia UF y método de facturación. No se cargaron tasas inventadas.
4. Columnas del consolidado mensual de Carol y correspondencia con su planilla original; el CSV utiliza datos estructurados. No se extrae texto automáticamente de PDFs escaneados.
5. Regla de OC para servicios puntuales frente al contrato mensual con EDP, destinatarios de notificaciones y responsables de cada etapa.
6. Las observaciones de la matriz conservan sus estados de revisión; la prueba automática no equivale a aprobación de Jorge, Carol, Johana, Francisco, Hugo, Eduardo o Renato.

No cargar ni enviar cotizaciones, órdenes, facturas o certificados ficticios como operaciones reales. Registrar cada discrepancia con empresa, módulo, folio, paso, resultado esperado y captura. La solicitud de una tercera empresa exportadora se evalúa como alcance separado.
