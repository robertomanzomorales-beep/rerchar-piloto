# Levantamiento de planillas y acuerdos de operación · 25 de septiembre de 2026

## Alcance de esta revisión

Se inspeccionaron los libros originales entregados en la reunión y tres ejemplos de certificados. Las cifras y nombres de terceros contenidos en ellos no forman parte del repositorio. La importación privada de las planillas al archivo consultable es independiente de la conciliación de registros activos y de la publicación del sitio.

| Fuente entregada | Datos y uso identificados | Pantalla/registro preparado | Pendiente para migración |
| --- | --- | --- | --- |
| `CONTROL GUIA RERCHAR CHILE AÑO 2026.xlsx` | Guías de compra, venta y traslado; origen, stock sumado, destino, devoluciones, impurezas, factura y diferencias | Servicio → Guías y pesos; captura por guía con ticket de origen, destino y retorno | Revisar cada fila con pesos ausentes y las fórmulas de algunos meses antes de importar |
| `ENTRADA MATERIAL - 2026 (3).xlsx` | Ingreso desde faena, ticket, material, peso proveedor/RERCHAR, impurezas, guía, hoja, factura, certificado y acta | Ingresos de material, hoja imprimible, respaldos privados y carpeta del cliente | Conciliar la base del neto fila por fila; tratar `s/t` y `-` como datos faltantes, no cero |
| `EXCEDENTES RESITER-SPENCE 2026 (7).xlsx` | Origen/destino, pesaje, impurezas, neto pagable, guías, factura y pago | Ingresos, subtipo excedente; neto, precio, hoja y pagos informativos | Confirmar la base del neto y enlazar los movimientos verificados |
| `HOJA INGRESO MATERIAL.xlsx` | Formulario imprimible para recepciones | Hoja de ingreso imprimible por ticket | Validar si el diseño de RERCHAR es obligatorio para uso externo |
| `CONTROL BODEGA 2.xlsx` | Catálogo, SKU, mínimos, costos, saldos y movimientos | Artículo con categoría, unidad y costo; Kardex con documento y centro de costo | Conciliar códigos duplicados y saldos a una fecha de corte |
| `PLANILLA INSUMOS 2026.xlsx` | Facturas recibidas de proveedores para RERCHAR y E y J, IVA, vencimientos, pagos y respaldo | Facturas recibidas con emisor, proveedor, IVA, saldo, pagos y documento privado | Vincular filas históricas verificadas; XML/RCV automático corresponde a fase SII posterior |
| `PROGRAMACION SEMANAL CAMIONES 2026.xlsx` | Planificación y seguimiento de guías valorizadas, envío/recepción y alertas | Agenda semanal y seguimiento de guías con días transcurridos y estado de envío | Confirmar el umbral numérico de alerta con operaciones |
| `SERVICIOS Y TRANSPORTES (CON ALERTAS) - 2026.xlsx` | Propuestas, servicios, hojas, OC, facturas y pesos de los traslados | Cotizador, ficha comercial/guías/SIDREP/arriendo, finanzas | Revisar reglas comerciales y conciliar tarifas por cliente |
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

## Integración operativa y datos históricos

Las migraciones `012` y `013` agregan captura y control para ingresos, excedentes, facturas recibidas, seguimiento de guías, precios de guías, Kardex y archivo consultable de las once planillas originales. El archivo del Excel conserva nombre, huella, hoja, fila, valores y fórmulas cuando existen. Se importa a un área sólo de administración, sin convertir automáticamente una fila ambigua en una factura o una guía vigente. Las pantallas nuevas se imprimen o guardan como PDF desde el navegador; el certificado, la cotización y otros PDF existentes siguen con sus descargas específicas.

La importación del archivo original se realiza con los scripts documentados en README una vez que esté disponible la PostgreSQL persistente de la instancia. En desarrollo se verificó la importación con archivos de muestra. No se cargan datos reales al repositorio. Vincular movimientos históricos al registro activo exige conciliar cliente, ticket, base de neto y duplicados con operaciones.

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
| SII facturas recibidas | Registro manual de facturas de proveedor por empresa, con adjuntos y pagos; sin conexión SII | Seleccionar XML DTE recibido/exportación RCV o canal de recepción, y conciliar con RCV oficial |
| Shell Tarjeta Transporte | Módulo de combustible manual existente; API aún no conectada | Confirmar acceso contratado para Chile, credenciales, tarjetas y convenio de API |
| Tracklite GPS | Flota y despachos existentes; API aún no conectada | Solicitar documentación técnica/credenciales y correspondencia de patentes |

## Criterios para el piloto del 28 de septiembre

Demostrar con datos ficticios cliente → solicitud → guía/pesajes → evidencia → carpeta y certificado, más cotización PDF y solicitud → aprobación → orden de compra. Antes de abrir una URL pública, disponer de PostgreSQL persistente, aplicar migraciones 001–013 y verificar en esa URL permisos, evidencia, PDF, QR y generación de documentos. No anunciar emisión tributaria, importación RCV, Shell ni GPS como funciones conectadas antes de probarlas con acceso oficial.
