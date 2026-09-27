# Entrega de revisión del piloto · 28 de septiembre de 2026

Actualizado el 27 de septiembre de 2026. El piloto está publicado en https://rerchar-piloto.vercel.app y se verificó con datos ficticios el acceso, la cotización PDF, el servicio programado, el control de guía y el ingreso de material. La entrega del lunes 28 es una revisión de piloto, sujeta a validación de RERCHAR, no una aceptación del sistema completo.

## Qué puede revisar RERCHAR

El criterio del anexo para el piloto es un flujo navegable con persistencia, perfiles principales y trazabilidad demostrable: acceso, maestros, solicitud, planificación, checklist, evidencia y trazabilidad base. El código cubre ese recorrido. También ofrece versiones iniciales de flota, mantenimiento, bodegas, compras, finanzas, registro ambiental interno, certificados y portal cliente, con el alcance y las limitaciones de [COBERTURA_20_MODULOS_28-09-2026.md](COBERTURA_20_MODULOS_28-09-2026.md).

| Paso de demostración | Verificación visible |
| --- | --- |
| Acceso | Administrador inicia sesión; perfiles conductor y cliente ven sólo sus servicios. |
| Maestros | Crear o corregir cliente, faena y camión; el cambio aparece en auditoría. |
| Solicitud | Crear folio asociado al cliente y la faena ficticios. |
| Despacho | Programar camión, conductor y fecha; consultar agenda y orden de servicio. |
| Terreno | Guardar checklist, iniciar ruta, adjuntar archivo pequeño, registrar bruto y tara y cerrar. |
| Trazabilidad | Consultar línea de tiempo, evidencia descargable y reporte del servicio. |
| Extensión opcional | Revisar ficha ambiental y el flujo condicionado de certificado PDF/QR; no emitir constancias de un retiro ficticio como si hubiera ocurrido. |
| Formatos reales | Mostrar ítems separados bajo una misma guía, hoja de ingreso imprimible y borrador de OC rotulado «sin emitir», tras publicar el parche de ajustes. |

Las trece pruebas automatizadas cubren el flujo base y reglas adicionales, incluida la evidencia persistida, los permisos por cliente, cotizaciones, múltiples materiales por guía y borrador de OC. El levantamiento de las planillas reales está en [LEVANTAMIENTO_OPERACION_REAL_25-09-2026.md](LEVANTAMIENTO_OPERACION_REAL_25-09-2026.md). La compilación y pruebas locales de los ajustes pasan; falta repetir el recorrido en la URL publicada una vez instalados.

## Antes de la demostración en la URL publicada

El proyecto de Vercel y PostgreSQL persistente ya existen. Para habilitar los cambios, primero aplique las migraciones `015` y `016` en la base, publique el parche y después aplique `017` cuando el despliegue figure como listo. La primera fase deja intacta la restricción antigua para que el sitio actual siga funcionando. No cargue las planillas originales como un módulo ni sustituya los datos DEMO por movimientos reales sin conciliación.

Después de publicar, compruebe cliente → cotización → PDF, la opción de registrar una entrega manual efectivamente realizada, servicio → guía con dos materiales → ingreso → hoja imprimible, y solicitud de compra aprobada → borrador de OC. El borrador no se emite para una compra ficticia. Verifique permisos del portal y la impresión en navegador antes de la reunión. El QR de un certificado vigente debe probarse sólo con una operación legítimamente cerrada y documentada.

## Qué falta para aceptar o entregar como sistema completo

- Confirmar con RERCHAR los procesos, campos, roles, documentos, formato de certificado y criterios de aceptación; registrar observaciones y conformidad por escrito.
- Probar el despliegue real con navegador y móvil; acordar responsables del dominio, acceso, respaldos y restauración antes de incorporar datos reales.
- Completar el alcance de los veinte módulos según la matriz: trabajo sin conexión y sincronización, aprobaciones/documentos, reportes pactados, integraciones y reglas reales.
- Conciliar las planillas originales ya recibidas para una migración trazable; aún no se importó información real.
- Revisar seguridad, permisos, rendimiento y recuperación con la infraestructura final. El almacenamiento en PostgreSQL de imágenes y PDF pequeños es una solución acotada para esta demo, no la solución documental definitiva.

**Estado:** URL publicada con datos DEMO y recorrido parcial comprobado. Los cambios de esta revisión requieren publicación y prueba en la URL antes de mostrar esos tres formatos nuevos. Los libros reales aún no se han migrado al registro operativo.
