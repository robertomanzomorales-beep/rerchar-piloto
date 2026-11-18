# Experiencia y presentación — 18/11/2026

Roberto pidió continuar la revisión, incluyendo uso y estética. Se conserva el panel compacto y la identidad verde de RERCHAR y azul de E y J.

## Hallazgos observados

- Se abrió una sesión administradora mediante el acceso seguro del navegador y se inspeccionaron el selector, el panel RERCHAR, Documentos SII, Reportes y Nueva cotización. La restricción visual del navegador local del bloque anterior no impide esta nueva revisión del sitio publicado.
- En Reportes, con 681 px CSS disponibles, el documento se extendía a 945 px: la tabla ancha escapaba al contenedor entre los puntos de adaptación. En 340 px, el icono decorativo del título ocupaba una segunda fila. Se usó el zoom normal del navegador para variar el ancho CSS; no se simula un dispositivo físico.
- Los cinco filtros administrativos y su botón ocupaban una rejilla de cinco columnas, dejando el botón solo en una segunda fila. Una descripción larga del camión dominaba la tabla y el neto podía separar la unidad en otra línea.
- SII permitía intentar incorporar un archivo aunque no hubiera RUT configurado. Su selector de archivo mostraba las etiquetas nativas inglesas del navegador y el estado vacío no orientaba la siguiente acción.

## Cambios

- Desplazamiento de las tablas dentro de su contenedor en todos los anchos de pantalla; se conserva la impresión sin ese recorte. Las tablas de Reportes/SII permiten enfocar la región con teclado.
- Rejilla de filtros acorde al número de campos de cada perfil, columnas proporcionadas, descripción visual del camión limitada a dos líneas conservando el contenido completo en el DOM y título, y neto/unidad juntos. Los indicadores siguen calculándose sobre todo el filtro.
- En anchos pequeños, filtros en una columna, campos de 16 px y controles más altos en Reportes/SII. El icono decorativo del título se oculta para no crear una fila vacía adicional.
- Configuración SII ordenada según la empresa actual, controles uniformes y carga habilitada tras seleccionar una empresa configurada y un archivo no vacío de hasta 3 MB. La selección muestra nombre y mensajes en español. Las comprobaciones de servidor se mantienen.
- Estados vacíos con contexto y acceso a configuración/carga o restablecimiento de filtros, conservando la empresa. La consulta automática SII continúa expresamente sin conectar e incluida en el proyecto.

## Verificación previa a publicar

- TypeScript y compilación de producción correctos.
- Seis pruebas focalizadas de reportes, documentos SII y XML aprobadas.
- Recorrido HTTP de 83 páginas y permisos correcto, con CSV de 1.205 servicios, filtros y neto conservados.
- Recorrido HTTP SII correcto: configuración, incorporación, duplicados, conflicto, pertenencia, original exacto, revisión, filtros y restricciones de acceso.
- Los recorridos funcionales usan bases temporales y datos ficticios. La revisión visual de producción es de consulta: no modifica registros operativos/financieros ni envía correos.

El primer lote se publicó en `fa8048d`, con despliegue READY. En la comprobación publicada de Reportes E y J, 681 px disponibles dieron 674 px de documento: la tabla de 910 px desplaza dentro de una región de 604 px. Los filtros quedaron alineados y la identidad azul se conservó.

En 340 px SII conservó el documento en 337 px, con archivo y envío deshabilitados correctamente hasta configurar la empresa. Se ordenó el salto de línea de sus encabezados para que la indicación de conexión no comprima el título.

Se afinó además la columna de empresa con nombre corto (el nombre legal permanece en el título y CSV) y la concordancia de los conteos de guías, EDP, cierres y servicios por clasificar.

Al cerrar el ajuste se deben comprobar las medidas de Reportes en 681/340 px y ambas identidades, los estados de SII y el menú móvil, restaurando el zoom al 100%.
