# Continuidad RERCHAR — 17 de noviembre de 2026

## Solicitudes y programación semanal — 18/11

- Se eliminó la selección automática del primer cliente al iniciar una solicitud administrativa. Un error de servidor conserva los valores en el mismo formulario, con aviso y foco, incluyendo empresa, ruta, fechas, centro nuevo, dirección y clave de reintento. El cambio de cliente limpia el nuevo centro/dirección. No se implementa un autoguardado externo del borrador.
- Se retiraron los recortes silenciosos de viajes/partes de la semana y de la agenda de cliente/conductor, manteniendo fechas acotadas y permisos. Los totales de pendientes/prioridades consideran la cola completa, aunque la lista breve muestre sesenta. Los enlaces de programación conservan empresa.
- Se afinó la planilla con cabecera/columna fija, día actual destacado y acentos propios de cada empresa. No se agregan migraciones ni módulos.
- **64 pruebas aprobadas**, TypeScript y recorrido HTTP de error/corrección/reintento para RERCHAR y E y J correctos. El recorrido repetible queda en `npm run test:request-form-http`. Ver `docs/REVISION_SOLICITUDES_AGENDA_18-11-2026.md`.
- Se corrigió el empaquetado del verificador HTTP: las fixtures y scripts de verificación no se despliegan. La compilación pasó también sobre una copia con las exclusiones efectivas de producción (304 archivos). El primer intento de despliegue falló por esa dependencia de prueba; comprobar el despliegue del ajuste antes de darlo por publicado.
- Se conservaron matriz, VB, datos operativos reales y clasificación de alcance. SII automático continúa incluido y pendiente.

## Experiencia visual y adaptación — 18/11

- Roberto pidió revisar también la experiencia y estética. Se accedió al sitio publicado mediante el formulario seguro del navegador; se pudo inspeccionar visualmente el selector, panel, Reportes, SII y Nueva cotización. La limitación visual de los cortes anteriores queda superada para este recorrido.
- Se reprodujo desbordamiento de Reportes: ancho CSS 681 px y documento de 945 px. Las tablas ahora desplazan dentro de su contenedor en todos los anchos. Se ordenaron filtros y columnas, se mejoraron estados vacíos y se retiró la fila decorativa del título en móvil.
- La carga XML SII ahora explica y bloquea la falta de RUT/empresa/archivo; muestra la selección en español y conserva la validación del servidor. La configuración prioriza la empresa actual. No hay cambios de alcance ni un conector automático nuevo.
- Verificación previa a publicar: seis pruebas focalizadas aprobadas, TypeScript/compilación correctos, 83 comprobaciones HTTP de páginas y recorrido funcional SII completos. Ver `docs/REVISION_EXPERIENCIA_18-11-2026.md`.
- El primer lote visual se publicó en `fa8048d` y quedó READY. En 681 px se comprobó un documento de 674 px, con la tabla contenida. Se afinaron también los nombres cortos de empresa en Reportes y la concordancia de los conteos del panel.
- La matriz permanece intacta. No se modifican registros operativos/financieros de producción ni se envían correos en las pruebas.

## Recorrido y corrección de Reportes — 18/11

- Roberto pidió seguir revisando/corrigiendo y entregar en la conversación la lista de pendientes y ampliaciones, sin actualizar la matriz en este bloque.
- Se reprodujo el recorte del reporte/CSV a mil filas con 1.205 servicios; sus indicadores también omitían registros. El resumen convertía un pesaje ausente en cero.
- Reportes ahora pagina de cien en cien, calcula los indicadores de todo el filtro y exporta el conjunto en lotes de quinientos. El neto del resumen exige bruto/tara presentes, conservando el cero explícito. Se mantiene orden por fecha/folio y las restricciones de cada perfil y empresa. No hay migraciones nuevas.
- Ver `docs/REVISION_REPORTES_18-11-2026.md` para el caso reproducido y el alcance del recorrido HTTP.
- Verificación final: **63 pruebas aprobadas**, TypeScript/compilación correctos y **83 comprobaciones HTTP de páginas** sin errores de carga. CSV completo de 1.205 servicios, trece páginas, neto correcto y separación por perfil/empresa comprobados con base temporal. No se actualizó la matriz ni se enviaron correos.
- El bloque SII anterior sí se publicó en `c8dbfa1`: despliegue principal `dpl_CoFgDJW6K487SuUXbt9awWLhBP4w` READY y migración 070 aplicada. Esto actualiza la nota histórica de publicación pendiente que aparece más abajo. La consulta automática y sus avisos siguen pendientes dentro del alcance incluido.

## Preparación funcional SII y corrección de alcance — 18/11

- Roberto confirmó que **SII está incluido** y que ambas empresas utilizan el facturador gratuito del SII. Prevalece sobre las clasificaciones históricas: son 78 observaciones incluidas y **seis ampliaciones**, números 52, 56 y 81–84. SII (65) no se recotiza ni se excluye por requerir conexión productiva.
- Se implementó una bandeja administrativa real de XML emitidos/recibidos, configuración de RUT por empresa, detección de pertenencia y duplicados, archivos originales privados, revisión interna y paginación. No hay generación automática de deudas ni pagos.
- La migración aditiva 070 prepara tres tablas. Se agregó `fast-xml-parser` con versión exacta y lockfile. Ver `docs/DOCUMENTOS_SII_PREPARACION.md`.
- Verificación del lote: **62 pruebas aprobadas**, TypeScript y compilación de producción correctos; recorrido HTTP real completado con base aislada (configuración, carga, duplicados/conflictos, original exacto, revisión, filtros y permisos). Se leyó además el ejemplo XML oficial del SII. No se completó la revisión visual interactiva por fallo de arranque del navegador local.
- **Consulta automática pendiente:** no existe todavía un conector de red operativo. El módulo lo indica expresamente. La importación XML es una base funcional y no se presenta como sincronización automática ni como validación de firma/aceptación de SII. La interfaz `SiiXmlConnector` no acredita un proveedor conectado.
- Mantener pendiente/parcial la observación 65 hasta completar el mecanismo de conexión y la prueba real; no declarar terminadas todas las solicitudes incluidas. Pedir guía/ticket real en la entrega y conservar los VB del cliente pendientes.
- Publicación y aplicación de la migración de este lote pendientes de confirmación. No se introdujeron documentos reales ni credenciales en las pruebas.

## Revisión de ficha ambiental y certificados — 18/11

- Se reprodujo que `Number(null)` interpretaba bruto/tara ausentes como cero. La ficha ambiental podía guardarse y revisarse con un neto incompleto; un borrador histórico podía permitir preparar o emitir un certificado sin ambos pesos.
- Se exige bruto y tara presentes al guardar y revisar la ficha y al preparar/emitir certificados. La revisión también comprueba que el neto siga coincidiendo con la ficha. Un neto cero explícito con ambos pesos ingresados mantiene el comportamiento anterior.
- Regresión con base temporal: bruto/tara ausentes por separado, fichas históricas, neto desactualizado y pérdida del pesaje después de preparar el certificado. Los errores no dejan nuevas fichas ni certificados, y conservan el borrador si la emisión se rechaza.
- Verificación: **57 pruebas aprobadas**, TypeScript y compilación correctos. No hay migraciones ni modificación de certificados ya emitidos. Las seis pruebas de mantenimiento, flota, contenedores y certificados también pasaron.
- Confirmación de publicación pendiente hasta verificar el nuevo commit y el despliegue principal. No confundir el código probado localmente con la versión publicada.
- La prueba del lector con una guía/ticket real se solicitará en la entrega, según indicación de Roberto. Es una dependencia documental para ese cotejo, no una implementación nueva ni una exclusión del alcance.

## Logos de RERCHAR y corrección de la matriz — 17/11

- Roberto aportó `sicep.png` y `CERT-PIE-Rerchar(1).png` y pidió retirar de la primera observación la referencia a una empresa ajena. El N.º 1 solicita incorporar logos al PDF: no corresponde añadirle como dependencia un certificado. Esta corrección prevalece sobre los registros anteriores de ese supuesto pendiente.
- El formato conserva el logo RERCHAR, agrega SICEP y utiliza la franja de certificaciones aportada, con proporciones originales y transparencia. Se repiten en las páginas de continuación de RERCHAR. Se revisaron PDFs de una página, de continuación y de E y J con datos ficticios. Los archivos aportados se incorporan sin modificar sus píxeles.
- La matriz conserva las 84 observaciones y sus vistos buenos. Se corrige la nota N.º 1 y pasa a **Disponible en piloto**: **76 disponibles, 1 parcial y 7 ampliaciones**. El único parcial técnico es el recorrido público de cotización, respuesta y recepción del acuse (N.º 76). El VB de cierre de RERCHAR sigue pendiente.
- La modificación se aplica al generar borradores y nuevas versiones; los PDF ya emitidos conservan su respaldo. No se agregan migraciones ni se envían cotizaciones reales en las verificaciones.

## Cierre técnico de la respuesta de cotizaciones — 17/11

- **Publicación autorizada:** Roberto autorizó explícitamente el 17/11 publicar estas correcciones en `main` de `robertomanzomorales-beep/rerchar-piloto` y desplegarlas en Vercel. Esta autorización resuelve el bloqueo previo de la revisión automática. El lote incluye la corrección de respuestas y acuses, sus pruebas y los registros de continuidad. Verificar el despliegue principal del nuevo commit antes de dar la publicación por terminada. La matriz se guardó como versión 4, con la evidencia nueva y los estados originales.
- Se retomó la versión `79fc8ef`, incluyendo los refinamientos visuales posteriores. Este lote no modifica el diseño del panel ni la identidad verde de RERCHAR y azul de E y J.
- Se reprodujo por HTTP un fallo del enlace público: añadir `confirmada=1` mostraba una respuesta registrada y un acuse enviado aunque la cotización siguiera pendiente. La pantalla ahora consulta la decisión guardada y la constancia del acuse. Los parámetros de la URL ya no determinan esos mensajes.
- El resultado del acuse se agrega a la auditoría como `quote_response_ack`, asociado al hash del enlace utilizado. Un fallo SMTP conserva la decisión y muestra el acuse pendiente, también al recargar. El acuse de una versión anterior no confirma una nueva respuesta. No se agregan migraciones.
- `npm run test:quote-response-http` reproduce el recorrido con Next.js real, formularios y redirecciones, base temporal y SMTP exclusivamente en loopback. Comprueba seis cotizaciones de ambas empresas: aceptación, rechazo, respuesta repetida y simultánea, enlace vencido/desconocido/reemplazado, confirmación persistente, fallo del acuse y auditoría. Los nueve mensajes quedan en memoria y los destinatarios son ficticios.
- Verificación: **48 pruebas automáticas aprobadas**, TypeScript y compilación de producción correctos. También pasó la regresión de nueva versión, invalidación del enlace anterior y constancia de un acuse independiente para la nueva respuesta.
- La observación 76 sigue parcial: falta una cotización de revisión acordada, recibida por correo real, apertura del enlace publicado, respuesta y recepción del acuse. El formato N.º 1 quedó completado con los logos aportados el 17/11. No se modifica ningún VB ni se declara aprobada la matriz: **76 disponibles, 1 parcial y 7 ampliaciones**.
- La evidencia de N.º 76 se actualiza en la matriz vigente, conservando su identidad y los estados de todas las observaciones. Antes de afirmar la publicación, verificar el check **Vercel – rerchar-piloto** del commit de este lote.

## Correo y vigencia de la respuesta del cliente

- Se configuró `software@rerchar.cl` en el proyecto principal con SMTP SSL por 465 y cinco variables privadas `SMTP_*`. Las credenciales no están en Git. Autenticación y envío real comprobados desde Vercel; el correo autorizado de prueba se recibió en Recibidos de Gmail con SPF y DKIM correctos.
- El primer intento de envío agotó la conexión antes de transmitir; el siguiente se completó usando la IPv4 resuelta del servidor y verificando su identidad TLS. No se determinó la causa del fallo inicial y no se enviaron duplicados. La prueba temporal quedó desactivada.
- Se comprobó un defecto de vigencia: con PostgreSQL en UTC, el enlace vencía a las 21:00 chilenas del último día. La creación de nuevos enlaces ahora calcula el fin de ese día en `America/Santiago`, conservando el límite máximo de catorce días. No se modifican los tokens existentes ni se agregan migraciones.
- `tests/quote-email.test.ts` recorre ambas empresas con una base aislada y un servidor SMTP que sólo escucha en loopback: envío, PDF idéntico al respaldo guardado, CC, vencimiento a medianoche de Chile, aceptación/rechazo, acuse y bloqueo de una segunda respuesta. Los destinatarios de este recorrido son ficticios y los mensajes permanecen en memoria.
- Verificación posterior: suite completa con **42 pruebas aprobadas, 0 fallidas**; compilación de producción y TypeScript correctos.
- La prueba SMTP real y el recorrido automatizado aportan evidencias distintas. Sigue pendiente el recorrido público con un caso de revisión acordado: abrir la cotización recibida, responder desde su enlace y comprobar el acuse en el correo del destinatario. La observación 76 conserva su estado parcial hasta completar ese recorrido.
- El formato N.º 1 quedó completado con los logos aportados el 17/11. El hosting definitivo se evaluará el 17/11 para la entrega objetivo del 18/11. La matriz actual mantiene 76 disponibles, 1 parcial y 7 ampliaciones a evaluar.

## Reanudación y revisión de la beta del 18 de noviembre

- Se recuperó `main` en `339513c` y se contrastó con el despliegue principal de Vercel, que figura `READY` para ese mismo commit. Las pruebas de Cobranza y venta de material que aparecen abiertas en las capturas de «Revisar Excel operativos» ya estaban cerradas y guardadas; no hay que repetir su implementación.
- El 16/11 se repitió la suite completa con base aislada: **41 pruebas aprobadas, 0 fallidas**. También pasaron TypeScript y la compilación de producción.
- Se aplicaron las **68 migraciones** actuales en una base local independiente y se completaron **135 comprobaciones HTTP**: accesos de administración para ambas empresas, fichas de servicio y cotización, carpeta del cliente, EDP/calendario, PDF, Excel y CSV; además, restricciones de operaciones, conductor, cliente y visitantes sin sesión. Los casos usan dos clientes ficticios y cinco cuentas locales; no se insertaron registros ni se enviaron correos en producción.
- Las comprobaciones de cliente/conductor no mostraron el cliente ajeno en paneles ni reportes. Las descargas ajenas devuelven 404, las descargas sin sesión 401 y las administrativas con perfil insuficiente 403. Las páginas con `notFound()` después de iniciar el streaming pueden conservar HTTP 200 e incluir el marcador 404 de Next; se comprobó el contenido de rechazo, no sólo el estado HTTP.
- Se corrigió el título accesible de cada punto del gráfico para entregarlo como un texto único a React. El recorrido posterior ya no registra la advertencia. El diseño, los colores verde/azul y los datos del panel se conservan.
- Al corte inicial, todavía no estaban configuradas las variables SMTP. La configuración y la prueba real posteriores se detallan arriba. El formato de logos N.º 1 se resolvió el 17/11; el recorrido público completo de la respuesta y el acuse sigue pendiente.
- El corte inicial del 16/11 registraba 84 observaciones: 75 disponibles, 2 parciales y 7 ampliaciones. El formato de logos se completó el 17/11 y el estado actual figura al comienzo de este registro. Los responsables todavía deben probar sus casos reales y dar su VB.
- Ver `docs/REVISION_BETA_18-11-2026.md` para el recorrido y las dependencias de entrega. Este lote no agrega migraciones.
- Roberto autorizó expresamente el 16/11 publicar este lote de código y documentos de continuidad en el repositorio GitHub de RERCHAR y desplegarlo en Vercel. La autorización comprende la corrección del gráfico y ambos registros de revisión/continuidad. Comprobar el despliegue principal antes de dar la publicación por completada.

## Dirección visual confirmada por Roberto

- Roberto rechazó el rediseño `d11643f`: colores demasiado sutiles, aspecto infantil por tarjetas redondeadas/iconos y pérdida del carácter profesional anterior.
- Se recuperó la base visual de `53ef494`, publicada en `edad7c2`: panel compacto, indicadores en banda, líneas/barras y encabezado con marca. Roberto aclaró expresamente que recuperar esa base es el punto de partida: exige mejorarla profesionalmente, no dejarla igual ni limitarse a un rollback.
- RERCHAR se identifica claramente en verde y E y J en azul. Reforzar esa separación en menú, selección activa, cabecera y datos principales; no volver a neutralizar ambos espacios ni introducir tarjetas decorativas.
- Las mejoras funcionales se conservan: filtro Todos/Prioritarios, saldo administrativo resumido, filtros de acreditación por empresa y vigencia, y toda la paginación/Cobranza anterior.
- Refinamiento sobre la base: resumen único de atención (prioridades + registros sin empresa), tabla de pendientes con columnas de registros/prioridad, actualización manual del panel y hora real de consulta, mejores jerarquías de tablas y accesos operativos. Se mantienen las identidades verde/azul; no se vuelve al lenguaje de tarjetas redondeadas/iconos decorativos.
- El acceso real ya se completó mediante intervención de Roberto. Sesión administradora abierta en el navegador; filtro de prioridades comprobado (1 aviso prioritario frente a 5 totales de RERCHAR). No se modificaron documentos ni pagos reales.
- Refinamiento publicado en `acc08bc`, con check satisfactorio de **Vercel – rerchar-piloto**. Revisión visual completada en la aplicación publicada para RERCHAR y E y J: identidad verde/azul, jerarquía compacta, gráficos y tabla de gestión correctos. Todos/Prioritarios muestra 5/1 filas en RERCHAR y 5/2 en E y J; el botón Actualizar vuelve a quedar disponible tras consultar.
- En ancho de 340 px, el documento mide 337 px y la tabla 269 px: sin desbordamiento horizontal de la página. Se comprobaron controles y tabla con el zoom normal de Chrome, restaurado al 100% al terminar. La navegación móvil se abre, bloquea el fondo y se cierra con Escape. No se introdujeron datos de prueba en producción.
- El navegador sólo admite HTTP(S), no archivos locales. DevTools está bloqueado por la organización: no volver a intentar activarlo. Para revisar otras anchuras se puede usar el tamaño normal de la ventana, sin cambiar políticas.
- Base publicada antes del refinamiento: `edad7c2` (recuperación del diseño anterior). `d11643f` es el rediseño rechazado y no debe usarse como patrón visual. Base funcional de Cobranza: `53ef494`. Verificar siempre el check **Vercel – rerchar-piloto** del nuevo commit.

## Proyecto y punto recuperado

- Repositorio: `robertomanzomorales-beep/rerchar-piloto`; rama principal: `main`.
- Aplicación principal: https://rerchar-piloto.vercel.app.
- Conversación anterior: «Revisar Excel operativos», detenida por longitud máxima.
- Se recuperó el commit local `e6fc120` sobre `b345c3e`; quedó integrado en `bfd2f06`, publicado con check satisfactorio del proyecto principal.

## Avance de esta entrega

- Cobranza aplica los filtros en la consulta de base de datos y permite recorrer 100 facturas por página.
- El CSV exporta todas las facturas del filtro, en lotes de 500, con un único encabezado y BOM. La vista anterior limitaba ambos resultados a 500.
- Se conserva la separación por empresa RERCHAR / E y J y el acceso administrativo a Cobranza.
- Los abonos y las anulaciones conservan empresa, filtro y página, incluso cuando hay errores de validación. El retorno valida estado y número de página.
- Cuando una operación vacía la última página, la lista vuelve a la última página disponible y conserva el aviso de resultado. Se aplica también al listado de conciliación.
- No se agregan migraciones en esta entrega.

## Verificaciones realizadas

- Suite completa: 41 pruebas aprobadas, 0 fallidas, con base de datos aislada en memoria y sin `DATABASE_URL` de producción.
- Regresión de Cobranza: 502 facturas, acceso a las posteriores al registro 500, filtros y separación por empresa (`tests/extra-charges.test.ts`).
- Exportación: formato, saldos, protección de texto y encabezado único al concatenar lotes (`tests/receivables-export.test.ts`).
- Venta de material: factura compartida sin duplicar total, pagos parciales/completos, saldo y anulación con conservación de guía (`tests/material-sale-billing.test.ts`).
- `npm run typecheck` y `npm run build`: correctos.
- `app/icon.jpg` y `app/apple-icon.jpg` coinciden byte a byte con `rerchar-ico(2).jpg`, solicitado por Roberto. Conservar ese archivo original.
- Recorrido HTTP real, con aplicación y base aisladas: páginas de 100, 100 y 2 registros; CSV de 502 facturas con encabezado único; abono de material de $5.000 y saldo actualizado de $6.900; separación por empresa y respuestas 400/401/403 correctas.
- Retorno HTTP de abono y anulación desde página 2: conserva filtro y página. Un sobrepago rechazado conserva ese contexto y muestra el error. Al completar el pago de la única factura pendiente en página 6, vuelve a página 5 con el aviso de éxito.
- El acceso administrativo publicado se completó con intervención de Roberto. Los dos paneles se revisaron visualmente después de publicar `acc08bc`; no se introdujeron facturas ni pagos de prueba en la aplicación publicada.
- Para las pruebas HTTP locales, iniciar el servidor y el cliente de comprobación dentro de la misma ejecución; así se resolvió el fallo de conexión observado al separarlos.

Comando de pruebas utilizado:

```bash
env -u DATABASE_URL -u NODE_ENV node --import tsx --test --test-concurrency=3 tests/*.test.ts
```

## Publicación y continuación

- Confirmar el commit resultante en `main` y el check **Vercel – rerchar-piloto** antes de afirmar que está publicado.
- Existe además un check de un proyecto duplicado **Vercel – rerchar-piloto-pjlu**, fallido en el commit anterior; distinguirlo del proyecto principal.
- La conexión Vercel de esta sesión devolvió 403 para el equipo del proyecto. El estado del despliegue se puede contrastar con los checks del commit en GitHub.
- Los paneles publicados ya se revisaron en escritorio y ancho móvil. La revisión visual de Cobranza con datos de prueba debe hacerse en el entorno aislado; su recorrido de servidor, formularios y CSV ya fue comprobado por HTTP. No poblar producción con registros de prueba.
- El formato de logos N.º 1 ya está disponible. SMTP está habilitado; falta el recorrido público completo de N.º 76 y la recepción del acuse por el destinatario.
- Al continuar, leer este registro y el estado Git actual. Mantener un registro breve y actualizado para que la continuidad no dependa de la longitud del chat.
