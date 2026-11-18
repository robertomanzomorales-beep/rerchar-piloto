# Documentos SII: base de incorporación y revisión

La conexión con SII forma parte del proyecto. La empresa confirmó que utiliza el facturador gratuito del SII. Este lote implementa una base utilizable con XML y una frontera para el conector futuro; no implementa ni simula una consulta automática al SII.

## Funciones disponibles en este lote

- Bandeja administrativa **Documentos SII**, contextualizada por RERCHAR o E y J, con filtros de emitidos/recibidos y revisión, paginación de 100 documentos y conteo completo.
- Registro del RUT de cada empresa, validado por dígito verificador. La pertenencia de cada documento se determina por emisor/receptor, no por su nombre ni por una selección de sentido ingresada manualmente. El RUT de una empresa con documentos ya incorporados queda bloqueado desde esta pantalla.
- Lectura de DTE individuales y `EnvioDTE/SetDTE`, hasta 100 documentos y 3 MB. Se admiten facturas 33/34 y notas 56/61, UTF-8 e ISO-8859-1, referencias, montos y vencimiento cuando figura en el archivo.
- Control de duplicados por empresa, sentido, RUT del emisor, tipo y folio. Un mismo DTE en un envoltorio distinto conserva el registro original. Un folio con contenido diferente rechaza el archivo completo sin sobrescribir ni dejar importaciones parciales.
- Conservación del XML original una sola vez por archivo y empresa. Su descarga requiere sesión administradora. Las listas no incluyen el contenido binario del documento.
- Revisión interna y devolución a pendiente con observación y auditoría. Las diferencias entre neto, exento, IVA y total se muestran y requieren explicación para registrar la revisión interna.

La bandeja no crea cuentas por cobrar, facturas de proveedores, pagos o movimientos de caja. Las notas de crédito tampoco alteran una deuda automáticamente. La conciliación con esos registros requiere completar la conexión y su circuito de revisión. Leer el XML y registrar una revisión interna no valida su firma digital, su conformidad completa con el XSD, su aceptación por SII ni un acuse legal.

## Datos y activación

Aplicar `db/070_documentos_sii.sql` antes de habilitar la importación. Es una migración aditiva con las tablas `sii_company_settings`, `sii_xml_sources` y `sii_documents`; no modifica registros financieros existentes. El control de disponibilidad impide mostrar el módulo como activo cuando el esquema todavía no está preparado.

El lote no contiene RUT productivos inventados, claves, certificados privados ni endpoints de un proveedor supuesto. Para probar con documentos reales se requiere el RUT de cada empresa y XML representativos de emitidos/recibidos.

## Consulta automática pendiente e incluida

`SiiXmlConnector` define la entrada que deberá entregar XML al mismo proceso validado de incorporación. No hay un adaptador de red conectado, un cron, credenciales ni una sincronización exitosa registrada. La pantalla informa **Consulta automática sin conectar**. La interfaz no reemplaza el desarrollo y la validación del conector real.

La documentación oficial distingue el facturador gratuito, que no se integra directamente con otras aplicaciones, de la incorporación de información mediante XML descargados. Falta definir y validar un mecanismo compatible para obtener automáticamente los documentos del contribuyente; no se exige migrar de facturador ni se selecciona o contrata un proveedor en este lote.

## Verificación

La suite cubre tipos, referencias, diez dígitos de folio, RUT, fechas, XML mal formado, entidades declaradas, profundidad, codificaciones, tamaños y límites de documentos. Las pruebas de dominio comprueban pertenencia por empresa, reintentos, conflicto de contenido, atomicidad, almacenamiento compartido de un envío, revisión, permisos, 101 documentos paginados y ausencia de movimientos financieros creados al importar. Son casos sintéticos en PGlite, que serializa transacciones y no reproduce contención entre conexiones PostgreSQL.

Se comprobó además la lectura del XML de ejemplo oficial `F60T33-ejemplo.xml`: factura 33, folio 60 y total 119000. La lectura de este ejemplo público no sustituye la prueba con un documento real de RERCHAR o E y J.

El 18/11/2026 pasaron las **62 pruebas** del proyecto, TypeScript y la compilación de producción. Un recorrido HTTP con Next.js real y base aislada verificó configuración, importación, reintento sin duplicar, rechazo por empresa/contenido, descarga idéntica y privada, revisión interna, filtros y denegación a visitantes y perfiles no administrativos. Las páginas denegadas pueden utilizar la redirección en streaming de Next.js; se comprobó que no contienen el formulario ni el respaldo privado. No se enviaron correos ni se modificó producción durante estas pruebas. La revisión visual interactiva no pudo completarse porque el navegador local no inició.

Fuentes consultadas el 18/11/2026:

- [Formato XML y esquemas oficiales de DTE](https://www.sii.cl/servicios_online/1039-formato_xml-1184.html).
- [FAQ de integración del facturador gratuito](https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_6498.htm).
- [Comparación oficial de sistemas de facturación](https://www.sii.cl/servicios_online/1039-como_fact_elect-1182.html).
