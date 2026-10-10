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

### Ahorro de Neon: tareas internas en modo reposo

- **Autorizó**: el dueño («ejecuta otros que tienes prioridades… que esté funcionando siempre y
  operando sin ningún problema»).
- **Hallazgo**: Neon (plan Free, 100 CU-horas/proyecto/mes; al agotarse suspende la base hasta el
  mes siguiente) llevaba 20 558 CU-segundos en ~24 h (5,7 CU-h/día) porque las tareas internas
  consultaban la base cada minuto y nunca llegaba a los 5 min de inactividad para suspenderse.
  A ese ritmo el cupo se agotaba hacia el 24-oct.
- **Cambió**: `src/server/services/jobs.ts` (modo reposo y `isActivityRequest`),
  `src/server/index.ts` (la actividad de la API y del inicio de sesión reactiva el ritmo normal),
  `src/server/config/env.ts` y `.env.example` (`JOBS_IDLE_MINUTES`, 30 por defecto), pruebas en
  `tests/unit/scheduler.test.ts` y `tests/unit/env.test.ts`.
- **Evidencia local**: unitarias y API 177/177, integración 174/174, e2e 67 aprobadas, build y
  arranque local con tareas activas sin errores.
- **n8n · Vigilancia**: consulta `/api/health` cada 5 min y `/api/ready` solo en la pasada del
  minuto 0-4 de cada hora (hora Colombia); la confirmación a los 90 s sigue usando `/api/ready`.
  Ejecución manual 353 correcta. Publicada.

### Rutina: de auditoría a mantenimiento automático diario

- **Autorizó**: el dueño («quiero que elabores todas las tareas… por tu cuenta propia a diario y no
  quiero que dejes nada pendiente y te doy acceso a todos los permisos»).
- **Cambió**: la rutina `trig_01QLzzMWBdigg5oXyt51qgsD` pasa a llamarse «Mantenimiento automático
  diario», corre todos los días a las 7:52, 11:52, 15:52 y 19:52 (Bogotá) sin fecha de fin y ya
  puede corregir y publicar por su cuenta (con pruebas en verde y registro). Incluye la vigilancia
  del consumo de Neon.
- **Sigue prohibido sin autorización aparte**: activar pagos, rollback, reescribir historial,
  tocar secretos o credenciales, datos legales o del dueño, visibilidad del repositorio, borrar
  proyectos o datos, servicios de pago y desactivar la guardia.
- **Evidencia**: `update_trigger` → `enabled: true`, `updated_at` 17:58:29 UTC, próxima ronda
  20:52 UTC.

### Pedidos: llave incorrecta sin alarmas; dependencias y salud de la base

- **n8n · Pedidos**: una petición sin llave terminaba en error y disparaba el flujo Errores
  (incidente y correo al dueño por cada bot o sondeo). Ahora el webhook responde con nodos
  «Responder»: 401 sin error si la llave no coincide; 200 al recibir con llave correcta y sigue
  procesando (un fallo posterior queda en Errores). Quitado el filtro de bots, que podía descartar
  las peticiones de la tienda. Pruebas manuales 366 (401) y 367 (200 y procesamiento, con huella
  ficticia y sin escrituras); huella real restaurada y publicado. El Diagnóstico integral ya lo
  marca «OK: protegido con llave».
- **Dependencias**: `npm audit` 0 vulnerabilidades; parches nodemailer 10.0.16 y vite 8.3.3.
  Sin actualizar a propósito: TypeScript 7 y Playwright 1.63 (cambios mayores, requieren su propia
  migración). Lint sin avisos (`seed-dev.ts` usa `console.warn`).
- **Neon (solo lectura)**: base < 1 MB de 1 GB, pocas filas muertas, sin consultas lentas ni
  bloqueos que corregir.
- **Evidencia local**: unitarias y API 177/177, integración 174/174, e2e 67, build, formato y
  escáner 0.

### Neon seguía sin dormir: el escudo consultaba la base en las sondas de salud

- **Medición** (18:41-18:55 UTC, sin visitas): el compute de Neon seguía activo; nunca se había
  suspendido desde su creación (`started_at` 2026-10-06 17:01). `pg_stat_activity` mostró la
  conexión de la tienda consultando `blocklist` a las 18:55:37, un segundo después de la
  Vigilancia (cada 5 min, `/api/health`); el `last_active` anterior (18:50:36) coincidía igual.
- **Causa**: el gancho `onRequest` del escudo anti-abuso recargaba la lista de bloqueos (como mucho
  cada 30 s) en **toda** petición, incluso en las rutas exentas (`/api/health`, `/api/ready`,
  webhooks). Con una sonda cada 5 min, Neon nunca llegaba a 5 min sin consultas.
- **Corrección**: `src/server/plugins/shield.ts` — las rutas exentas salen antes de recargar.
  Prueba nueva en `tests/integration/security.test.ts` (falla sin la corrección, pasa con ella).
- **Evidencia local**: lint, typecheck, formato, unitarias 177/177, integración 175/175, e2e 67.

### Respaldos, n8n y endurecimiento de seguridad

- **Autorizó**: el dueño («soluciona las tareas del flujo n8n… que todo el trabajo no esté en
  peligro… seguridad, ciberseguridad y vulnerabilidad»).
- **n8n · Tareas**: se deja apagado a propósito y renombrado «Tareas (respaldo, apagado a
  propósito)». La tienda ya ejecuta sus tareas; publicarlo despertaría Neon cada 10 min (~90 de
  100 CU-h/mes) y exige una credencial con `CRON_SECRET`. Ningún flujo falla en producción: los 13
  errores desde el 06-oct son ejecuciones manuales de prueba.
- **n8n · Pedidos**: la versión guardada difiere de la publicada solo por un autoguardado de la
  interfaz (18:37, al abrir el flujo): normaliza valores por defecto; sin cambio funcional.
- **Respaldos**: snapshot de Neon `respaldo-2026-10-07` (`snap-bold-hat-b5t3zfog`, 19:07 UTC; el
  plan Free admite uno manual); copia de los 5 flujos de n8n en `infra/n8n/` (sin secretos: huella
  de la llave reemplazada, 0 coincidencias de hex64 y escáner 0) con instrucciones de
  restauración; punto de restauración del código: commit `41f93a5`. **NO VERIFICADO**: la etiqueta
  Git `respaldo-2026-10-07` no se pudo subir (el proxy de la sesión solo permite la rama de
  trabajo).
- **Seguridad**: exención del escudo por ruta exacta para `/api/health` y `/api/ready` (antes por
  prefijo: `/api/health-x` quedaba fuera del escudo); prueba nueva que falla sin el cambio.
  Escaneo de secretos de GitHub no disponible (el repositorio no tiene GitHub Advanced Security);
  cubren gitleaks en CI y el escáner propio. `npm audit`: 0 vulnerabilidades.
- **Riesgo residual anotado**: cualquiera puede despertar la base pidiendo `/api/*` (consumo de
  CU-horas); lo limitan el límite global por IP y el escudo. La rutina diaria vigila la proyección.

### 2026-10-10 · Marca «Tay», textos SEO, vigilancia de GitHub y medición de Neon

- **Autorizó**: el dueño (logo/personaje animado propio en lugar del texto grande; «no quiero este
  texto grande… un personaje… o un SEO que encaje con el ícono»; mantenimiento diario autorizado
  el 2026-10-07 dentro de sus límites).
- **Marca**: personaje «Tay» dibujado desde cero en SVG (sin arte de terceros, sin licencias
  externas). Portada, entrada, encabezado, pie, favicon, ícono de Apple e imagen social usan el
  mismo dibujo. Animaciones solo con `transform`/`opacity`/`stroke-dashoffset`; con movimiento
  reducido quedan en su último fotograma. Los lemas grandes se sustituyen por «Recargas de
  diamantes Free Fire por ID» (h1 de la entrada y `<title>`).
- **Integración**: la rama remota traía 2 commits del dueño (`84afd34`, `155e774`: readiness con
  5,5 s, tareas de GitHub opcionales, smoke de producción). Se integraron con avance rápido, sin
  reescribir historial; no tocan los mismos archivos.
- **Corregido · Vigilancia de GitHub**: fallaba en cada ejecución con `Protocol "https" not
  supported` porque usaba `--proto '=https:'`; abría el incidente #11 aunque la tienda respondía
  (logs de Render: `/api/ready` 200 a las 19:37 UTC). Reproducido en local y corregido a
  `--proto '=https'`. El issue se cierra solo cuando la vigilancia vuelva a ver la tienda.
  **NO VERIFICADO** hasta la primera ejecución tras el push.
- **Neon (tarea U3 cerrada)**: compute `idle`, suspendido a las 19:59 UTC (última actividad 19:53):
  el reposo funciona. `compute_time_seconds` 41 585 (21 801 el 07-oct 17:10): ~1,7 CU-h/día;
  proyección al 1-nov ≈ 48 CU-h de 100 (umbral de alerta: 80).
- **Evidencia local**: lint, typecheck, formato, unitarias 177/177, integración 176/176, e2e 64/64
  (incluye las animaciones de Tay), capturas visuales actualizadas y revisadas en 3 tamaños.
- **Sin cambios** en pagos (`PAYMENTS_ENABLED`/`CHECKOUT_ENABLED` siguen apagados), secretos,
  `LEGAL_*` ni datos del dueño.

### 2026-10-10 · Tienda siempre activa (sin pausas de Render)

- **Autorizó**: el dueño («quiero que ejecute activamente mi tienda, no quiero que se pause»).
- **Causa**: Render duerme el servicio gratuito tras 15 min sin visitas. El flujo «Vigilancia» de
  n8n lo visitaba cada 5 min, pero **n8n no ejecuta ningún flujo desde el 2026-10-08 20:20 UTC**
  (0 ejecuciones en todos los flujos, aunque figuran activos). Causa probable: límite del plan de
  n8n Cloud (prueba vencida o cupo de ejecuciones). **NO VERIFICADO**: solo se ve en la
  facturación de la cuenta de n8n del dueño.
- **Corregido**: `mantener-activa.yml` (GitHub Actions, cada 10 min, sin permisos, solo
  `/api/health`). `/api/health` no consulta la base de datos ni cuenta como actividad para el
  programador interno: Neon sigue suspendiéndose sin clientes. Render: un solo servicio en el
  espacio de trabajo, ~744 h/mes de 750 gratuitas.
- **Riesgo anotado**: los horarios de GitHub son aproximados; un retraso de más de 15 min deja
  dormir la tienda unos minutos. Añadir otro servicio gratuito al mismo espacio agotaría las horas.
