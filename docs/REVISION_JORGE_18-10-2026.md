# Revisión del recorrido de Jorge · 18 de octubre de 2026

Fuente: audio de 96 minutos «Reunion Jorge supervios rerchar.m4a». La transcripción automática tiene pasajes ininteligibles; los minutos se usan para ubicar el comentario y deben contrastarse con el audio al cerrar cada observación. La matriz completa mantiene los 38 registros previos y suma los números 39–56.

## Recorridos que ya pueden probarse

| Minuto | Ruta | Acción y resultado esperado |
| --- | --- | --- |
| 16:57 | RERCHAR → Operación → Control de Guía | Registrar una guía de venta de material, sus pesos y la salida de stock, y revisar factura y cobranza cuando corresponda. Este flujo ya existía en la base y debe revisarse con el formato original de Jorge. |
| 19:00 | Comercial → Clientes → Registrar cliente | Crear ficha en Maestros; crear centro o lugar de entrega. Usuarios y accesos sirve para abrir una cuenta de portal sólo si se necesita. |
| 26:46 | Operación → Solicitudes → Nueva solicitud | Elegir Venta de material. Si el cliente aún no tiene centro, usar el enlace a Maestros → Centros antes de continuar. Queda por validar si la venta directa requiere siempre centro. |
| 35:00 | Recursos compartidos → Compras | Crear solicitud SC, aprobar, preparar borrador sin número y emitir OC. Sólo entonces se asigna correlativo interno por emisor. La serie oficial y su último número requieren validación antes de enviar órdenes externas. |
| 50:48 | Compras → solicitud aprobada → Recepción | Elegir la ruta sin OC, empresa, proveedor, bodega, cantidad y guía o factura. El movimiento ingresa al Kardex una vez; una recepción parcial admite siguientes entregas. |
| 54:00 | Recursos compartidos → Inventario | Comprobar físico, reservado y disponible; mínimo y máximo son cantidades. Reservar, liberar o consumir para observar el efecto. |
| 63:22 | Operación → Tolvas y contenedores | Registrar mantención y marcar fuera de servicio con ubicación de taller. Debe quedar el estado visible y un movimiento; retirar primero de faena si estaba instalada. |
| 69:19 | Configuración → Maestros | Crear camión o rampla con patente destacada y descripción opcional cuando existe patente. |
| 80:18 | Recursos compartidos → Combustible | Registrar lectura en la carga; el odómetro de la ficha se actualiza mediante el flujo existente. La lectura manual se conserva para registros ajenos al combustible. |
| 84:00 | Recursos compartidos → Mantenimiento | Retirar neumático indicando bodega; consultar su unidad y disponibilidad en Inventario. No se suma un neumático identificado al stock genérico. |
| 92:06 | Flota → ficha de camión/rampla | Adjuntar varios PDF con nombres originales y descargarlos desde la carpeta del vehículo; acceso sólo a operaciones. |

## Pendiente de validación o de alcance

- Foto al instalar o reubicar una tolva (61:38–62:44): operaciones puede adjuntarla en el movimiento; queda el nombre del archivo, responsable y fecha en el historial, con descarga privada. Validar con Jorge si la foto debe ser obligatoria y quién la carga en terreno; no se amplió el permiso del conductor.
- Código SKU automático: faltan categoría y regla de numeración (aprox. 45:00–49:00).
- API del proveedor de combustible: falta proveedor, especificación y autorización (80:22–80:53).
- Una tercera empresa exportadora, citada por Renato y Eduardo al inicio (09:57–12:33): nombre legal no confirmado; DUS, BL, packing list y contratos constituyen un proceso adicional. El levantamiento documentado cubre RERCHAR y E y J. Se evalúa por separado antes de incorporarlo.

Las migraciones `045`–`047` y `059` se aplican con `npm run db:migrate`; en Vercel el comando de compilación las ejecuta antes de publicar. Las pruebas locales de compras, guías, tolvas, mantenimiento, documentos y permisos forman parte de `npm test`. Ningún resultado local sustituye la revisión funcional de Jorge con datos reales y el cotejo del correlativo oficial.
