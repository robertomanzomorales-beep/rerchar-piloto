# Continuidad RERCHAR — 15 de noviembre de 2026

## Proyecto y punto recuperado

- Repositorio: `robertomanzomorales-beep/rerchar-piloto`; rama principal: `main`.
- Aplicación principal: https://rerchar-piloto.vercel.app.
- Conversación anterior: «Revisar Excel operativos», detenida por longitud máxima.
- Se recuperó el commit local `e6fc120` sobre `b345c3e`; quedó integrado en `bfd2f06`, publicado con check satisfactorio del proyecto principal.

## Avance de esta entrega

- Cobranza aplica los filtros en la consulta de base de datos y permite recorrer 100 facturas por página.
- El CSV exporta todas las facturas del filtro, en lotes de 500, con un único encabezado y BOM. La vista anterior limitaba ambos resultados a 500.
- Se conserva la separación por empresa RERCHAR / E y J y el acceso administrativo a Cobranza.
- Los abonos y las anulaciones conservan empresa, filtro y página, incluso cuando hay errores de validación. El retorno valida estado y número de página.
- Cuando una operación vacía la última página, la lista vuelve a la última página disponible y conserva el aviso de resultado. Se aplica también al listado de conciliación.
- No se agregan migraciones en esta entrega.

## Verificaciones realizadas

- Suite completa: 41 pruebas aprobadas, 0 fallidas, con base de datos aislada en memoria y sin `DATABASE_URL` de producción.
- Regresión de Cobranza: 502 facturas, acceso a las posteriores al registro 500, filtros y separación por empresa (`tests/extra-charges.test.ts`).
- Exportación: formato, saldos, protección de texto y encabezado único al concatenar lotes (`tests/receivables-export.test.ts`).
- Venta de material: factura compartida sin duplicar total, pagos parciales/completos, saldo y anulación con conservación de guía (`tests/material-sale-billing.test.ts`).
- `npm run typecheck` y `npm run build`: correctos.
- `app/icon.jpg` y `app/apple-icon.jpg` coinciden byte a byte con `rerchar-ico(2).jpg`, solicitado por Roberto. Conservar ese archivo original.
- Recorrido HTTP real, con aplicación y base aisladas: páginas de 100, 100 y 2 registros; CSV de 502 facturas con encabezado único; abono de material de $5.000 y saldo actualizado de $6.900; separación por empresa y respuestas 400/401/403 correctas.
- Retorno HTTP de abono y anulación desde página 2: conserva filtro y página. Un sobrepago rechazado conserva ese contexto y muestra el error. Al completar el pago de la única factura pendiente en página 6, vuelve a página 5 con el aviso de éxito.
- El navegador abrió correctamente el acceso publicado en `/ingresar`. La revisión visual interna sigue pendiente de una sesión administradora; no se introdujeron facturas ni pagos de prueba en la aplicación publicada.
- Para las pruebas HTTP locales, iniciar el servidor y el cliente de comprobación dentro de la misma ejecución; así se resolvió el fallo de conexión observado al separarlos.

Comando de pruebas utilizado:

```bash
env -u DATABASE_URL -u NODE_ENV node --import tsx --test --test-concurrency=3 tests/*.test.ts
```

## Publicación y continuación

- Confirmar el commit resultante en `main` y el check **Vercel – rerchar-piloto** antes de afirmar que está publicado.
- Existe además un check de un proyecto duplicado **Vercel – rerchar-piloto-pjlu**, fallido en el commit anterior; distinguirlo del proyecto principal.
- La conexión Vercel de esta sesión devolvió 403 para el equipo del proyecto. El estado del despliegue se puede contrastar con los checks del commit en GitHub.
- Próxima comprobación visual: revisar Cobranza en escritorio y móvil con sesión administradora y datos de prueba. El recorrido de servidor, formularios y CSV ya fue comprobado por HTTP.
- El corte anterior dejó SICEP propio de RERCHAR y SMTP real como parciales; no se resolvieron en esta entrega.
- Al continuar, leer este registro y el estado Git actual. Mantener un registro breve y actualizado para que la continuidad no dependa de la longitud del chat.
