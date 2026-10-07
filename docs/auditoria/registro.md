# Registro de auditoría y cambios autorizados

Qué se comprobó, qué cambió, quién lo autorizó y qué quedó sin verificar. Sin datos personales ni
valores de secretos (requisitos 16–18 de `docs/datos-del-propietario.md`). Fechas en UTC.

## 2026-10-07

### A1 — reglas de autorización explícita

- **Autorizó**: el dueño, aprobando el diff exacto (blobs `d566de4` y `c46426a`).
- **Cambió**: `CLAUDE.md` y `docs/datos-del-propietario.md` (requisitos 13–19).
- **Evidencia**: commit `d8a5b3b`; `git ls-remote` igual al commit local; Render
  `dep-db337m15efls73btpihg` en `live` (11:58–11:59); CI #71 (6 trabajos) y CodeQL #59 en `success`.

### F0 — rutina programada en solo lectura

- **Autorizó**: el dueño («ejecute los que tienes… no descontinues»): opción (b).
- **Cambió**: la instrucción de la rutina `trig_01QLzzMWBdigg5oXyt51qgsD`. Sigue activa con el mismo
  horario y la misma fecha de fin, pero solo audita e informa: sin commits, push ni cambios en
  Render, GitHub o n8n.
- **Evidencia**: `update_trigger` → `enabled: true`, `updated_at` 12:14:11.

### F1 — guardia, skills y escáner (preparado en local)

- **Cambió**: `.claude/settings.json`, `.claude/hooks/guardia-datos.sh`,
  `.claude/skills/{auditoria-segura,despliegue-seguro}`, `scripts/auditoria/{escanear,probar-guardia}.sh`,
  este registro, `docs/datos-del-propietario.md` y `.gitignore`.
- **Evidencia**: `probar-guardia.sh` → 27/27; escáner → 0 coincidencias; la guardia bloqueó en vivo
  un token ficticio.
- **NO VERIFICADO**: los gates «preguntar» como solicitud al dueño; la sesión está en modo `auto`
  y dos `git push --dry-run` de prueba pasaron sin pausa.

### F2 y mejoras técnicas sin publicidad

- **Autorizó**: el dueño («quiero que me ejecutes altamente como estabas elaborando el día
  anterior»; «no quiero anuncio o publicidad por ahora y no quiero acceder a pagar»).
- **Alcance**: publicar F1 y continuar con mejoras técnicas del sitio. Sin anuncios, sin servicios
  de pago y sin activar cobros. Siguen requiriendo autorización explícita aparte: pagos
  (`PAYMENTS_ENABLED`, `CHECKOUT_ENABLED`), variables de Render, rollback, historial de Git,
  visibilidad del repositorio y datos personales.

### F2 publicado

- **Evidencia**: commit `aa1d0f6` (10 archivos); `git ls-remote` igual al local.

### Vista previa al compartir, íconos, robots.txt y sitemap.xml

- **Dentro de la autorización anterior**: mejora técnica sin publicidad ni servicios de pago.
- **Evidencia**: e2e 66/66 (incluye las capturas visuales, sin cambios en la tienda), 160 pruebas
  unitarias y de API, 174 de integración, guardia 27/27, escáner 0.

### Render y n8n: análisis y corrección del acceso social

- **Render**: sin fallos vigentes (un solo despliegue fallido, el primero del 06-oct 16:54). Las
  líneas en rojo eran: 9 «validation error» de nivel info (formularios del panel) y 3 visitas a
  `?acceso=error&motivo=no_configurado` por un clic en Google/Facebook antes de cargar la
  configuración. Corregido (botones deshabilitados de inicio; prueba que falla sin la corrección).
- **n8n** (solo lectura): Vigilancia 166/166 ejecuciones exitosas hoy; Errores activo; Tareas y
  Pedidos sin publicar (Tareas es respaldo opcional: la tienda ya ejecuta sus tareas). Diagnóstico
  integral 13:02: 0 fallas, 4 pendientes (compras, Google OAuth, SMTP_PASS, flujo Pedidos).
  Ejecuciones manuales de 13:02–13:05 no las hizo esta sesión.

### Correcciones de auditorías anteriores

- El patrón de búsqueda del documento usado antes de las 12:15 exigía los 4 últimos dígitos
  juntos y **no detectaba el formato con puntos**. Se repitieron todos los escaneos con el patrón
  corregido (árbol, `dist/`, `node_modules`, ignorados, historial, objetos colgantes, `/tmp` y
  Render con `XXXX`, `X.XXX` y `X XXX`): 0 coincidencias, salvo dos falsos positivos de caché
  (marcas de tiempo de Vite, del 5 y 6 de octubre, anteriores al dato).
- Una caché temporal de `tsx` (`/tmp/tsx-0`) conservaba una copia del documento después de que se
  informó la copia temporal como borrada. Se eliminó durante la auditoría de verificación de esa
  mañana y se volvió a escanear: 0.
- Siguen conteniendo el documento, sin poder borrarlo desde aquí: el registro de la conversación en
  el contenedor y el historial de la conversación en Anthropic (NO VERIFICADO su borrado).

### Implementación completa: lo que no depende de credenciales

- **Autorizó**: el dueño («quiero que ejecutes la implementación completa… configura todo lo que
  puedas»), sin activar cobros ni servicios de pago.
- **Render**: textos legales `LEGAL_DELIVERY_TIME`, `LEGAL_REFUND_TIME`, `LEGAL_RESPONSE_TIME`,
  `LEGAL_TAX_NOTE` y `LEGAL_RETENTION` según las respuestas del dueño. Despliegue
  `dep-db34j2jbc2fs73cjf290` en `live` 13:31, arranque sin errores de configuración.
  `LEGAL_TAX_NOTE` es un texto neutro que el dueño debe confirmar.
- **n8n · Vigilancia** (`wOqFUIwk4GEINrVc`): si `/api/ready` no responde bien, espera 90 s y
  vuelve a consultar antes de avisar (evita falsas alarmas por arranques lentos de Render).
  Publicado (versión `298d4c9b`); ejecución manual 318 correcta. El nodo de Gmail sigue
  desactivado: falta la credencial del dueño.
- **Documentación**: `docs/puesta-en-marcha.md` (dónde va cada credencial, en orden); corregidas
  la fila de `LEGAL_ID` (solo 4 dígitos) y la descripción de la Vigilancia.
- **Evidencia**: unitarias y API 160/160, integración 174/174, e2e 67 aprobadas (128 omitidas por
  proyecto), guardia 27/27, escáner 0, typecheck y build correctos.
- **NO VERIFICADO**: la tienda desde fuera (el proxy de esta sesión bloquea `onrender.com`), la
  base de datos en Neon (conector sin autorizar) y Mercado Pago (sin conector).

### Eventos de pedidos hacia n8n conectados

- **Autorizó**: el dueño («entonces hazlo por tu cuenta»; «sigue con Render», aprobando las
  solicitudes de permiso para leer la llave y escribirla en Render).
- **n8n · Pedidos** (`Nw7V66LLMhU18Hvb`): el webhook ya no usa credencial Header Auth; el nodo
  **¿Llave correcta?** compara la huella SHA-256 de `Authorization` con la guardada (la llave en
  claro no está en n8n). Llave incorrecta → error. Gmail desactivado hasta conectar su
  credencial. Pruebas manuales 331 (llave ficticia correcta: pasa, sin escrituras) y 332 (llave
  incorrecta: rechazada). Publicado (versión `c353ab30`).
- **Render**: `EVENTS_WEBHOOK_URL` y `EVENTS_WEBHOOK_SECRET` (llave aleatoria de 256 bits creada
  en la sesión, comprobada contra la huella antes de guardarla y borrada después con `shred`).
  Despliegue `dep-db3719ajnfac738tqkmg` en `live` 16:18, arranque sin errores de configuración.
- **Exposición**: la llave pasó una vez por los comandos de esta sesión (registro de la
  conversación). Las ejecuciones de producción de n8n guardan los encabezados de la petición,
  como con la credencial anterior. Si se sospecha filtración, se cambia en Render y su huella en
  n8n.
- **NO VERIFICADO**: un evento real de la tienda llegando a n8n (llegará con el próximo pedido; el
  proxy de esta sesión bloquea `onrender.com` y `n8n.cloud`).

### Avisos por correo en n8n

- **Autorizó**: el dueño («comprueba si ya está hecho»; confirmó que la credencial de Gmail es de
  la cuenta de la tienda, no una personal).
- **Cambió**: credencial «Gmail account» (Gmail OAuth2, creada por el dueño) conectada y nodo de
  correo activado en Pedidos, Vigilancia y Errores; los tres publicados.
- **Evidencia**: flujo temporal de prueba (ejecución 341) envió un correo a la bandeja de la
  tienda; Gmail lo devolvió con etiquetas `SENT` e `INBOX` (misma cuenta). Flujo temporal
  archivado. Sin ejecuciones con error desde las 16:00.
- **Pendiente del dueño**: la credencial «Header Auth account» creada por el dueño no la usa
  ningún flujo; puede borrarse.
