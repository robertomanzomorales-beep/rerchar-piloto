# Programación, parte diario y control documental

Fuente: `PROGRAMACION SEMANAL CAMIONES 2026.xlsx`, hojas `PROGRAMACION ENERO` a `PROGRAMACION SEPTIEMBRE` y `CONTROL DEF ENERO` a `CONTROL SEPTIEMBRE`.

| Planilla | Sistema | Regla |
| --- | --- | --- |
| Matriz de patentes por día | Agenda semanal, filas de camiones | Las asignaciones reales provienen de solicitudes; admite más de una por día si no coinciden camión, rampla o conductor dentro de la ventana de despacho. |
| Libre / mantención / sin conductor | Novedad por activo y día | Mantención, indisponibilidad y falta de conductor impiden programar el camión ese día; observación sólo informa. |
| `FECHA`, `SERVICIOS`, `CONDUCTOR / CAMION`, `ESTADO`, `OBSERVACIONES` | Parte diario en ficha del servicio | El estado de terreno es realizado, incompleto o suspendido; la causa es obligatoria en los dos últimos. Se conservan el camión y nombre del conductor del momento del registro. No altera el estado administrativo del servicio. |
| `ESTADO DE ENVIO DE GD` | Estado manual de envío de guía de despacho | Sin registrar, pendiente, enviada o no aplica. |
| `FECHA ENVIO CORREO SOL (GD VAL)` y `FECHA DE RECEPCIÓN DE GD VAL.` | Solicitud y recepción de guía valorizada | Deben respetar orden cronológico. |
| `Cierre ciclo (enviar documentación)` | Fecha de envío de documentos de cierre | No puede preceder a la recepción de la guía valorizada. |
| Columnas de días y `ALERTA` | Tres tiempos transcurridos por etapa | Se calculan con fechas de Chile y nunca se importan los resultados de fórmulas rotas (`#REF!`, fechas de 1773, seriales de Excel). No se etiqueta “vencida” sin plazo aprobado por operaciones. |

La agenda y el panel de cada empresa muestran los últimos partes incompletos o suspendidos aún abiertos. Un parte posterior realizado o el cierre del servicio elimina esa alerta; los registros anteriores siguen en el historial. Los datos de meses anteriores del Excel no se cargan automáticamente, porque la matriz y el detalle pueden discrepar en fechas y nombres y requieren conciliación por servicio.
