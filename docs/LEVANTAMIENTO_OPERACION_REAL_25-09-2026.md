# Levantamiento de planillas y acuerdos de operación · 25 de septiembre de 2026

## Alcance de esta revisión

Se inspeccionaron los libros originales entregados en la reunión y tres ejemplos de certificados. Los libros son fuente para contrastar el flujo y preparar una migración, no una importación autorizada. Las cifras y nombres de terceros contenidos en ellos no forman parte del repositorio. La base se mantiene vacía de datos reales hasta conciliar clientes, guías, facturas y permisos con RERCHAR.

| Fuente entregada | Datos y uso identificados | Pantalla/registro preparado | Pendiente para migración |
| --- | --- | --- | --- |
| `CONTROL GUIA RERCHAR CHILE AÑO 2026.xlsx` | Guías de compra, venta y traslado; origen, stock sumado, destino, devoluciones, impurezas, factura y diferencias | Servicio → Guías y pesos; captura por guía con ticket de origen, destino y retorno | Revisar cada fila con pesos ausentes y las fórmulas de algunos meses antes de importar |
| `ENTRADA MATERIAL - 2026 (3).xlsx` | Ingreso desde faena, ticket, material, peso proveedor/RERCHAR, impurezas, guía, hoja, factura, certificado y acta | Servicio, control de guía, evidencias tipificadas y carpeta del cliente | Conciliar las dos variantes de fórmula de neto; tratar `s/t` y `-` como datos faltantes, no cero |
| `EXCEDENTES RESITER-SPENCE 2026 (7).xlsx` | Origen/destino, pesaje, impurezas, neto pagable, guías, factura y pago | Compra/venta, guías, valorización y respaldos | Acordar qué peso determina la liquidación y enlazar documento de origen y destino |
| `HOJA INGRESO MATERIAL.xlsx` | Formulario imprimible para recepciones | Datos en servicio, guía, orden y evidencias | Replicar diseño final si este formulario sigue siendo el oficial |
| `CONTROL BODEGA 2.xlsx` | Catálogo, SKU, mínimos, costos, saldos y movimientos | Bodegas, artículos, Kardex y compras existentes | Conciliar códigos duplicados y saldos a una fecha de corte |
| `PLANILLA INSUMOS 2026.xlsx` | Facturas recibidas de proveedores para RERCHAR y E y J, IVA, vencimientos, pagos y respaldo | Proveedor, OC emitida por empresa, recepción, número de factura y archivo | Crear libro de facturas recibidas e importar XML/CSV con comparación al RCV cuando se definan origen y acceso |
| `PROGRAMACION SEMANAL CAMIONES 2026.xlsx` | Planificación y seguimiento de guías valorizadas, envío/recepción y alertas | Agenda, asignación, guía y documentos del servicio | Definir alertas y periodicidad con operaciones |
| `SERVICIOS Y TRANSPORTES (CON ALERTAS) - 2026.xlsx` | Propuestas, servicios, hojas, OC, facturas y pesos de los traslados | Cotizador, servicio, carpeta, guías, finanzas | Revisar reglas comerciales y conciliación de tarifas por cliente |
| `Detalles y mantenimiento camiones y ramplas (2)(2).xlsx` | Inventario de camiones/rampas, recorrido, averías, mantenimiento y tara/bruto/neto | Flota, mantenimiento, combustible; kilometraje y mantención en tolvas | Vincular odómetro y patente con GPS por identificador estable |
| `Orden de compra .xlsm` | Formato de OC de E y J, RUT y condiciones de pago | OC imprimible y guardable como PDF; emisor RERCHAR o E y J | Validar correlativo oficial, domicilio y datos bancarios antes de uso externo |
| `PLANILLA DE SOLICITUD DE COMPRAS 2026 (2)(2).xlsx` | Petición, categoría, cantidad, urgencia, aprobación y días pendientes | Solicitud de compra, aprobación, OC y recepción parcial | Confirmar categorías y responsables de aprobación |

Los dos DOCX de certificado repiten el texto de un ejemplo y el PDF muestra un certificado con tabla de fecha, guía valorizada, ticket, patente, factura, descripción, total kg y QR. El certificado emitido por el sistema incluye esos campos disponibles en el servicio, conserva la versión y el QR de verificación y no reproduce firma, sello, domicilio ni autorización que no estén validados por RERCHAR.

## Reglas de pesaje verificadas

En la hoja `SEPTIEMBRE` del control de guías se observa:

- **Salida total L = I + J**: peso desde faena + peso añadido de stock.
- **Diferencia P = N - (L - O)**: peso recibido en destino menos salida ajustada por material devuelto. El ejemplo I=25.990, J=720, N=25.610 y O=620 arroja **−480 kg**.
- **Diferencia factura T = (N - R) - S**: peso recibido menos impureza descontada en destino menos peso facturado.
- El peso de retorno se guarda como medición separada, con su ticket; no se usa en una fórmula adicional sin acuerdo de operaciones.

Una guía puede actualizarse por su número en el mismo servicio; cada modificación deja evento y auditoría. Si hay certificado vigente, se exige revocarlo antes de alterar la guía. Se conservan el cierre y peso neto propios del servicio, que sirven para la ficha ambiental; no se sustituyen automáticamente por la llegada a destino.

## Estado de las peticiones de la reunión

| Petición | Estado en el código | Paso operativo pendiente |
| --- | --- | --- |
| Cotizar desde cliente registrado, sumar productos, PDF y envío | Implementado con folio, emisor, cantidades, IVA, PDF y envío SMTP | Configurar correo saliente y verificar destinatario, precios y condiciones antes de enviar |
| Nuevas solicitudes Servicios/Compra/Venta/Otro | Implementado conservando subtipo retiro/traslado | Revisar usos del subtipo y permisos con usuarios reales |
| Control de tres pesajes y retorno | Implementado por guía y asociado al servicio | Conciliar excepciones de libros y definir alertas de tolerancia |
| Carpeta del cliente y sus documentos | Implementada con resumen imprimible, guías, hojas, facturas adjuntas, certificados y cotizaciones | Cargar respaldos verificados desde cada servicio |
| Certificado con QR y tabla | Implementado para servicios cerrados con ficha ambiental revisada y evidencia | Aprobar texto y datos legales del certificado de uso externo |
| Personal RERCHAR o E y J | Campo de empleador incorporado | Validar nómina real y eventuales subcontratistas |
| Kilometraje y mantenciones en tolvas/arriendos | Registro con fecha, detalle, costo, km y servicio opcional | Confirmar si el dato es km del vehículo que transporta la tolva o un acumulado de la unidad |
| Orden de compra imprimible/PDF | Emitida desde solicitud aprobada, con proveedor, precios, IVA y emisor | Verificar correlativo, domicilio, firma y condiciones comerciales |
| SII facturas emitidas | Diseñado como integración posterior con emisor habilitado, certificados y pruebas del SII | Definir modalidad de facturación de ambas razones sociales y credenciales oficiales |
| SII facturas recibidas | Facturas asociadas a recepción y adjuntos existentes; importación automática aún no implementada | Seleccionar XML DTE recibido/exportación RCV o canal de recepción, y conciliar con RCV oficial |
| Shell Tarjeta Transporte | Módulo de combustible manual existente; API aún no conectada | Confirmar acceso contratado para Chile, credenciales, tarjetas y convenio de API |
| Tracklite GPS | Flota y despachos existentes; API aún no conectada | Solicitar documentación técnica/credenciales y correspondencia de patentes |

## Criterios para el piloto del 28 de septiembre

Demostrar con datos ficticios cliente → solicitud → guía/pesajes → evidencia → carpeta y certificado, más cotización PDF y solicitud → aprobación → orden de compra. Antes de abrir una URL pública, disponer de PostgreSQL persistente, aplicar migraciones 001–011 y verificar en esa URL permisos, evidencia, PDF, QR y generación de documentos. No anunciar emisión tributaria, importación RCV, Shell ni GPS como funciones conectadas antes de probarlas con acceso oficial.
