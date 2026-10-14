# Pagos a proveedores y registro de transacciones · 14 de octubre de 2026

## Alcance implementado para RERCHAR y E y J

| Paso | Registro | Control |
| --- | --- | --- |
| 1. Factura recibida | Proveedor, RUT, número, monto, vencimiento, empresa y documento original. | El expediente queda vinculado a una sola empresa. |
| 2. Solicitud de transferencia | Monto, banco y cuenta de destino. | Reserva el saldo solicitado, impide duplicados por clave y no permite superar el saldo. |
| 3. Aprobación o rechazo | Persona, fecha y observación. | El solicitante no puede decidir; para aprobar exige factura original adjunta. |
| 4. Registro de ejecución | Fecha, referencia bancaria y comprobante PDF o imagen. | El aprobador no puede registrar la ejecución; todavía no se aplica el pago. |
| 5. Verificación | Otra persona comprueba monto, referencia y respaldo, con nota. | El ejecutor no puede verificar; se crea exactamente un pago y se actualiza el saldo de la factura. |

Cada cambio genera evento de auditoría. Las solicitudes se muestran en `Transferencias` por empresa y por estado. El panel de cada empresa alerta por solicitudes por aprobar, aprobadas por ejecutar y ejecutadas por verificar.

`Registro de transacciones` reúne los pagos registrados a proveedores, los pagos recibidos por facturas de servicios y las cobranzas de facturas extraordinarias, EDP o material. Muestra fecha, empresa, factura, tercero, monto, referencia, responsable y acceso al comprobante cuando una salida fue verificada. Un pago manual anterior o un cobro de cliente figura como **Registrada**. Esa etiqueta no acredita verificación bancaria. Las sumas de pantalla corresponden a los hasta 500 movimientos mostrados y no representan saldos bancarios.

La ejecución de una transferencia se realiza fuera del software, en el banco. El sistema registra su respaldo y revisión posterior; no envía órdenes al banco ni importa cartolas para conciliación automática. El registro manual de pagos a proveedores sigue disponible para pagos anteriores u otros medios, pero se bloquea mientras exista una solicitud activa en la factura. Los cobros de clientes ya documentados permanecen como registros administrativos pendientes de conciliación bancaria externa.

## Habilitación y revisión de la reunión

Aplicar la migración `db/044_transferencias_proveedores.sql` en la base productiva. Antes de aplicarla, las nuevas vistas indican que falta configuración y las facturas existentes siguen visibles. El instalador migra de inmediato si dispone de `DATABASE_URL` en la terminal. El despliegue en Vercel ejecuta `npm run db:migrate` antes de compilar, utilizando la `DATABASE_URL` configurada para ese entorno; si falla, no se publica la nueva versión. Confirmar en los registros del despliegue que aparece `Migración aplicada: 044_transferencias_proveedores.sql` o que la migración ya estaba registrada.

Para demostrar separación de funciones se necesitan al menos dos cuentas administrativas: una solicita y ejecuta, otra aprueba y verifica. Durante la revisión con Eduardo, Renato y Johana deben confirmar quién asume cada rol, qué documentos exactos respaldan cada etapa y el criterio para conciliar cobros de clientes con cartola. Estas decisiones operativas no bloquean la revisión del flujo ya implementado.
