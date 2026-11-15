# Continuidad RERCHAR — 15 de noviembre de 2026

## Dirección visual confirmada por Roberto

- Roberto rechazó el rediseño `d11643f`: colores demasiado sutiles, aspecto infantil por tarjetas redondeadas/iconos y pérdida del carácter profesional anterior.
- Se recupera la base visual de `53ef494`: panel compacto, indicadores en una banda, gráficos de líneas y barras, encabezado con marca, tablas y bloques rectangulares.
- RERCHAR se identifica claramente en verde y E y J en azul. Reforzar esa separación en menú, selección activa, cabecera y datos principales; no volver a neutralizar ambos espacios ni introducir tarjetas decorativas.
- Las mejoras funcionales se conservan: filtro Todos/Prioritarios, saldo administrativo resumido, filtros de acreditación por empresa y vigencia, y toda la paginación/Cobranza anterior.
- El acceso real ya se completó mediante intervención de Roberto. Sesión administradora abierta en el navegador; filtro de prioridades comprobado (1 aviso prioritario frente a 5 totales de RERCHAR). No se modificaron documentos ni pagos reales.
- Verificación visual: revisar la versión corregida en la sesión abierta después del despliegue, en ambos espacios. El espaciado de los gráficos vuelve a las reglas acotadas de la base anterior; las pruebas automatizadas no sustituyen esa comprobación.
- El navegador sólo admite HTTP(S), no archivos locales. DevTools está bloqueado por la organización: no volver a intentar activarlo. Para revisar otras anchuras se puede usar el tamaño normal de la ventana, sin cambiar políticas.
- Base publicada antes de esta corrección: `d11643f`; base funcional de Cobranza: `53ef494`. Verificar siempre el check **Vercel – rerchar-piloto** del nuevo commit.

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
