# Flete falso y sobreestadía: parte diario → revisión comercial

La planilla `SERVICIOS Y TRANSPORTES (CON ALERTAS) - 2026.xlsx` contiene filas separadas para flete falso y sobreestadía; el resultado semanal puede quedar incompleto o suspendido. Ejemplos revisados: febrero, AMBIPAR DMH (no se pudo cargar); abril, RESITER Zaldívar (la observación ordena **no cobrar**); mayo, AMBIPAR DGM (cancelación intempestiva con cotización, OC y factura); agosto, AMBIPAR DGM (dos fletes falsos por clima). El valor neto de una propuesta puede abarcar más de una línea: no se importa como precio de un cargo individual.

## Uso

1. Operaciones programa el camión y registra el resultado fechado en la ficha de la solicitud.
2. En esa misma ficha propone **Flete falso**, **Sobreestadía** u **Otro cargo**, asociado al día registrado. Indica motivo, monto si se conoce y referencias de cotización/OC. El sistema conserva una copia de la observación y el resultado del parte.
3. En `Cierre y control → Cobros extraordinarios`, Administración aprueba el monto neto acordado o descarta el cobro con motivo. Ambas empresas tienen listas y alertas separadas.
4. Si se emitió una factura externamente, Administración registra su folio y fecha. Esto es una constancia, no la emisión de un DTE.

El cargo aprobado no entra automáticamente en la valorización principal, estados de pago ni saldo de la factura principal. El historial y la decisión quedan en Auditoría. La migración `038_cobros_excepcionales.sql` debe aplicarse antes del despliegue de esta versión.

**Datos históricos:** las filas de la planilla se usaron para validar el flujo; no se crearon registros de prueba en la base productiva ni se asignaron montos de propuestas compuestas a casos particulares.
