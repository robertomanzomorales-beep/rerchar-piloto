# Continuidad RERCHAR — 16 de noviembre de 2026

## Reanudación y revisión de la beta del 18 de noviembre

- Se recuperó `main` en `339513c` y se contrastó con el despliegue principal de Vercel, que figura `READY` para ese mismo commit. Las pruebas de Cobranza y venta de material que aparecen abiertas en las capturas de «Revisar Excel operativos» ya estaban cerradas y guardadas; no hay que repetir su implementación.
- El 16/11 se repitió la suite completa con base aislada: **41 pruebas aprobadas, 0 fallidas**. También pasaron TypeScript y la compilación de producción.
- Se aplicaron las **68 migraciones** actuales en una base local independiente y se completaron **135 comprobaciones HTTP**: accesos de administración para ambas empresas, fichas de servicio y cotización, carpeta del cliente, EDP/calendario, PDF, Excel y CSV; además, restricciones de operaciones, conductor, cliente y visitantes sin sesión. Los casos usan dos clientes ficticios y cinco cuentas locales; no se insertaron registros ni se enviaron correos en producción.
- Las comprobaciones de cliente/conductor no mostraron el cliente ajeno en paneles ni reportes. Las descargas ajenas devuelven 404, las descargas sin sesión 401 y las administrativas con perfil insuficiente 403. Las páginas con `notFound()` después de iniciar el streaming pueden conservar HTTP 200 e incluir el marcador 404 de Next; se comprobó el contenido de rechazo, no sólo el estado HTTP.
- Se corrigió el título accesible de cada punto del gráfico para entregarlo como un texto único a React. El recorrido posterior ya no registra la advertencia. El diseño, los colores verde/azul y los datos del panel se conservan.
- La configuración del proyecto principal no contiene variables `SMTP_*`: correo y acuse reales siguen pendientes. No se dispone de un SICEP vigente propio de RERCHAR. No marcar estas dos observaciones como cerradas.
- La matriz vigente conserva **84 observaciones: 75 disponibles para prueba, 2 parciales y 7 ampliaciones a evaluar**. No se modificaron sus estados por haber pasado las pruebas técnicas. Los responsables todavía deben probar sus casos reales.
- Ver `docs/REVISION_BETA_18-11-2026.md` para el recorrido y las dependencias de entrega. Este lote no agrega migraciones.
- Roberto autorizó expresamente el 16/11 publicar este lote de código y documentos de continuidad en el repositorio GitHub de RERCHAR y desplegarlo en Vercel. La autorización comprende la corrección del gráfico y ambos registros de revisión/continuidad. Comprobar el despliegue principal antes de dar la publicación por completada.

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
