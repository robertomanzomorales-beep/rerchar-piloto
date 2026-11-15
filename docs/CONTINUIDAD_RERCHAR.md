# Continuidad RERCHAR — 15 de noviembre de 2026

## Dirección visual confirmada por Roberto

- Roberto rechazó el rediseño `d11643f`: colores demasiado sutiles, aspecto infantil por tarjetas redondeadas/iconos y pérdida del carácter profesional anterior.
- Se recuperó la base visual de `53ef494`, publicada en `edad7c2`: panel compacto, indicadores en banda, líneas/barras y encabezado con marca. Roberto aclaró expresamente que recuperar esa base es el punto de partida: exige mejorarla profesionalmente, no dejarla igual ni limitarse a un rollback.
- RERCHAR se identifica claramente en verde y E y J en azul. Reforzar esa separación en menú, selección activa, cabecera y datos principales; no volver a neutralizar ambos espacios ni introducir tarjetas decorativas.
- Las mejoras funcionales se conservan: filtro Todos/Prioritarios, saldo administrativo resumido, filtros de acreditación por empresa y vigencia, y toda la paginación/Cobranza anterior.
- Refinamiento sobre la base: resumen único de atención (prioridades + registros sin empresa), tabla de pendientes con columnas de registros/prioridad, actualización manual del panel y hora real de consulta, mejores jerarquías de tablas y accesos operativos. Se mantienen las identidades verde/azul; no se vuelve al lenguaje de tarjetas redondeadas/iconos decorativos.
- El acceso real ya se completó mediante intervención de Roberto. Sesión administradora abierta en el navegador; filtro de prioridades comprobado (1 aviso prioritario frente a 5 totales de RERCHAR). No se modificaron documentos ni pagos reales.
- Refinamiento publicado en `acc08bc`, con check satisfactorio de **Vercel – rerchar-piloto**. Revisión visual completada en la aplicación publicada para RERCHAR y E y J: identidad verde/azul, jerarquía compacta, gráficos y tabla de gestión correctos. Todos/Prioritarios muestra 5/1 filas en RERCHAR y 5/2 en E y J; el botón Actualizar vuelve a quedar disponible tras consultar.
- En ancho de 340 px, el documento mide 337 px y la tabla 269 px: sin desbordamiento horizontal de la página. Se comprobaron controles y tabla con el zoom normal de Chrome, restaurado al 100% al terminar. La navegación móvil se abre, bloquea el fondo y se cierra con Escape. No se introdujeron datos de prueba en producción.
- El navegador sólo admite HTTP(S), no archivos locales. DevTools está bloqueado por la organización: no volver a intentar activarlo. Para revisar otras anchuras se puede usar el tamaño normal de la ventana, sin cambiar políticas.
- Base publicada antes del refinamiento: `edad7c2` (recuperación del diseño anterior). `d11643f` es el rediseño rechazado y no debe usarse como patrón visual. Base funcional de Cobranza: `53ef494`. Verificar siempre el check **Vercel – rerchar-piloto** del nuevo commit.

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
- El acceso administrativo publicado se completó con intervención de Roberto. Los dos paneles se revisaron visualmente después de publicar `acc08bc`; no se introdujeron facturas ni pagos de prueba en la aplicación publicada.
- Para las pruebas HTTP locales, iniciar el servidor y el cliente de comprobación dentro de la misma ejecución; así se resolvió el fallo de conexión observado al separarlos.

Comando de pruebas utilizado:

```bash
env -u DATABASE_URL -u NODE_ENV node --import tsx --test --test-concurrency=3 tests/*.test.ts
```

## Publicación y continuación

- Confirmar el commit resultante en `main` y el check **Vercel – rerchar-piloto** antes de afirmar que está publicado.
- Existe además un check de un proyecto duplicado **Vercel – rerchar-piloto-pjlu**, fallido en el commit anterior; distinguirlo del proyecto principal.
- La conexión Vercel de esta sesión devolvió 403 para el equipo del proyecto. El estado del despliegue se puede contrastar con los checks del commit en GitHub.
- Los paneles publicados ya se revisaron en escritorio y ancho móvil. La revisión visual de Cobranza con datos de prueba debe hacerse en el entorno aislado; su recorrido de servidor, formularios y CSV ya fue comprobado por HTTP. No poblar producción con registros de prueba.
- El corte anterior dejó SICEP propio de RERCHAR y SMTP real como parciales; no se resolvieron en esta entrega.
- Al continuar, leer este registro y el estado Git actual. Mantener un registro breve y actualizado para que la continuidad no dependa de la longitud del chat.
