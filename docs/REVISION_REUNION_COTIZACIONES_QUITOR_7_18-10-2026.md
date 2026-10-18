# Revisión de la reunión multiparte — Quitor 7

Audio recibido: 76 min 23 s. Transcripción automática revisada por tramos. Las marcas son aproximadas y no identifican con certeza la voz de cada participante. Se registran acuerdos de proceso, no se atribuyen frases personales.

## Alcance observado

| Tramo | Proceso tratado | Resultado |
| --- | --- | --- |
| 00:00–13:20 | EDP de E y J, OC/HES, factura, cobranza y factura del proveedor | Contraste con los recorridos existentes de Finanzas, Estados de pago y Facturas recibidas. No se redefinió su proceso en esta reunión. |
| 13:20–56:20 | Cotización de E y J, servicios, ruta, costos, precio, PDF, correo y respuesta | Núcleo de la reunión. Cambios comerciales 68–75 en la matriz. |
| 56:20–73:30 | OC del cliente, programación, documentos de ejecución, factura, pago y carpeta por cotización | Seguimiento desde el folio comercial. Cambios 76–78. |
| 73:30–74:40 | Consolidado mensual desde guías, pesajes, conductor y vehículo para el EDP | Necesidad de cotejar el formato de consolidado y sus campos antes de automatizar extracción desde PDF. Cambio 79. |
| 74:40–76:23 | Cierre y coordinación | No agrega reglas funcionales. |

## Cambios contrastados con el piloto

| Minuto | Necesidad expresada | Implementación / estado |
| --- | --- | --- |
| 13:40–15:40 | Al entrar desde E y J, mostrar su empresa; vigencia inicial de diez días editable. | Emisor fijo en la entrada contextual. Vigencia inicial de diez días y recalculada al cambiar emisión mientras no se edite a mano. |
| 14:20–14:50 | Mostrar el número correlativo al comenzar la cotización. | El primer paso guarda cliente, alcance y fechas y asigna el folio definitivo; la ficha de trabajo abre con ese número visible. No se muestra un número tentativo antes de guardar, porque podría cambiar por otra cotización concurrente. |
| 15:50–19:20, 38:40–39:20 | Catálogo E y J sin compra ni recepción de material; agregar disposición final. | Filtrado por empresa en el formulario y regla en servidor. Segmentación de disposición final incorporada. |
| 21:00–38:20 | Recorrido y cálculo interno antes de decidir el precio de venta. Tabla común de costos editable con trazabilidad. | En E y J el primer precio se deja en cero dentro del borrador; ruta y calculadora se muestran antes de los conceptos. El envío exige un precio positivo. La tabla compartida de tasas aún requiere la planilla y sus valores exactos; la calculadora por cotización conserva auditoría. |
| 39:30–40:15 | Cotizar algunos servicios de disposición en UF. | Moneda por concepto CLP/UF y referencia UF/CLP fechada en el borrador. PDF y CSV muestran la unidad pactada y la conversión CLP referencial. Se debe validar cómo liquidar UF al facturar. |
| 40:20–45:05 | Agregar y corregir varios servicios sin salir de la cotización. | Tras iniciar el borrador con folio, el primer servicio y los siguientes se añaden en la misma ficha, con ruta, costos, resumen, edición de cada concepto y envío. Se impide entregar un borrador sin conceptos o sin precio. Queda una iteración visual con usuarios para comprobar densidad y disposición. |
| 45:15–47:45 | Destinatario principal más copias internas y otros colaboradores. | Campo de hasta diez CC por correo, con prellenado configurable por empresa. Envío automático depende del SMTP del sistema; no se inventan direcciones. |
| 47:50–56:20 | Aceptar o rechazar y conservar autor, fecha y respaldo. | Cliente autenticado responde desde su cotización; auditoría de aceptación o rechazo. La alternativa de enlace directo en correo y confirmación automática por correo no está implementada. |
| 57:15–61:55 | OC del cliente después de aceptar y antes de programar; guías, hoja de servicio, ticket, factura, pago y certificado. | Número/fecha y archivo de OC dentro de la cotización; servicios vinculados y sus documentos/facturación visibles por folio. El alta de una solicitud no está bloqueada por ausencia de OC, porque los contratos mensuales y excepciones requieren una regla más precisa. |
| 62:00–72:55 | Lista de cotizaciones de un cliente con acceso directo a OC y expediente asociado; filtros generales. | Carpeta del cliente muestra OC, cantidad de servicios y documentos por fila; detalle de cotización agrupa documentos, ejecución, cobro y certificado. Filtros por empresa, cliente, preparador y rango de emisión. |
| 73:20–74:40 | Consolidado mensual para EDP desde datos de guías, tickets, conductor y patente. | Los datos estructurados del servicio y exportaciones ya existen parcialmente. OCR de PDFs y formato de consolidado específico quedan pendientes de fuente y validación. |

## Dependencias reales

1. Tabla de costos de Jorge: falta su archivo o conjunto exacto de tasas, vigencias y autorizaciones. La interfaz de cálculo actual permite costos manuales por viaje y queda registrada en auditoría; una tabla compartida con valores inventados sería incorrecta.
2. UF: la equivalencia de referencia se ingresa manualmente con fecha. Antes de facturar se debe definir la fecha y fuente de UF aplicable y el tratamiento de las diferencias; el piloto muestra el equivalente CLP como referencia.
3. Aceptación por enlace: la respuesta autenticada del cliente funciona. Un enlace externo, acuse por correo y reglas de evidencia necesitan definir remitente SMTP, destinatarios y duración del enlace.
4. OC: para cotizaciones puntuales se registra y visualiza. La puerta estricta antes de programación debe distinguir el servicio puntual del contrato mensual cuyo EDP precede a la OC; esa excepción se registra por separado en Estados de pago.
5. Consolidado: no se extraen datos automáticamente de una imagen o PDF escaneado. Primero hay que cotejar la planilla de campos contra los registros de guías, tickets y partes ya disponibles.
