# RERCHAR Industrial Waste Management System

Piloto operativo para RERCHAR Chile SpA, preparado por Vialoop Studio SpA. Integra solicitud, despacho, terreno, evidencia, flota, mantenimiento, combustible, tolvas, personal y acreditación, compras e inventario, finanzas manuales, registro ambiental interno, certificados PDF/QR con consulta de vigencia, reportes y auditoría. El alcance contratado comprende veinte módulos; estos flujos tienen cobertura **parcial y verificable**, y aún no conforman un sistema productivo completo.

## Abrirlo en VS Code en Mac

1. Descomprima el ZIP y abra la carpeta `rerchar` en VS Code con **Archivo → Abrir carpeta**.
2. Abra **Terminal → Nuevo terminal**. Compruebe que Node.js sea versión 20.9 o superior con `node -v`.
3. Ejecute, dentro de la carpeta del proyecto:

   ```bash
   npm install
   npm run db:migrate
   ```

4. Prepare la cuenta de revisión local y los datos para recorrer los flujos. `--demo` crea un cliente, una faena, un camión, una rampa, un conductor, dos bodegas, un repuesto con 12 unidades, un plan preventivo y una tolva ficticios. La clave del conductor se imprime una sola vez al crearlo.

   ```bash
   npm run review:admin -- 'correo-de-revision@ejemplo.cl' 'clave-temporal-de-su-eleccion'
   npm run db:seed -- --demo
   ```

5. Inicie la aplicación y abra la dirección indicada por la terminal (normalmente `http://localhost:3000`):

   ```bash
   npm run dev
   ```

La base de datos de desarrollo se guarda en `.local/rerchar-db`; los archivos adjuntos se guardan en `.local/archivos`. Ambas rutas se excluyen del paquete y del control de versiones. La contraseña de revisión se establece con un comando local y no está incrustada en la aplicación. Si vuelve a ejecutar `db:seed -- --demo`, conserva los usuarios existentes.

## Actualizar la instalación que ya funciona en su Mac

Detenga primero el servidor local con **Ctrl+C**. En una copia Git del proyecto, actualice el código y aplique las migraciones desde la carpeta del proyecto:

```bash
git pull --ff-only origin main
npm ci
npm run db:migrate
npm run dev
```

Si recibió un archivo `.patch` para una entrega aún no publicada, use `git am /ruta/al/archivo.patch` en esa misma carpeta antes de `git push origin main`. El parche sólo modifica archivos del repositorio; la base local y los adjuntos de `.local` permanecen en el Mac. Las migraciones pendientes se aplican una sola vez. Si necesita reponer la cuenta de revisión, utilice `npm run review:admin` de la sección siguiente.

El menú lateral del panel tiene desplazamiento propio: coloque el cursor sobre las opciones y use la rueda o el panel táctil para llegar a Certificados, Reportes, Auditoría, Usuarios y accesos y Maestros. El nombre de usuario y **Cerrar sesión** permanecen visibles al pie. En teléfonos, abra el menú superior y desplácese dentro de la lista.

En la pantalla de acceso, el icono junto a la contraseña permite mostrarla u ocultarla mientras se escribe. El control no cambia la clave guardada.

**Maestros:** las personas de administración y operaciones pueden abrir cada cliente, faena o activo de la lista para corregir nombres, datos de contacto, direcciones, descripción o patente. El código y tipo de activo y la empresa vinculada a una faena quedan fijos para conservar las referencias de los servicios. Cada corrección queda registrada en Auditoría; no se elimina el historial.

**Usuarios y accesos:** con la cuenta administradora, abra ese módulo para crear perfiles de operaciones, conductor, cliente o administración. Al crear una cuenta Cliente, seleccione su empresa; podrá consultar únicamente sus servicios, evidencias y certificados vigentes. En la lista puede cambiar perfil o empresa, suspender o reactivar la cuenta y definir otra contraseña. Los cambios de perfil, empresa, estado y clave cierran las sesiones de esa persona; tendrá que volver a entrar. Para no perder el control del sistema, no puede suspender su propia cuenta ni quitar al último administrador activo. El sistema no envía correos: comunique las credenciales de demostración por el canal acordado.

### Cambiar la cuenta para una revisión local

Detenga `npm run dev` con **Ctrl+C** antes de modificar la base de datos local. Para cambiar correo y clave más adelante, ejecute:

```bash
node scripts/activar-revision.mjs 'nuevo@correo.cl' 'clave-temporal-de-8-o-mas' 'correo-provisional@ejemplo.cl'
npm run dev
```

Este comando cambia el correo provisional, sustituye su contraseña y cierra las sesiones anteriores. Si el correo de revisión ya existe, actualiza esa cuenta y desactiva la provisional. La clave corta se admite únicamente mediante esta herramienta de revisión local; el formulario normal de nuevos usuarios conserva el mínimo de doce caracteres. No guarde la clave de revisión como credencial de producción.

## Primera demostración

1. Entre como administrador y abra **Maestros**. Si usó `--demo`, verá un cliente, una faena, un camión, una rampa y un conductor ficticios. Abra «Editar» en un maestro para corregir una dirección o patente y compruebe el cambio en la solicitud y en **Auditoría**. También puede registrar un conductor desde **Despacho** cuando falte alguno.
2. Abra **Solicitudes → Nueva solicitud**. Seleccione el cliente y el centro, complete tipo, residuo, origen, destino y prioridad.
3. En el detalle del folio, programe fecha, camión, conductor y rampa si corresponde. Revise **Agenda** para ver la semana y abra la orden de servicio para verla o imprimirla.
4. Guarde las cuatro comprobaciones del checklist e inicie la ruta.
5. Adjunte un JPG, PNG, WebP o PDF de prueba con una descripción. Registre peso bruto y tara; cierre el servicio.
6. Revise el estado, peso neto, archivo e historial del folio. Puede volver a ingresar con el usuario conductor; ese perfil sólo ve servicios que le hayan asignado.
7. En **Flota y averías**, reporte una falla de un activo y verifique que queda fuera de nuevas asignaciones. Registre su solución para liberarlo. En **Reportes**, filtre servicios y descargue el CSV. También puede cancelar una solicitud todavía no iniciada, dejando un motivo trazable.
8. En **Inventario** verá dos bodegas, un repuesto ficticio y un stock inicial de 12 unidades. Cree una **Solicitud de compra**, agregue un segundo artículo si desea y apruébela como administrador. Registre proveedor y referencia de la orden. Haga dos recepciones con guías distintas; observe el saldo pendiente y los ingresos en el **Kardex** de la bodega elegida. Pruebe una reserva, una transferencia y las alertas de reposición. Los movimientos quedan auditados.
9. En **Mantenimiento**, abra un plan para el camión de demostración, genere una orden de trabajo, reserve el repuesto de bodega y ciérrela con costo y lectura. En **Combustible**, registre una carga y vea el rendimiento calculado sólo cuando existan lecturas de tanque lleno compatibles. Una orden que bloquea un vehículo impide asignarlo hasta su cierre.
10. En **Tolvas y contenedores**, instale la tolva ficticia en la faena y asóciela al folio de servicio cuando corresponda. Retírela y compruebe ubicación única e historial. La permanencia configurable alimenta una alerta del panel.
11. En **Personal**, defina un requisito de acreditación para esa faena y observe que el despacho sólo permite al conductor con acreditación verificada y vigente. Para continuar el recorrido, registre una credencial ficticia con referencia, fechas y verifíquela como administrador.
12. En **Finanzas** (sólo administrador), cree un contrato para el cliente, agregue una tarifa por servicio o por kg y valorice un servicio ya cerrado. Asocie el folio de una factura **registrada fuera del sistema**, añada pagos parciales y un costo; compare saldo y margen. Una factura interna anulada sin pagos conserva el historial.
13. En **Registro ambiental**, prepare una ficha desde un servicio cerrado, complete los responsables y la clasificación, revise la evidencia y apruébela como administrador. Puede registrar manualmente la referencia de una declaración ya presentada en SINADER o SIDREP. Descargue el CSV **interno** y vea el historial de correcciones. La plataforma no envía declaraciones oficiales.
14. En **Auditoría** (sólo administrador), filtre por entidad y fecha y exporte los eventos; el panel reúne señales de mantenimiento, permanencia, acreditación y saldos.
15. En **Certificados**, después de revisar la ficha ambiental, emita una constancia operacional del servicio cerrado. Si el selector está vacío, la página enumera los servicios cerrados, explica el paso pendiente de cada folio y ofrece un enlace directo para preparar o revisar su ficha. Descargue el PDF con QR y compruebe la página pública de verificación: sólo muestra vigencia y versión. Un usuario cliente sólo puede descargar los certificados vigentes de su propia empresa. Revóquelo como administrador y verifique que el QR ya indique pérdida de vigencia; una nueva emisión conserva la versión anterior.
16. Para probar el portal, cree una cuenta **Cliente** en **Usuarios y accesos**, asignándola al cliente ficticio. Cierre sesión y entre con esas nuevas credenciales: verá los servicios propios y los certificados vigentes. Vuelva con su cuenta administradora para cambiar la empresa asignada o suspender la cuenta y comprobar que se cierran sus sesiones.

### Emitir el certificado del servicio completado

Entre como **administrador** y abra **Certificados**. Un servicio completado todavía no aparece en «Servicio habilitado» si su ficha ambiental no está revisada. En «Servicios cerrados pendientes de certificado» busque el folio y pulse **Preparar ficha**. Compruebe que corresponda al servicio correcto, complete clasificación, generador, transportista, receptor, destino y guía, y guarde el borrador. Abra la ficha y pulse **Marcar revisado** después de comprobar peso y evidencia. Después pulse **Continuar a certificados**: el folio quedará seleccionado para emitir. Descargue el PDF con QR después de la emisión. Si la ficha ya estaba en borrador, la página indicará **Revisar ficha** en lugar de preparar una nueva.

Las cotizaciones, solicitudes de compra, guías de transporte, ingresos de material y facturas de proveedores se registran manualmente. Las aprobaciones multinivel, devolución a proveedor, conciliación bancaria y documentos tributarios electrónicos quedan pendientes. La acreditación registra referencias y vigencia, sin carga del documento físico. El registro ambiental es de preparación y control interno, no una declaración regulatoria ni una integración con portales estatales. El PDF acredita los datos **registrados y revisados internamente**, no la recepción de terceros ni un cumplimiento ambiental oficial. El archivo de planillas originales se puede importar por separado y consultar en el panel de administración; no convierte automáticamente filas antiguas en operaciones activas.

**No introduzca datos reales de RERCHAR en el entorno de demostración antes de acordar infraestructura, accesos y respaldo.**

## Comandos útiles

| Comando | Resultado |
| --- | --- |
| `npm run dev` | Inicia el piloto local |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `python scripts/extract-workbooks.py /ruta/a/excel > /ruta/privada/planillas.jsonl` | Extrae los libros originales `.xlsx` y `.xlsm` con columnas y fórmulas; requiere `openpyxl` |
| `node --import tsx scripts/import-workbooks.ts /ruta/privada/planillas.jsonl` | Importa versiones sin duplicarlas a PostgreSQL para el módulo Planillas originales |
| `npm run review:admin -- 'correo' 'contraseña' ['correo anterior']` | Crea o ajusta la cuenta de revisión en la base local |
| `npm run db:seed -- --demo` | Completa maestros ficticios, incluido un conductor, cuando ya existe un administrador |
| `npm test` | Prueba servicios, bodegas, flota, acreditación, finanzas, ficha ambiental, certificados, cuentas y corrección de maestros |
| `npm run typecheck` | Comprueba tipos de TypeScript |
| `npm run build` | Comprueba compilación de producción |

## Publicar el piloto de revisión

Para alojarlo en Vercel hace falta una cuenta/proyecto de Vercel y una base PostgreSQL persistente compatible. Se puede publicar desde el repositorio conectado o desde la carpeta del proyecto. La publicación no crea por sí sola la base, el usuario inicial ni la URL final.

1. Cree y conecte PostgreSQL al proyecto. Configure `DATABASE_URL` en el entorno de ejecución y en la terminal que usará para la preparación inicial. No publique esta cadena en un archivo del repositorio ni en una captura. En producción es obligatoria.
2. Con esa misma `DATABASE_URL`, desde la carpeta del proyecto ejecute `npm ci` y `npm run db:migrate`. Debe ejecutar la migración **antes** de abrir el sitio; no está integrada al arranque de cada instancia.
3. Cree el primer administrador con `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` como variables temporales de su terminal y ejecute `npm run db:seed -- --demo` si quiere los maestros ficticios. El comando no modifica una contraseña existente; es preferible crear la cuenta con una clave de revisión nueva y única. No configure la clave como variable permanente de Vercel.
4. En Vercel configure `EVIDENCE_STORAGE=database` y `APP_BASE_URL=https://<dominio-estable-del-piloto>`, además de `DATABASE_URL`. Publique la carpeta `rerchar` como proyecto Next.js. Después del despliegue visite la URL HTTPS real y recorra el flujo de [ENTREGA_PILOTO_28-09-2026.md](docs/ENTREGA_PILOTO_28-09-2026.md). Defina el dominio **antes** de emitir certificados, pues el QR graba ese enlace.

### Importar las planillas entregadas

Tras aplicar las migraciones `001`–`013`, instale `openpyxl` en el equipo de importación (`python -m pip install openpyxl`). Reúna los once archivos `.xlsx` y `.xlsm` en una carpeta privada. Ejecute los dos comandos de la tabla anterior con `DATABASE_URL` apuntando a la misma PostgreSQL que usa el sitio. El archivo JSONL generado incluye datos sensibles de clientes: guárdelo fuera del repositorio y elimínelo después de comprobar la importación. Una segunda ejecución con los mismos archivos omite versiones ya cargadas; cambios en un libro crean una versión nueva con su huella SHA-256. Administración consulta las filas y fórmulas en **Planillas originales**.

El importador preserva las fuentes para conciliación. Cree o vincule en las pantallas de clientes, servicios, ingresos, guías, compras e inventario los movimientos históricos aprobados por operaciones. Las planillas mezclan variantes de cálculo, celdas sin dato y registros duplicados; no se fabrican clientes ni facturas a partir de coincidencias de nombre. El peso neto de cada ingreso exige elegir su base explícita y las diferencias contra el neto anotado requieren observaciones. La conexión automática con SII, Shell y Tracklite sigue fuera de esta entrega.

En Vercel los archivos adjuntos del piloto se guardan en PostgreSQL (migración `010`), con un límite de 4 MB por archivo; mantenga el entorno sin datos reales hasta configurar accesos y respaldo. Esta opción sirve para evidencias pequeñas durante la revisión. Para documentos grandes y operación productiva se necesita almacenamiento privado de objetos o un volumen persistente y una política de respaldos. La instalación local conserva sus archivos previos en `.local/archivos` y admite 5 MB por archivo.

En un servidor con volumen privado persistente puede omitir `EVIDENCE_STORAGE=database` y definir `STORAGE_DIR` fuera de la carpeta pública, con respaldos. El almacenamiento integrado PGlite sólo sirve para desarrollar y hacer demostraciones en un equipo; no funciona como base persistente de Vercel. Configure HTTPS, respaldos y acceso antes de ingresar información real.

Configure `APP_BASE_URL` con la URL pública exacta del sistema antes de emitir certificados en un servidor (por ejemplo, `https://sistema.sudominio.cl`). En producción sólo admite HTTPS. En el piloto local se usa `http://localhost:3000` si no se configura; si ejecuta el sistema en otro puerto, establezca su dirección en `.env.local` **antes** de emitir un certificado. El QR conserva el enlace impreso y no debe depender de una URL temporal.

No presuponga que el hosting compartido actual de 8 GB SSD permite ejecutar Node.js/PostgreSQL o conservar adjuntos de forma segura; esa compatibilidad debe medirse antes de elegir el despliegue definitivo.

Consulte [ENTREGA_PILOTO_28-09-2026.md](docs/ENTREGA_PILOTO_28-09-2026.md) para las condiciones de la entrega, [ARQUITECTURA_Y_ENTREGA.md](docs/ARQUITECTURA_Y_ENTREGA.md) para el modelo, [COBERTURA_20_MODULOS_28-09-2026.md](docs/COBERTURA_20_MODULOS_28-09-2026.md) para el avance módulo por módulo y [GUIA_REUNION_25-09-2026.md](docs/GUIA_REUNION_25-09-2026.md) para el recorrido del encuentro.
