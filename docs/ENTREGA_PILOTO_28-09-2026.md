# Entrega de revisión del piloto · 28 de septiembre de 2026

Versión preparada el 25 de septiembre de 2026. Los materiales de alcance recibidos sitúan la entrega formal del piloto el lunes 28. El anexo disponible es una versión de trabajo; la aceptación contractual debe referirse a los documentos firmados y a la revisión de RERCHAR.

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
| Extensión opcional | Revisar ficha ambiental interna y emitir certificado PDF/QR con URL estable. |

Las doce pruebas automatizadas cubren el flujo base y reglas de los módulos adicionales, incluida la evidencia persistida en la base, la restricción de descarga por cliente y el control de cotizaciones y guías. El levantamiento de las planillas reales y las nuevas funciones están en [LEVANTAMIENTO_OPERACION_REAL_25-09-2026.md](LEVANTAMIENTO_OPERACION_REAL_25-09-2026.md). La compilación de producción y la revisión en un navegador conectado al despliegue son comprobaciones separadas que deben realizarse antes de declarar la demo en línea lista.

## Para mostrarlo en una URL

Se requiere un proyecto de hosting para Next.js (por ejemplo, Vercel), una base PostgreSQL persistente y acceso autorizado para configurarlos. Publique el código en la carpeta `rerchar` sin necesidad de GitHub; aplique `npm run db:migrate` a la base **antes** de abrir el sitio y cree el primer administrador con `npm run db:seed -- --demo` y variables de entorno temporales. En el proyecto configure `DATABASE_URL`, `EVIDENCE_STORAGE=database` y `APP_BASE_URL` con el dominio HTTPS estable. La configuración y comandos completos están en el [README](../README.md). Sólo se cargan datos ficticios para la revisión.

Después del despliegue, realice el recorrido anterior desde un navegador con la URL real y pruebe el inicio de sesión, la carga/descarga de un PDF o imagen de menos de 4 MB, el cierre, la ficha, el PDF y la lectura del QR. Valide la presentación en móvil y escritorio. Una URL generada sin estos pasos no confirma que el piloto funcione.

## Qué falta para aceptar o entregar como sistema completo

- Confirmar con RERCHAR los procesos, campos, roles, documentos, formato de certificado y criterios de aceptación; registrar observaciones y conformidad por escrito.
- Probar el despliegue real con navegador y móvil; acordar responsables del dominio, acceso, respaldos y restauración antes de incorporar datos reales.
- Completar el alcance de los veinte módulos según la matriz: trabajo sin conexión y sincronización, aprobaciones/documentos, reportes pactados, integraciones y reglas reales.
- Conciliar las planillas originales ya recibidas para una migración trazable; aún no se importó información real.
- Revisar seguridad, permisos, rendimiento y recuperación con la infraestructura final. El almacenamiento en PostgreSQL de imágenes y PDF pequeños es una solución acotada para esta demo, no la solución documental definitiva.

**Estado:** código del piloto preparado para revisión local y para desplegarlo con una base externa; la URL pública y la aceptación de RERCHAR sólo se pueden confirmar después de la publicación y del recorrido real.
