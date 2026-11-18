# Revisión del recorrido y reportes — 18/11/2026

## Hallazgo y corrección

Con 1.205 servicios RERCHAR, el reporte anterior recuperaba como máximo 1.001 y mostraba/exportaba los primeros 1.000. Los indicadores se calculaban sobre ese recorte. Además, un bruto o tara ausente se interpretaba como cero en el neto del resumen. La reproducción con datos temporales devolvió 1.000 filas CSV y 50.000 kg frente a 1.205 servicios y 60.000 kg completos.

- La pantalla recorre el filtro en páginas de 100, conserva los filtros y ajusta una página fuera de rango a la última disponible.
- Los indicadores se calculan sobre todos los registros autorizados del filtro. El neto suma únicamente servicios completados con bruto y tara presentes; cero explícito sigue siendo un pesaje registrado. Se indica cuántos servicios aportan al neto.
- El CSV exporta el filtro completo en lotes de 500, con un encabezado/BOM y el mismo formato de columnas. El cursor conserva la precisión del timestamp PostgreSQL y el folio como texto. Se mantiene el orden por creación y folio descendentes, sin desplazar lotes por nuevas altas más recientes.
- Consulta, indicadores y descarga aplican las mismas restricciones de empresa, cliente, conductor, fecha chilena y estado. No se agregan migraciones ni se modifican datos históricos.

La descarga consulta los registros durante su ejecución; no representa una instantánea contable bloqueada frente a modificaciones simultáneas. Las pruebas de altas entre lotes no afirman cubrir cambios simultáneos de fecha, empresa, permisos o eliminación.

## Verificación

- **63 pruebas aprobadas, cero fallidas**, TypeScript y compilación de producción correctos en la versión final del lote.
- **83 comprobaciones de páginas HTTP aprobadas**, sin errores de renderizado en el registro del servidor. La descarga devolvió los 1.205 servicios y un solo encabezado; la última página mostró cinco filas y mantuvo el total de 60.000 kg. Se repitió este recorrido después de conservar el orden original por fecha/folio.
- Regresión con 1.205 servicios de una empresa, dos de la otra, uno por clasificar y un eliminado. Comprueba las trece páginas, exportación completa, ausencia de duplicados, permisos de los cuatro perfiles, filtros, precisión de microsegundos, cero explícito, pesos ausentes y una nueva alta entre lotes.
- Recorrido HTTP con Next.js real y base temporal: menús de ambas empresas (31/28 accesos con panel), formularios de creación, fichas de cliente/servicio/flota, reportes y descargas. La revisión autenticada se ejecuta sobre datos ficticios. No se envían correos ni se cargan operaciones de prueba en producción.
- La revisión visual interactiva queda limitada por el fallo de arranque del navegador local constatado en el bloque SII. Esta comprobación no acredita revisión visual de todas las pantallas ni VB de los responsables.

## Pendientes y ampliaciones

SII sigue incluido y pendiente de consulta automática/avisos y prueba real. Su bandeja XML está publicada en `c8dbfa1`; la migración 070 se aplicó y el despliegue principal terminó READY. La guía/ticket representativa se pedirá en la entrega y los VB siguen pendientes.

Las ampliaciones conservan sus números: 52 (proveedor de combustible), 56 (tercera empresa y exportaciones), 81 (compra presencial del local), 82 (caja/libro del local), 83 (legajo/aprobación del local) y 84 (captura automática desde WhatsApp). Los puntos 81–83 se evalúan como un mismo circuito y reutilizan las funciones incluidas. La lista final se entrega en la conversación, según lo pedido por Roberto; no se modifica la matriz en este bloque.
