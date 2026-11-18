# Solicitudes y programación semanal — 18/11/2026

## Problemas corregidos

- Nueva solicitud elegía automáticamente el primer cliente del catálogo y podía presentar la creación de una faena para ese cliente sin una selección explícita. El formulario ahora comienza sin cliente en administración/operaciones; los clientes de portal y las cotizaciones aceptadas conservan su vínculo obligatorio.
- Un error de guardado redirigía y borraba datos de la solicitud. Se utiliza el estado de la acción y campos controlados para mantener cliente, empresa, centro nuevo/dirección, operación, fechas, ruta, prioridad, observaciones y clave de reintento. El aviso recibe foco. No es almacenamiento permanente del borrador fuera del formulario.
- Cambiar de cliente limpia el nombre y dirección del nuevo centro, evitando arrastrar una dirección del cliente anterior. El término de arriendo tiene como mínimo la fecha de inicio, manteniendo también la validación de servidor.
- La consulta semanal de flota/partes se cortaba en mil registros; la agenda de cliente/conductor en trescientos. El recorte podía ocultar una ocupación al final de la semana. Se recupera el rango completo, limitado a fechas válidas de hasta siete días; la programación de flota y los partes exigen una semana exacta. Se conserva el alcance por perfil y la ocupación compartida entre empresas.
- Los contadores de solicitudes y prioridades de la agenda ahora incluyen toda la cola. La lista breve mantiene sesenta filas, muestra cuántas se presentan y permite abrir el listado conservando la empresa. El acceso «Programar solicitud» también conserva esa selección.

## Presentación

La planilla conserva cabecera y columna del camión al desplazarla, destaca el día actual y limita visualmente las descripciones largas sin quitar su contenido ni el acceso a la ficha. Se mantiene región de desplazamiento con teclado, la fecha de Chile y el estilo compacto. Los acentos de agenda respetan verde RERCHAR y azul E y J.

## Verificación

- **64 pruebas aprobadas**. La regresión de volumen comprueba 1.002 viajes/partes, ocupación de la otra empresa, alcance de cliente y conductor y una cola de 61 pendientes con sesenta filas visibles y 61 prioridades contadas. Son datos artificiales para comprobar las consultas; no representan una asignación física ni una prueba de concurrencia PostgreSQL.
- `npm run test:request-form-http` levanta Next.js real y una base temporal. Para ambas empresas comprueba error de fechas, conservación de los valores en el formulario, ausencia de solicitud y centro nuevos tras el error, corrección/reenvío y reintento sin duplicados. También comprueba contexto de empresa, enlace desde agenda, restricción del portal y redirección sin sesión.
- TypeScript y compilación de producción comprobados. Las verificaciones funcionales usan datos ficticios y no envían correos. La revisión del sitio publicado es de consulta, sin crear solicitudes, partes ni bloqueos reales.
- El primer despliegue detectó que el nuevo verificador importaba una fixture excluida por `.vercelignore`. Los scripts `verify-*.ts` se excluyen también del paquete productivo; siguen en Git y las pruebas locales. Se compiló correctamente una copia de los 304 archivos incluidos por esas reglas, sin carpetas de pruebas/documentación ni verificadores, antes de volver a publicar.
- La matriz y los vistos buenos del cliente no se modifican en este lote. La conexión automática SII sigue pendiente dentro del alcance incluido; no se incorporan las seis ampliaciones excluidas.
