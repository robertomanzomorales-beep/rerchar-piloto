# Guía de demostración y levantamiento · RERCHAR

**Reunión:** 25 de septiembre de 2026, 11:00. **Propósito:** probar flujos integrados y recoger cómo opera RERCHAR en la práctica. Esta guía describe hipótesis del piloto; los procesos deben ser validados por el equipo de RERCHAR. Para una conversación de 25 minutos muestre los pasos 1 a 8 y elija dos áreas adicionales según los asistentes; deje el resto como recorrido de profundización.

## Recorrido propuesto (20 a 25 minutos)

| Paso | Qué mostrar | Qué validar con RERCHAR |
| --- | --- | --- |
| 1. Acceso | Administrador y perfiles separados | Quién solicita, programa, conduce y cierra |
| 2. Maestros | Cliente, centro/faena, camión y conductor | Identificadores reales y otros recursos necesarios |
| 3. Solicitud | Material, origen/destino, peso estimado, prioridad | Campos obligatorios, aprobaciones y excepciones |
| 4. Despacho | Fecha, camión, rampa, conductor y guía; agenda y orden imprimible | Quién asigna, conflictos, cancelaciones y cambios de última hora |
| 5. Ejecución | Checklist, inicio de ruta y evidencia adjunta | Controles previos, tipos de documentos y responsables |
| 6. Cierre | Peso bruto, tara, neto e historial | Método de pesaje, comprobantes, conciliación y cierre |
| 7. Flota | Avería, bloqueo de disponibilidad y resolución | Quién detiene, libera y reasigna el activo |
| 8. Reporte | Filtros y descarga CSV por perfil | Columnas, frecuencias y destinatarios reales |
| 9. Compras | Crear solicitud, agregar artículos, aprobar y registrar proveedor/orden | Quién solicita, quién aprueba, si se comparan cotizaciones y cuáles son los límites |
| 10. Bodega | Recepción parcial con guía, saldo pendiente, Kardex, reserva y transferencia | Ubicaciones reales, unidades, puntos de reposición, devoluciones y control de facturas |
| 11. Mantenimiento | Plan, orden de trabajo, repuesto reservado, costos y desbloqueo de camión | Intervalos por km/horas o fecha, talleres, repuestos y quién libera el activo |
| 12. Combustible | Carga con fecha, litros, costo y lectura; rendimiento estimado | Fuente confiable del odómetro, estanque lleno, anomalías y responsables |
| 13. Tolvas | Instalar, retirar, consultar permanencia y movimiento por servicio | Códigos, estados, ubicación, días tolerados y cargos asociados |
| 14. Personal | Exigencia por faena, fecha de vencimiento y bloqueo de despacho | Lista real de documentos y quién verifica/acredita cada conductor |
| 15. Finanzas | Contrato, tarifa, valor del servicio, pagos y margen | Reglas de precio, impuesto, órdenes de compra, DTE y aprobación financiera |
| 16. Registro ambiental | Ficha vinculada al servicio, evidencia y revisión; referencia externa manual | Residuo peligroso o no, manifiestos, responsables, formatos y revisión legal |
| 17. Auditoría | Eventos filtrables y CSV | Eventos indispensables para supervisión y conservación |
| 18. Certificado | PDF con QR y verificación pública de vigencia; portal propio del cliente | Nombre, evidencia mínima, firma, revocación, destinatarios y formato final |

**Prueba sugerida:** use el cliente, faena, camión y conductor de demostración. Registre una solicitud; asígnela; abra la orden imprimible; complete las cuatro verificaciones; inicie la ruta; adjunte una imagen de prueba y cierre con peso bruto superior a tara. Después filtre el folio en Reportes y descargue el CSV. Para demostrar una avería, cree un segundo servicio, detenga un activo desde Flota y compruebe el bloqueo de una nueva asignación antes de registrar su solución. En Inventario, use el repuesto ficticio y las dos bodegas para mostrar stock y traslado; en Compras, solicite más unidades, apruebe y registre dos entregas parciales para verificar la actualización del Kardex.

**Secuencia de profundización:** sobre ese mismo folio cerrado, instale y retire la tolva ficticia en la faena, prepare y revise la ficha ambiental, valore el servicio con una tarifa de prueba y asocie una factura externa ficticia. En paralelo cree un requisito de acreditación para la faena y compruebe el bloqueo del conductor hasta su verificación. El panel y la auditoría reflejan los cambios; use referencias claramente ficticias. La ficha ambiental y la factura **no se presentan ni se emiten** a entidades externas desde la aplicación.

Como cierre del recorrido, emita el certificado operacional, abra el PDF y pruebe el QR. La validación pública no muestra datos del cliente: únicamente estado y versión. Revocar el certificado o registrar una observación ambiental cambia la consulta a «revocado»; la versión histórica se conserva.

## Decisiones por registrar

1. ¿Una solicitud necesita aprobación previa a la programación? ¿Quién puede cambiar o cancelar una orden?
2. ¿Qué datos exactos distinguen retiro, traslado, compra y venta? ¿Qué residuos requieren un flujo especial?
3. ¿Cómo se identifican conductor, camión, rampa, centro y cliente? ¿Existe un catálogo o planilla para migrar?
4. ¿Qué documento acompaña el traslado? ¿En qué paso se emite, firma y adjunta?
5. ¿Cuál es la fuente del peso bruto y la tara, y quién autoriza correcciones posteriores?
6. ¿Se necesita registrar tiempos de llegada, retiro y entrega? ¿Qué pasa sin señal de internet?
7. ¿Qué accesos deben tener administración, operaciones, conductor, cliente y gerencia?
8. ¿Cuáles son los tres reportes indispensables para la entrega del 28? ¿Qué filtros y formatos requieren?
9. ¿Cuántas cotizaciones exige una compra y quién aprueba según monto, categoría o criticidad?
10. ¿Cómo registran entrega parcial, rechazo, devolución, factura y pago? ¿Qué documentos deben adjuntarse?
11. ¿Cuáles son las bodegas reales, unidades de medida, niveles mínimos y responsables de ajustes y reservas?
12. ¿Qué activos usan odómetro u horómetro, cuáles son las frecuencias y quién confirma el cierre de una orden de trabajo?
13. ¿Cómo identifican y facturan las tolvas, y qué fecha inicia la permanencia en cada sitio?
14. ¿Quién valida las acreditaciones, qué pruebas documentales exige cada cliente y cuánto antes avisan vencimientos?
15. ¿Qué tarifas aplican por faena, residuo, kg o servicio, y cómo asocian OC, DTE, pagos y costos reales?
16. ¿Qué datos y documentos confirman la clasificación ambiental y quién efectúa las declaraciones oficiales?
17. ¿Qué campos mínimos debe mostrar un certificado al cliente y quién autoriza su emisión, corrección o revocación?

**Resultado buscado:** asignar un dueño a cada decisión pendiente y cerrar criterios verificables de aceptación para la siguiente iteración. Dejar por escrito qué controles y documentos exige el flujo real. No usar información real sensible en este piloto local hasta definir accesos, infraestructura y respaldo.
