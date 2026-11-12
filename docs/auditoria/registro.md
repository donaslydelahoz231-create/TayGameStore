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

### 2026-10-10 · Servidor (región) de Free Fire asignado a cada pedido

- **Autorizó**: el dueño («el ID … del jugador en el juego correspondiente de Free Fire sin
  importar la región … asigna un servidor»).
- **Hecho**: el cliente declara el servidor de su cuenta al escribir el ID; el servidor lo valida
  (lista cerrada en `FREE_FIRE_SERVERS` y `CHECK` en la base de datos), lo guarda y lo muestra al
  dueño en el panel, el aviso de pago y el comprobante. Migración 0013 aditiva (columna nula): no
  toca pedidos existentes.
- **Límite honesto**: el nickname y la región **no se consultan automáticamente**. No existe API
  pública oficial de Garena para eso y el dueño descartó el scraping y las APIs no oficiales
  (`verifier.ts`). Solo un proveedor autorizado podría añadirlo (`PLAYER_VERIFICATION`).
- **Evidencia local**: lint, typecheck, formato, unitarias 180/180, integración 179/179 (servidor
  guardado y devuelto, valor inválido → 400, misma clave con otro servidor → 409), e2e 64/64,
  capturas visuales actualizadas y revisadas.
- **Sin cambios** en pagos (`PAYMENTS_ENABLED`/`CHECKOUT_ENABLED`), secretos, `LEGAL_*` ni datos
  del dueño.

### 2026-10-10 · Paso visible «Elige cómo pagar» y estado real de los pagos

- **Pidió**: el dueño («cuando creo mi pedido no me pide el método para pagar … como las demás
  tiendas»).
- **Hecho**: selector visible de medio de pago (tarjeta, PSE, Efecty, saldo de Mercado Pago). Solo
  cambia la interfaz: Mercado Pago sigue siendo la única autoridad de pago.
- **Estado de producción comprobado**: 0 pedidos y 0 pagos en la base de datos (consulta de solo
  lectura en Neon). Las compras siguen apagadas: `PAYMENTS_ENABLED`/`CHECKOUT_ENABLED` **no se
  tocaron**. Para encenderlas faltan datos que solo el dueño puede cargar en Render (llaves de
  Mercado Pago y `LEGAL_*`); encenderlas sin ellos haría que el servidor no arranque.
  **NO VERIFICADO** qué variables ya están cargadas: la herramienta de Render no muestra nombres
  ni valores de variables y no se leen secretos.
- **Evidencia local**: lint, typecheck, formato, unitarias 180/180, e2e 64/64 (incluye elegir
  PSE y verlo en la factura y en la confirmación), capturas visuales actualizadas y revisadas.

### 2026-10-11 · Pulido inspirado en la recarga oficial y en LootBar

- **Pidió**: el dueño (inspirarse en la recarga oficial de Free Fire y en LootBar sin copiarlas).
- **Fuentes**: las páginas de Garena y LootBar no se pudieron abrir desde el entorno (DNS
  bloqueado). Solo se usó lo confirmado en búsquedas: compra por ID sin contraseña y el ID en el
  perfil del jugador (avatar, arriba a la izquierda). **NO VERIFICADO** directamente en esas páginas.
- **Catálogo real de producción** (solo lectura): 6 paquetes activos, stock de PIN en 0 (entrega
  manual por ID).
- **Hecho**: ayuda «¿Dónde encuentro mi ID?», valor por cada 100 diamantes en cada paquete,
  texto inicial honesto del ID. Evidencia local: lint, formato, unitarias 180/180, e2e 64/64 y
  capturas visuales revisadas.

### 2026-10-11 · Tabla de tarifas a partir de las piezas del dueño

- **Pidió**: el dueño (tomar como referencia sus dos piezas de «ID RECARGA» con precio normal y
  promo, y hacerlo propio de TayGameStore).
- **Comprobado**: los 6 precios normales y los 6 promo de las piezas coinciden con la base de
  datos de producción.
- **Detalles que NO se trasladaron a la tienda** (por veracidad): en la pieza de promoción los
  «ANTES» ($4.200…$182.400) y «AHORRAS HASTA» ($400…$44.400) no coinciden con el precio normal real
  ($4.000…$150.000); el ahorro real es $200…$12.000. Tampoco se publican «entrega 3–5 minutos»,
  «inmediata», «24/7», «100 % seguro» ni «sin comisiones» sin que el dueño confirme que los
  cumple, ni el logo o personajes de Free Fire (marca de Garena), ni el nombre «ID RECARGA».
- **Evidencia local**: lint, typecheck, formato, unitarias 180/180, integración 179/179, e2e 64/64
  (tabla con ahorro real) y capturas revisadas en 360 px.

### 2026-10-11 · Canales de soporte (WhatsApp y correo) activados

- **Autorizó**: el dueño, por escrito («Disponible sí, habilitado sí, funcional sí»), con su
  número y su correo de soporte. El correo se confirmó con él (el mismo asignado antes a la tienda).
- **Hecho**: `SUPPORT_WHATSAPP` y `SUPPORT_EMAIL` cargados en Render (despliegue
  `dep-db5dl6ad0e5s73f39n80`, en vivo). Los valores no se escriben en el repositorio.
- **Verificación**: la burbuja en la tienda publicada queda **NO VERIFICADA** desde la sesión (el
  proxy bloquea el dominio); la prueba de producción de GitHub lo comprobará en cada despliegue.
- **Aviso de seguridad**: en un mensaje anterior del chat se compartieron contraseñas de las
  cuentas de Gmail. Se recomienda al dueño cambiarlas y activar la verificación en dos pasos.

### 2026-10-11 · Burbuja flotante de WhatsApp visible desde la bienvenida

- **Pidió**: el dueño («el botón flotante estilo burbuja de WhatsApp a la derecha»).
- **Causa**: la burbuja estaba dentro de `#app`, que queda oculto bajo la pantalla de bienvenida;
  además, en teléfonos los avisos (toasts) la tapaban.
- **Hecho**: burbuja fuera de `#app` (encima de la bienvenida, debajo de los modales de la
  tienda), WhatsApp de 60 px, avisos a su izquierda en móvil. Evidencia: medición en Chromium
  (360, 768 y 1280 px), lint, unitarias 183/183, e2e 64/64 y capturas revisadas.
- **Corrección del dueño (mismo día)**: la burbuja va solo dentro de la tienda, no en la pantalla
  de bienvenida. Se oculta mientras la bienvenida está abierta (`body.entry-locked`); la prueba
  e2e lo comprueba.

### 2026-10-11 · «Falta la burbuja de WhatsApp» (artefacto de prueba)

- **Causa**: el dueño veía la burbuja de correo pero no la de WhatsApp. La tienda de prueba
  publicada como artefacto (versión del 2026-10-05) tenía en su configuración simulada
  `whatsapp: null`. La tienda real publica ambos canales (prueba de producción: «WhatsApp:
  publicado · Correo: publicado»).
- **Corregido**: la vista previa recibe los canales por variables de entorno al construir (no se
  escriben en el repositorio) y el artefacto se republicó con la versión actual (versión 2).
  Verificado con Chromium: bienvenida sin burbuja; en la tienda, WhatsApp a la derecha con enlace
  wa.me y correo debajo.
- **Vigilancia nueva**: la prueba de producción abre la tienda real con un navegador y comprueba
  lo mismo en 360 y 1280 px, sin imprimir el número ni el correo.

### 2026-10-11 · Ronda diaria: consumo de Neon disparado (corregido)

- **Detectado**: `compute_time_seconds` pasó de 42 948 (00:52 UTC) a 52 793 (12:49 UTC): +9 845 s
  en ~12 h (~5,5 CU-h/día, antes ~1,8). Tiempo activo ~87 %. Proyección al 1-nov ≈ 125 CU-h
  (límite 100, umbral de alerta 80).
- **Causa raíz**: desde que `mantener-activa.yml` mantiene Render despierto, el programador interno
  corre siempre. En reposo cada una de las 6 tareas corría cada 30 min pero con su propio desfase:
  hasta 6 despertares de la base cada media hora, y Neon tarda ~5 min en suspenderse. A eso se
  sumaba `/api/ready` de la vigilancia cada 30 min.
- **Corregido**: en reposo las tareas corren juntas en una tanda por intervalo (la limpieza, en
  tandas alternas); prueba unitaria nueva (con el código anterior: 10 despertares en 2 h; ahora
  ≤ 4). La vigilancia usa `/api/ready` una vez por hora y `/api/health` (sin base) en la otra media
  hora. Evidencia local: lint, typecheck, formato, unitarias 184/184, integración 179/179, e2e 64/64.
- **NO VERIFICADO** todavía el efecto en Neon: se medirá en la próxima ronda (esperado ≈ 1 CU-h/día).
- **Resto de la ronda**: CI, CodeQL, prueba de producción (con navegador real) en verde; Render en
  vivo con 94909442, sin logs de error/warn/fatal desde la ronda anterior; n8n sin ejecuciones
  (bloqueado por su plan desde el 08-oct, pendiente del dueño).

### 2026-10-11 · Migración de la automatización fuera de n8n

- **Pidió**: el dueño («que te migres a otra automatización que no sea n8n y sea gratuita sin
  límites»).
- **Inventario**: Vigilancia, Tareas y «mantener despierta» ya vivían fuera de n8n; Pedidos
  (registro + Gmail), Errores, Diagnóstico y Cerebro dependían de n8n, que no ejecuta desde el
  2026-10-08.
- **Hecho**: `diagnostico.yml` (diario, GitHub Actions: `golive:check --url` + navegador real),
  `docs/automatizacion.md` (qué reemplaza a cada flujo), `docs/n8n.md` marcado como histórico,
  README y skill de auditoría actualizados, y la rutina diaria de Claude ya no revisa n8n.
- **No tocado**: n8n (sin borrar ni despublicar flujos; respaldo en `infra/n8n/`); variables
  `EVENTS_WEBHOOK_*` de Render (si existen, las borra el dueño).
- **Límite honesto**: GitHub Actions es gratis y sin límite de minutos en repositorios públicos,
  pero los horarios pueden retrasarse y se pausan tras 60 días sin actividad en el repositorio.
  Los avisos al celular de pedidos pagados necesitan Telegram (gratis), que configura el dueño.

### 2026-10-11 · Cobro automático al crear el pedido (un solo paso)

- **Pidió**: el dueño («que sea automático y que cobre al usuario al crear el pedido», «no
  menciones sandbox»).
- **Hecho**: «Pagar $X» crea el pedido y, si queda listo para pagar, pide la preferencia y
  redirige a Mercado Pago en el mismo clic; se eliminó la ventana «Confirmar y pagar». Ningún
  texto visible dice «sandbox». La tienda de prueba (artefacto) se republicó (versión 3).
- **Sin cambios**: el servidor sigue siendo la única autoridad de pago; `PAYMENTS_ENABLED` y
  `CHECKOUT_ENABLED` siguen apagados en producción hasta que el dueño cargue sus llaves.
- **Evidencia local**: lint, typecheck, formato, unitarias 184/184, e2e 64/64 (incluye pedido →
  cobro en un clic con y sin consulta de nickname), capturas visuales actualizadas.

### 2026-10-11 · ¿Quién verifica el ID? Textos honestos y arranque en reposo

- **Pregunta del dueño**: quién verifica el ID y si conviene verificarlo automáticamente «con
  herramientas de otra página como LootBar».
- **Respuesta (hechos)**: en producción `PLAYER_VERIFICATION=customer`: nadie del «equipo»
  verifica; el cliente escribe su ID dos veces y lo confirma. El modo `operator` (el dueño verifica
  desde el panel) existe pero no está activo. La consulta automática de nickname queda lista en el
  código (`PlayerVerifier`) para un proveedor autorizado; usar la página de LootBar u otra web
  sería scraping (contra sus condiciones y la decisión del dueño). Búsqueda de proveedores B2B con
  validación de ID: sin resultados verificables (**NO VERIFICADO** que exista uno público).
- **Corregido**: textos que prometían verificación del equipo; tareas internas que corrían cada
  minuto 30 min tras cada despliegue (ahora arrancan en reposo; prueba unitaria).
- **Neon**: entre 12:49 y 16:26 UTC subió ~844 s/h, pero con 3 despliegues, pruebas con navegador
  y consultas manuales en ese intervalo: medición no representativa, **NO VERIFICADO** el ahorro.
- **Evidencia local**: lint, typecheck, formato, unitarias 185/185, integración 179/179, e2e 64/64.

### 2026-10-11 · Tienda sin estilos en el teléfono y métodos de acceso

- **Pidió**: el dueño (captura de la tienda publicada sin diseño en un teléfono, «otra persona
  le carga así»; logins disponibles con cada método).
- **Investigado**: registros de Render del 4 al 11 de octubre: ningún error en `/assets/` (los
  únicos 404 son `favicon.ico` de builds viejos y `/admin.html`, a propósito). El CSS se sirve con
  `text/css`, `nosniff`, `vary: accept-encoding` y caché inmutable; el HTML con `no-cache`. La
  prueba diaria con navegador real (360 y 1280 px) vio el diseño aplicado. Conclusión: la hoja se
  corta en la red o el navegador del visitante; la causa exacta en ese teléfono **NO VERIFICADO**.
- **Hecho**: guardia de estilos (reintento único de la hoja + aviso con marca y «Recargar»);
  pruebas e2e del corte; la prueba de producción falla si el diseño no carga y lista los accesos;
  `golive:check --url` avisa qué acceso no tiene credenciales.
- **Acceso de clientes**: invitado siempre; Google y Facebook solo con sus credenciales en
  Render (variables protegidas, nunca en el chat). Discord sigue retirado a pedido del dueño.
- **Evidencia local**: lint, typecheck, formato, unitarias 186/186, e2e 66/66.

### 2026-10-11 · Acceso con Google: credenciales cargadas y limpieza de espacios

- **Hecho por el dueño**: creó el cliente OAuth y cargó `GOOGLE_CLIENT_ID` y
  `GOOGLE_CLIENT_SECRET` en Render (sin pasarlos por el chat). Despliegue manual en vivo sin
  errores; la prueba con navegador real informa «google: activo».
- **Fallo al probar**: Google respondió «The OAuth client was not found» (401 invalid_client):
  el ID de cliente que llega a Google no coincide con ningún cliente. Causa más probable: espacio o
  salto de línea pegado desde el celular (el servidor no lo recortaba). **NO VERIFICADO** cuál fue.
- **Corregido**: el servidor quita espacios y saltos de línea (también en medio) de las dos variables de Google
  (prueba unitaria). Si persiste, el dueño revisa en Render que el ID termine en
  `.apps.googleusercontent.com` y que no esté intercambiado con el secreto.
- **Evidencia local**: lint, typecheck, formato, unitarias 187/187.

- **Evidencia en producción (18:39 UTC)**: la prueba con navegador real ya revisa el inicio del
  login: «va a Google: sí · ID de cliente con formato válido: NO · regreso: sí». El recorte de los
  extremos no bastó; ahora se quitan también espacios o saltos internos y la prueba da pistas del
  formato del ID sin mostrarlo.
- **19:12–19:18 UTC**: con el ID ya válido y la dirección de regreso corregida en Google Cloud
  (le faltaba `/auth/google/callback`), Google acepta el inicio del login pero responde 401 al
  canjear el código: el secreto cargado en Render no coincide con un secreto activo. Para
  diagnosticar sin ver valores, el servidor registra ahora el código de error de Google
  (`invalid_client`, `invalid_grant`…) y, al arrancar, la forma de las credenciales (ID válido,
  prefijo del secreto y su largo), nunca los valores. Unitarias 189/189; integración de acceso 61/61.
- **Resuelto (19:29 UTC)**: faltaba el guion de `GOCSPX-` en el secreto pegado (34 caracteres);
  el dueño lo corrigió. Registros: «idValido: true · secretoGocspx: true · largoSecreto: 35» y
  cuatro ingresos por `/auth/google/callback` (19:31–19:37) sin «google login failed». Neon:
  3 cuentas con Google creadas hoy (solo conteos, sin datos personales). El historial de compras
  queda en la base de la tienda asociado a la cuenta (`orders.user_id`), no en Google.
- **Pendiente del dueño**: rotar el secreto de Google (se vio parcialmente en una captura);
  credenciales de producción de Mercado Pago y `MP_WEBHOOK_SECRET` (no existe en Render) para
  activar ventas; Facebook opcional.
- **Neon**: 59 272 s de cómputo (≈16,5 CU-h) en 5,1 días, proyección ≈81 CU-h al 1 de noviembre,
  inflada por un día de despliegues y pruebas; **NO VERIFICADO** el consumo en reposo.

### 2026-10-11 · Ventas reales activadas (autorizado por el dueño)

- **Autorización**: el dueño pidió «habilitar las ventas y disponibilidad de todo» y confirmó
  «llaves de Mercado Pago cargadas» (cargó en Render el Access Token de producción y
  `MP_WEBHOOK_SECRET`, sin pasarlos por el chat).
- **Hecho**: en Render `MP_MODE=production`, `PAYMENTS_ENABLED=true`, `CHECKOUT_ENABLED=true`
  (solo esas tres; ningún secreto leído ni escrito). Despliegue `dep-db5um37lot8c7388endg` en
  vivo a las 20:02 UTC sin errores: la validación de arranque exige token, clave del webhook,
  `PUBLIC_BASE_URL` y modo, y pasó.
- **NO VERIFICADO desde aquí**: que el token sea de producción y no de prueba (las dos empiezan
  igual); se confirma con la primera compra real pequeña y el webhook de Mercado Pago.
- **Evidencia (20:03 UTC, «Diagnóstico diario»)**: `golive:check --url` → «Ventas abiertas y pagos
  activos», «Mercado Pago en producción: cobros reales», catálogo con 6 paquetes, panel oculto:
  **LISTO para vender**. Navegador real: diseño, burbujas y login con Google OK.

### 2026-10-11 · Medio de pago directo y estado de la entrega de diamantes

- **Pidió**: el dueño (pagar con tarjeta de Nequi, Davivienda, Daviplata, Bancolombia… «solo con
  número y código de seguridad», como Pagostore o LootBar; confirmar que cada paquete llegue a la
  cuenta del jugador).
- **Hecho**: el medio elegido viaja en `POST /api/orders/:ref/pay` y la preferencia oculta los
  demás tipos (tarjeta → sin efectivo ni PSE; PSE → solo débito bancario; Efecty → solo
  efectivo; saldo → sin restricción). Respaldo: si Mercado Pago rechaza la restricción, se crea
  la preferencia con todos los medios (otra clave de idempotencia); un error incierto no se
  repite. Pruebas: unitarias 194/194, integración 180/180, e2e 66/66.
- **Hechos sobre la entrega (Neon, solo conteos)**: 6 paquetes activos; **0 PIN** en inventario;
  `PIN_AUTO_DELIVERY` apagado. La tienda no tiene API de Garena ni de un proveedor: cada pedido
  pagado lo entrega el dueño desde el panel (recarga por ID en un canal oficial o PIN). Que los
  diamantes lleguen a la cuenta del jugador **NO VERIFICADO**: solo se comprueba con una compra
  real y su entrega.
- **NO VERIFICADO**: que Daviplata aparezca en la lista de PSE de Mercado Pago (la lista la
  muestra Mercado Pago, no la tienda).

### 2026-10-11 · Entrega automática de PIN activada (pedido del dueño)

- **Pidió**: «todo automatizado, sin manual».
- **Hecho**: `PIN_AUTO_DELIVERY=true` en Render (despliegue `dep-db5v5c942hec73aapps0`). Con PIN en
  **Panel → Inventario**, cada pago aprobado entrega solo el PIN al pedido y al correo del cliente,
  que lo canjea en pagostore.com a su ID. Hoy hay **0 PIN**: los pedidos pagados siguen esperando
  entrega en el panel hasta que el dueño cargue PIN.
- **Límite real**: sin contrato con un proveedor con API (o Garena) nadie puede acreditar diamantes
  directo al ID de forma automática; ver `docs/procedimiento-diamantes.md`.
- **Venta solo con stock** (mismo día, pedido del dueño: «todo automatizado, sin manual»): nuevo
  `SELL_ONLY_WITH_STOCK`. El catálogo publica `soldOut`; el checkout bloquea las filas de producto
  y rechaza con «agotado» si los PIN libres (disponibles menos unidades de pedidos sin pagar y sin
  vencer) no alcanzan. Pruebas: unitarias 194/194, integración 182/182 (nueva `stock-only`), e2e
  66/66. Con 0 PIN cargados la tienda muestra todo «Agotado» hasta que el dueño cargue PIN.

### 2026-10-11 · Recarga directa al ID con UniPin (código listo, apagada)

- **Pidió**: el dueño («ejecuta todo… prueba con UniPin»): proveedor oficial, automático, sin PIN.
- **Hecho**:
  - conector UniPin «In Game Top Up» (`TOPUP_PROVIDER=unipin`);
  - tabla `topups` (migración `0014_topups.sql`) y tarea programada `topups`;
  - aviso «Recarga por revisar» al dueño;
  - recargas visibles en el panel;
  - cobertura por servidor en el catálogo y el checkout;
  - `npm run unipin:check` y el flujo «Comprobar UniPin»;
  - guía `docs/recarga-directa-unipin.md`.
- **Fuentes**: hosts, rutas y firma (HMAC-SHA256 de partnerid + timestamp + path) leídos del SDK
  oficial `github.com/UniPinSDK/php`. Los campos `validation_token`, `reference_no`,
  `denomination_id` y `transaction_number` y los errores 708, 726 y 727 vienen de la
  documentación pública de UniPin (Postman «In Game Top Up V.2»), leída por resúmenes de
  búsqueda: el proxy de esta sesión bloquea unipin.com y postman.com.
- **Pruebas**:
  - unitarias 223/223: firma con vector calculado aparte en Python, clasificación, cliente HTTP,
    configuración, `unipin:check`, golive;
  - integración 195/195 (nueva `topup`, 13 casos);
  - e2e 66/66.
- **NO VERIFICADO** (falta una cuenta de socio):
  - que UniPin acepte a una persona natural de Colombia;
  - qué servidores de Free Fire cubre y a qué costo;
  - el nombre `fields` del cuerpo de validación y el campo `userid`;
  - la forma exacta de las respuestas correctas.

  `unipin:check` en staging los confirma antes de activar.
- **Producción**: el despliegue aplica la migración. La recarga sigue **apagada**
  (`TOPUP_PROVIDER` sin definir = `none`), así que la tienda se comporta igual que antes.
- **Evidencia**:
  - Render `dep-db61453bc2fs739830ng` en `live` (commit `1f6d2f2`);
  - Neon: 15 migraciones, tabla `topups` creada y vacía;
  - CI verde. WebKit falló una vez en `motion.spec.ts` («element is not stable» en el botón de
    invitado, código no tocado) y pasó al relanzarlo una sola vez.
  - En local, la prueba del panel «el operador verifica… y entrega» falló en 2 de 11 corridas
    completas y nunca aislada (30/30). Causa NO VERIFICADA.

### 2026-10-11 · Protección contra borrado, alteración de precios y comprobantes falsos

- **Pidió**: el dueño («que no me borren ni alteren la tienda… un código que yo pueda verificar y
  un conteo que no se pueda falsificar»).
- **Hecho** (migración `0015_integridad.sql`):
  - triggers que impiden DELETE/TRUNCATE en las tablas de dinero, catálogo e historial;
  - montos, referencia y comprobante de un pedido inmutables, y sus líneas también;
  - auditoría por trigger de todo cambio de precio, incluso por SQL directo (actor `database`);
  - comprobante N.º consecutivo, asignado bajo un lock de PostgreSQL, y código de verificación
    HMAC (`V1-XXXX-XXXX-XXXX-XXXX`) en el correo y la factura;
  - verificador de comprobantes en Panel → Integridad;
  - sellos de integridad del historial (`audit_seals`, cadena SHA-256, tarea `sealAudit` cada
    10 min) con verificación completa;
  - huella del catálogo;
  - `CATALOG_LOCKED`;
  - testigo diario fuera de la base (`/api/internal/integrity` con `CRON_SECRET` → resumen de
    «Diagnóstico diario»);
  - guía `docs/seguridad-tienda.md`.
- **Pruebas**:
  - unitarias: código de verificación (cambia con cada dato, sin la llave no se fabrica, rotación
    de llave, escritura a mano), huella del catálogo, cadena;
  - integración `security-integrity` (9 casos): comprobantes consecutivos y verificación;
    falsos, de otro pedido y sin pago rechazados; DELETE/TRUNCATE/UPDATE de montos rechazados;
    precio por SQL auditado; catálogo bloqueado (423 + alerta); sellado; el testigo; y un
    atacante con acceso total que desactiva el trigger, cambia o borra un evento sellado →
    «ALTERADO» y testigo en 500.
- **Límite**: la cuenta dueña de la base (Neon) puede quitar triggers; eso lo detectan el testigo
  externo y los respaldos. Verificación en dos pasos en Google, GitHub, Render, Neon y Mercado
  Pago: pendiente del dueño (NO VERIFICADO).
- **Evidencia en producción**:
  - Render `dep-db61r7v40ujc73cvune0` en `live` (commit `b5ace7d`);
  - Neon: 16 migraciones, 10 triggers anti-borrado, protección de montos y auditoría de precios
    activas, primer sello del historial creado al arrancar;
  - CI verde (lint, unitarias, integración, e2e Chromium/Firefox/WebKit, gitleaks, CodeQL);
  - «Diagnóstico diario» manual: **LISTO para vender**. Huella del catálogo pública
    `88F3-60CD-E1EB-1ED2`, idéntica a la calculada desde la base.
- **Bloqueo del catálogo activado** a pedido del dueño («no permitas que me alteren la tienda»):
  `CATALOG_LOCKED=true` en Render (despliegue `dep-db61sotckfvc73br57r0`, `live`).
- **NO VERIFICADO**: el testigo externo del historial. Falta el secreto `CRON_SECRET` en GitHub
  (y en Render). Lo crea el dueño con el mismo valor aleatorio en ambos (pasos en
  `docs/seguridad-tienda.md`); nunca se pega en un chat.

### 2026-10-12 · Ganancia garantizada y estrategia de promociones

- **Pidió**: el dueño. Mantener sus precios, que no choquen y den ganancia, y no usar
  Pagostore como proveedor (sí UniPin): «inclúyalo» (la tabla de costos máximos) y una estrategia
  de promoción.
- **Hecho**:
  - `costCop` por paquete en `UNIPIN_CATALOG`;
  - `PAYMENT_FEE_PCT` (4) y `MIN_MARGIN_PCT` (5);
  - piso = costo × 1,05 ÷ 0,96, redondeado a $100;
  - promo con piso en catálogo y checkout;
  - nada se vende ni se envía a UniPin por debajo del piso;
  - Panel → Catálogo → Rentabilidad (`GET /api/admin/margins`, solo lectura);
  - aviso en golive si falta el costo de algún paquete;
  - huella del catálogo calculada desde el listado público, para que panel y diagnóstico
    coincidan;
  - guía `docs/estrategia-promociones.md`.
- **Precios**: sin cambios (6 paquetes y promos de fin de semana como estaban). En producción no
  hay proveedor activo, así que el piso no cambia nada todavía.
- **Pruebas**:
  - unitarias 238/238 (cálculo del piso, costo máximo, ganancia, promo con piso, configuración);
  - integración 208/208 (nueva `margin`: promo subida al piso, paquete sin ganancia agotado y
    rechazado, cobro con piso, tabla del panel, acceso solo del dueño);
  - e2e 66/66.
- **NO VERIFICADO**: la comisión real de Mercado Pago (se usa 4 %) y el costo de socio de UniPin.

### 2026-10-12 · Revisión de fallos pendientes y vulnerabilidades

- **Pidió**: el dueño («soluciona todos los fallos pendientes y vulnerabilidades»).
- **Vulnerabilidades**:
  - `npm audit`: 0 (producción y desarrollo);
  - gitleaks en todo el historial: verde en cada commit;
  - escáner local de datos: 0 coincidencias;
  - CodeQL termina en verde, pero NO VERIFICADO que haya 0 alertas abiertas (esta sesión no
    puede listarlas).
- **Parches disponibles sin instalar** (decisión de seguridad): 10 paquetes con versiones de
  1 a 4 días (`@fastify/*`, `drizzle-orm`, `nodemailer`, `prettier`, `smtp-server`, `vite`,
  `zod`). Ninguno corrige una vulnerabilidad. Se espera a Dependabot (lunes, con CI) para no
  instalar versiones recién publicadas.
- **Prueba intermitente de WebKit** (`motion.spec`, «element is not stable» en «Continuar como
  invitado»): `enterAsGuest` espera a que terminen las animaciones del diálogo de acceso antes de
  pulsar y, si una no terminara, falla con un mensaje claro. No se pudo reproducir aquí (WebKit
  no está instalado y el proxy bloquea el artefacto del CI). En Chromium la entrada del diálogo
  dura 0,8 s y termina.
- **Prueba intermitente del panel** («el operador verifica… y entrega»): 6 corridas completas
  seguidas en verde (66/66 cada una), sin reintentos configurados. Causa NO VERIFICADA (no se
  reprodujo).

### 2026-10-12 — Revisión final: causa de la prueba intermitente del panel

- **Producción** (solo lectura): deploy `cc8f0ef` en vivo en Render; CI, CodeQL y prueba de
  producción en verde; en Neon, 2 sellos que cubren los 24 eventos de auditoría (24 de 24).
  «Tareas programadas» sale «skipped» a propósito (respaldo opcional, apagado sin
  `ENABLE_SCHEDULED_TASKS`).
- **Causa encontrada** de la prueba intermitente del panel: el límite de pedidos por IP (10 cada
  10 minutos). Todas las pruebas compartían la IP 127.0.0.1 y la suite gastaba 9 de los 10; las de
  manipulación compartían 203.0.113.7 y gastaban 10 de 10. Un solo intento de más daba 429.
  - Reproducido: repitiendo la prueba con la CPU saturada, fallaron 2 de 12 con 429.
  - Corrección (solo pruebas): cada prueba entra con su propia IP de cliente (`preparePage`,
    `workerIndex` + contador). El PIN de la prueba es único por corrida, así que se puede repetir.
  - Resultado con la CPU saturada: 20 de 20. Suite completa: 66/66.
  - El límite real de la tienda no cambió.
- **Capturas visuales desactualizadas**: `03-tienda-pagina-completa` (3 tamaños) no se había
  regenerado tras `ba2b4b7` (textos de los medios de pago). Se regeneraron; solo cambian esas tres.
  La CI no ejecuta las capturas visuales.


### 2026-10-12 · Ronda diaria (01:40 UTC)

- **Verificado**: Render en vivo con `8aeca5b`; prueba de producción y CodeQL en verde; flujos
  programados («Mantener la tienda activa», «Vigilancia y autorreparación») en verde; «Tareas
  programadas» omitido a propósito (respaldo opcional apagado); 0 issues abiertos con
  «incidente».
- **Logs de Render** (error/warn/fatal desde el 11-oct): solo los `google login failed`
  (`token_endpoint_401`) de 19:12–19:18, anteriores al arreglo de credenciales de Google
  (ingresos correctos desde 19:31). Nada nuevo después.
- **Neon**: 64 498 s de cómputo (≈17,9 CU-h) al 12-oct 01:37. La proyección lineal da ≈84 CU-h
  al 1-nov (umbral 80), inflada por la sesión de desarrollo del 11-oct: 8 despliegues con su
  prueba de producción (cada una cuenta como actividad y deja las tareas al ritmo normal 30 min),
  migraciones y consultas de auditoría. Revisado qué despierta la base en reposo: tanda única de
  tareas cada 30 min (incluido `sealAudit`), `/api/ready` una vez por hora, y `/api/health` sin
  base. No se encontró nada que la mantenga despierta sin actividad. En reposo se espera
  ≈1,5–1,8 CU-h/día → ≈50 CU-h al 1-nov. **NO VERIFICADO**: se medirá en la próxima ronda sin
  despliegues.

### 2026-10-12 · Proveedor: UniPin descartado; propuesta a distribuidores de PIN

- **Pidió el dueño**: no usar UniPin («no veo que sea confiable») y buscar un distribuidor
  sencillo que acepte los precios de su tienda, sin registrarse con sus datos personales.
- **Hallazgo**: los precios «antes» de los volantes de la tienda son el precio público de Garena
  (100 → $4.200 … 5.600 → $182.400). Con la comisión de Mercado Pago (4 %) y 5 % de ganancia
  mínima, hace falta un descuento de 13–25 % sobre el precio de Garena (17–31 % en promoción).
  Ningún canal oficial verificable lo publica; **NO VERIFICADO** hasta tener cotizaciones.
- **Hecho (solo documentación)**: `docs/specs/contacto-proveedores.md` con InComm Colombia
  (POSA) e Icargas, tabla de costos máximos, mensaje de propuesta de precios y qué se puede hacer
  sin exponer datos personales (registrarse como empresa, canales de la tienda, documentos solo en
  el portal oficial). Notas de descarte en `recarga-directa-unipin.md` y
  `procedimiento-diamantes.md`.
- **Sin cambios** en precios, variables de Render ni código. UniPin sigue apagado.

### 2026-10-13 · Ciclo del prompt maestro (auditoría, backlog y operaciones)

- **Línea base local:** lint, tipos, formato, 238 unitarias, 208 de integración y build en verde;
  `npm audit` 0; escáner de datos 0.
- **Producción (solo lectura):**
  - Render en vivo con `ad9ab59`.
  - Sin errores en logs.
  - Neon: 26 triggers activos y 24 de 24 eventos sellados.
  - Tareas programadas con última ejecución comprobada (`docs/seguridad/TAREAS-PROGRAMADAS.md`).
- **Hallazgos** (`docs/seguridad/HALLAZGOS.md`):
  - rol de base de datos dueño de las tablas (H-01);
  - una sola instantánea de Neon, del 7-oct, sin calendario (H-02);
  - sin testigo externo de integridad (H-03);
  - webhook sin tolerancia de `ts`, por validar (H-04);
  - acciones de GitHub sin SHA (H-05).
- **Corregido en local:** carrera en la prueba e2e del panel vista en la CI del PR #14 (H-06).
- **Dependabot:** #16 (TypeScript 7) es incompatible con `typescript-eslint`; se ignora la versión
  mayor en `dependabot.yml`. #15 falla siempre en WebKit con Playwright 1.64. #13 está verde.
- **Backlog** con aprobaciones pendientes: `docs/seguridad/BACKLOG.md`.
- **Sin cambios** en producción, variables, secretos, precios ni datos. Nada se desplegó sin
  autorización.

### 2026-10-13 · Mandato OMNIA: inventario, respaldo, rol mínimo y webhook

- **Inventario:**
  - 1 repositorio accesible (público, H-09) con 11 ramas (H-10).
  - Neon: un proyecto (`free_v3`) y la rama `production`.
  - Render: un servicio.
  - Las 3 ramas sin fusionar están superadas y sin secretos.
- **Respaldo (H-02):**
  - Crear una instantánea nueva falla: **HTTP 422 «snapshots limit exceeded»**. El plan guarda 1
    y la ocupa la del 7-oct.
  - Se creó la rama `respaldo-2026-10-13` desde producción (15:01 UTC). Comparada con
    producción, coinciden:
    - conteos exactos: 1 pedido, 2 ítems, 0 pagos, 1 intento, 6 productos, 9 usuarios, 24
      eventos y 2 sellos;
    - 26 triggers activos y 16 migraciones;
    - cadena de sellos enlazada y contigua;
    - huellas md5 de precios y de sellos.
- **Rol mínimo (H-01):**
  - Rol de grupo `tgs_app_rw` y `MIGRATION_DATABASE_URL` opcional.
  - Local: 210 de 210 pruebas de integración con la app conectada como rol mínimo; la CI lo hará
    igual. Sin el rol: 208 y 2 omitidas. E2e: 66 de 66.
  - Rama de Neon `prueba-rol-minimo-2026-10-13` (PG18), con `tgs_app_rw`:
    - `DISABLE TRIGGER` → «must be owner»;
    - `UPDATE audit_events` → «permission denied».
  - En producción el rol no existe (solo lectura): el cambio es inerte. Guía para el dueño:
    `docs/base-datos-rol-minimo.md`.
- **Webhook (H-04):** se registra la antigüedad del `ts` firmado (`webhook signature age`), sin
  rechazar nada; 4 pruebas unitarias.
- **Testigo de integridad (H-03):** el paso del diagnóstico del 13-oct duró 0 s. Coincide con la
  falta de `CRON_SECRET` en GitHub (inferido; no se leyó la línea).
- **Recursos creados en Neon** (sin borrar nada; su borrado espera autorización, B-17):
  - `respaldo-2026-10-13` (`br-quiet-rain-b533qmjv`);
  - `prueba-rol-minimo-2026-10-13` (`br-autumn-breeze-b5wlcja5`).

  Cada una tiene un cómputo de 0,25 CU que se suspende solo tras 5 min.
- **Sin cambios** en producción, variables, secretos, precios, pagos ni datos.

### 2026-10-13 · Misión proveedor: TAY RADAR, rentabilidad y proveedores

- **Pidió el dueño:**
  - auditar TAY RADAR, pedidos y Mercado Pago;
  - investigar proveedores de recarga por ID y la competencia;
  - modelo financiero de los 6 paquetes;
  - implementar y probar lo seguro, sin desplegar ni contactar a nadie.
- **Producción (solo lectura):** los 6 paquetes coinciden con la tabla oficial de TAY RADAR.
  `PROMO_SCHEDULE=weekends` y `TOPUP_PROVIDER=none`.
- **Hallazgos:**
  - TAY RADAR la decide el servidor y fija el precio al crear el pedido.
  - Brechas corregidas:
    - la tienda abierta no se actualizaba al cambiar la promo;
    - la regla de precio no quedaba registrada;
    - la comisión del pago no incluía el cargo fijo ni el IVA.
  - Mercado Pago (página oficial vista por el buscador) cobra 3,29 % + $800 + IVA al instante:
    unos $1.101 en el paquete de 110 💎 en TAY RADAR.
- **Proveedores:** la red del entorno bloquea (403) las páginas de los 14 candidatos.
  - Con lo indexado, ninguno cumple «sin saldo prepago» ni tiene condiciones confirmadas para
    LATAM.
  - Volsever queda excluido porque automatiza PagoStore.
  - No se contactó a nadie.
- **Pruebas locales:**

  | Suite | Resultado |
  |---|---|
  | Unitarias | 259 |
  | Integración con rol mínimo | 214 |
  | Integración sin rol mínimo | 212 y 2 omitidas |
  | e2e y visuales en escritorio | 67 |
  | Lint, tipos y build | Verde |

  Proveedor y Mercado Pago, simulados.
- **Sin cambios** en producción, precios, variables ni datos. El commit queda local hasta que el
  dueño autorice subirlo, porque subirlo despliega.

### 2026-10-13 · Paquetes «Agotado»: la tienda vuelve a vender (entrega manual por el dueño)

- **Reportó el dueño:** el catálogo mostraba todos los paquetes «Agotado» y no podía añadir pedidos.
- **Causa (reproducida en local con la configuración de producción):**
  - `SELL_ONLY_WITH_STOCK=true` en Render, sin PIN cargados (0 en la base) y con
    `TOPUP_PROVIDER=none`.
  - Resultado: 6 de 6 paquetes «Agotado» y el botón «Agregar» desactivado.
  - `render.yaml` ya decía `false`; la variable del panel lo anulaba.
- **Decisión del dueño (13-oct):** operar de verdad, con él como proveedor que entrega cada pedido
  pagado desde el panel.
- **Hecho:** `SELL_ONLY_WITH_STOCK=false` en Render. Los demás valores no cambiaron.
- **Recorrido de compra como cliente** (navegador real, servidor local con la configuración de
  producción y Mercado Pago simulado; `tools/smoke/compra-cliente.mjs`):
  - catálogo con 6 de 6 a la venta;
  - se añade el paquete de 110 💎 ($4.000, día entre semana);
  - ID escrito dos veces y confirmado;
  - nombre, correo, PSE y términos;
  - «Pagar $ 4.000 COP» → «Pago confirmado» con comprobante → el pedido aparece en
    «Mis pedidos».
- **Comprobación de producción:** la prueba diaria y la de cada despliegue (`burbujas.mjs`) ahora
  informan «a la venta / agotados» y avisan si todo sale «Agotado».
- **Riesgo que el dueño debe conocer:**
  - Cada pedido pagado obliga a entregar en el plazo de `LEGAL_DELIVERY_TIME`.
  - Comprar los diamantes al precio público y pagar la comisión de Mercado Pago deja pérdida en
    los paquetes pequeños (`docs/proveedor-recargas/FINANZAS.md`).
- **Evidencia en producción (18:18 UTC):**
  - la prueba del despliegue `50a9c2b` dio «Catálogo · 6 paquete(s) · a la venta: 6 · agotados: 0»;
  - CI y CodeQL en verde, incluidas las e2e en Chromium, Firefox y WebKit;
  - sin errores ni respuestas 5xx en Render.

### 2026-10-13 · Autorización total del dueño: pendientes ejecutados

Autorización del dueño en el chat: «autorizacion concedido total tienes permiso».

| Pendiente | Resultado | Evidencia |
|---|---|---|
| Rama de Neon `prueba-rol-minimo-2026-10-13` | Borrada | Ya no aparece en `list_branches`; la rama `respaldo-2026-10-13` sigue |
| Instantánea de Neon | Renovada | Se borró `respaldo-2026-10-07` y se creó `respaldo-2026-10-13` (`snap-empty-dew-b5cu82in`) |
| Comisión de Mercado Pago en Render | Aplicada | `PAYMENT_FEE_PCT=3.29`, `PAYMENT_FEE_FIXED_COP=800`, `PAYMENT_FEE_TAX_PCT=19`; despliegue `dep-db77h0u7bikc73aclv90` activo. Tarifa de la página pública: **NO VERIFICADA** en el panel del dueño |
| Rol mínimo de la base (H-01) | En parte | Rol de grupo `tgs_app_rw` creado y permisos aplicados por la migración del despliegue; `has_table_privilege` igual al diseño. Falta `tgs_app` con la clave del dueño y el cambio de `DATABASE_URL`: la clave no pasa por el chat |
| PR #13 y #14 (Dependabot) | Fusionados | En local: formato, lint, tipos, 259 unitarias, 214 de integración con rol mínimo, build, `npm audit` sin vulnerabilidades y 67 de 67 e2e y visuales |
| PR #15 (Playwright 1.64) | Retenido | Su CI falla en WebKit; no estaba en la lista autorizada |
| PR #12 | Cerrado | Comentario en el PR: superado (H-10) |
| 7 ramas de Git superadas | **No borradas** | El proxy de la sesión rechaza `git push --delete` (HTTP 403). Las borra el dueño en GitHub → Branches |
| `CRON_SECRET` | **Pendiente del dueño** | Tiene que estar igual en Render y en GitHub, y esta sesión no puede escribir secretos de GitHub. Crearlo aquí lo dejaría en la conversación |
| Visibilidad del repositorio | Sigue público | Recomendación de H-09. La autorización no dice en qué sentido cambiarlo, y no hay herramienta para hacerlo |
| Contactar proveedores | **Preparado, no enviado** | Mensajes listos en `docs/proveedor-recargas/SOLICITUD-COTIZACION.md`. No hay canal autorizado: Gmail del dueño excluido, sin Telegram y sin acceso de red a los proveedores |
| Dominios de proveedores en la red del entorno | Pendiente del dueño | Se cambia en la configuración del entorno (acceso a red), fuera del repositorio |

### 2026-10-13 · Tienda profesional: reseñas verificadas, recorrido de entrega y automatización sin n8n

Pedido del dueño: perfeccionar la tienda para que funcione como una tienda real de recargas, con
reseñas, el procedimiento de compra y envío de diamantes, y una automatización que no cobre.

- **Reseñas verificadas** (migración 0016, `src/server/services/reviews.ts`):
  - **Quién opina:** solo quien hizo un pedido entregado, una vez por pedido. Lo hace desde
    «Seguimiento», con la misma autorización que para ver su pedido.
  - **Publicación:** el dueño publica u oculta desde el panel (pestaña «Reseñas»). Se muestra el
    nombre de pila con la inicial, la fecha y el paquete; nunca el correo, el UID ni la referencia.
  - **Protección en la base de datos:**
    - no se pueden editar las estrellas, el texto, el nombre ni la fecha;
    - no se pueden borrar, tampoco con SQL directo del dueño de las tablas.
  - **Sin reseñas publicadas:** la tienda dice «Aún no hay reseñas publicadas». No se creó
    ninguna reseña de ejemplo ni en producción ni en el código.
- **Recorrido de entrega para el cliente:**
  - nueva sección «Así llegan tus diamantes», que reemplaza «Tay Lab»;
  - paso 5 en «Cómo funciona»;
  - tres preguntas frecuentes nuevas: plazo, ID equivocado y si las reseñas son reales;
  - el plazo sale de `LEGAL_DELIVERY_TIME`, ahora en `/api/config`.
- **Privacidad:** la política explica qué publica una reseña y cómo retirarla.
- **Procedimiento del dueño** (`docs/procedimiento-diamantes.md`, «Cómo opera la tienda hoy»):
  - catálogo y precios (normal y TAY RADAR);
  - lo que queda de cada venta tras la comisión de Mercado Pago;
  - lista de pasos por pedido pagado;
  - moderación de reseñas.
- **n8n:** el dueño reportó que n8n le pide pago. No hace falta: desde el 11-oct nada depende de
  n8n (`docs/automatizacion.md`). El servidor ahora registra al arrancar «avisos y automatización»
  (sí/no por canal) para comprobar si el dueño recibe avisos de pedidos pagados.
  - **NO VERIFICADO** hasta el despliegue: si producción tiene correo o Telegram configurados.
    La tabla `notifications` está vacía porque todavía no hubo pagos.
- **Pruebas:**
  - 7 de integración, con y sin rol mínimo: eligibilidad, ajeno = 404, una por pedido,
    moderación, validación sin enlaces, contenido inmutable y panel;
  - e2e: entrega → reseña → publicación → visible en la tienda;
  - capturas visuales de página completa regeneradas (3 tamaños) con las secciones nuevas.
- **Evidencia en producción tras el despliegue `10098fa` (19:22 UTC):**
  - Neon: tabla `reviews` con 0 filas y 3 triggers de protección. `tgs_app_rw` puede leer,
    insertar y actualizar, pero no borrar. Migración 0016 aplicada.
  - Registro «avisos y automatización»:

    | Canal | Valor |
    |---|---|
    | `correo` | false |
    | `telegram` | false |
    | `eventosExternos` | true |
    | `cronExterno` | true |
    | `plazoEntrega` | true |

    Consecuencias:
    - El dueño **no recibe avisos de pedidos pagados** salvo con el panel abierto:
      **PENDIENTE DEL DUEÑO** (SMTP de Gmail o Telegram).
    - `CRON_SECRET` sí existe en Render; solo falta en GitHub (H-03).
    - Los eventos seguían configurados hacia n8n.
- **Eventos hacia n8n apagados:**
  - Nueva variable `EVENTS_WEBHOOK_ENABLED` (por defecto `true`), con prueba unitaria.
  - En Render se fijó en `false` para no enviar el UID de los jugadores a un servicio que el dueño
    dejó.
  - No se tocaron la URL ni la llave.
- **Evidencia tras el despliegue `caad916`:**
  - el registro «avisos y automatización» muestra `eventosExternos: false`;
  - la prueba de producción informa «Reseñas publicadas: 0 · plazo de entrega publicado: sí ·
    correos al cliente: inactivos».

### 2026-10-13 · Anti-falsificación pública y Nequi como medio de pago propio

Pedido del dueño: que sea imposible falsificar información, facturas, pagos y credenciales, y que
Nequi aparezca aparte de las tarjetas, PSE y Mercado Pago, sin que el cliente se confunda.

- **Problema encontrado:** «Tarjeta» decía «Bancolombia, Davivienda, Nequi…». Un cliente de Nequi
  la elegía y Mercado Pago le pedía datos de tarjeta.
- **Nequi separado** (`gateway.ts`, `pay-means.js`):
  - opción propia «Nequi» que abre Mercado Pago solo con PSE;
  - la pista indica elegir el banco «Nequi», escribir el celular y aprobar en la app;
  - «Tarjeta» queda para crédito y débito (Visa, Mastercard, Amex);
  - cada medio muestra su propia pista.
- **Investigación (fuentes públicas):**
  - Mercado Pago Colombia ofrece tarjetas, PSE, Efecty y saldo; Nequi no es un medio propio
    ([checkout de Mercado Pago](https://www.mercadopago.com.co/herramientas-para-vender/check-out),
    [medios de pago de Mercado Libre](https://www.mercadolibre.com.co/l/mediosdepago)).
  - Nequi se usa como banco dentro de PSE
    ([El Tiempo](https://www.eltiempo.com/tecnosfera/novedades-tecnologia/como-recargar-nequi-por-pse-en-el-2023-paso-a-paso-737066)).
  - Pasarelas con Nequi directo: Wompi, PayU, Wava
    ([Tiendanube](https://www.tiendanube.com/blog/pasarelas-de-pago-colombia/),
    [Orbit Lab](https://orbitlabco.com/recursos/pasarelas-de-pago-colombia/)).
  - **NO VERIFICADO:** que Nequi aparezca en la lista de PSE del checkout real del dueño. Los pagos
    siguen apagados y no se simuló ningún pago.
  - **No se añadió** una segunda pasarela: Mercado Pago sigue siendo la única autoridad de pago.
    Wompi o PayU serían decisión del dueño.
- **Dinero y proveedor:**
  - todos los medios cobran en la misma cuenta de Mercado Pago del dueño;
  - la tienda no paga sola al proveedor ni divide el cobro;
  - el modo marketplace de Mercado Pago queda **NO VERIFICADO** para Colombia y no se implementó
    (`docs/dinero-y-acceso.md`).
- **Verificador público de comprobantes** (`POST /api/receipts/verify`, tienda → Soporte):
  - reutiliza el código HMAC con `timingSafeEqual`;
  - si el comprobante es auténtico, devuelve solo número, referencia, total, fecha de pago y
    estado;
  - un código falso, una referencia inexistente o un pedido sin pago dan la misma respuesta
    `{authentic:false}`;
  - límite de 10 intentos cada 10 minutos por IP y `cache-control: no-store`;
  - la factura indica dónde verificarla.
- **Protecciones anti-falsificación que ya existían** (`docs/seguridad-tienda.md`):
  - el servidor calcula los precios;
  - un pago solo vale si Mercado Pago lo confirma con firma y consulta;
  - los montos son inmutables y la base no permite borrados;
  - el historial está sellado con hashes;
  - las sesiones se guardan como hash;
  - el panel tiene doble factor y responde 404 a quien no es administrador.
- **Evidencia local:**
  - formato, lint y typecheck limpios;
  - unitarias 261/261;
  - integración 223/223 con rol mínimo y 221 + 2 omitidas sin él;
  - e2e de escritorio 67/67. Incluye elegir Nequi, verificar un comprobante auténtico y uno
    falso;
  - capturas visuales regeneradas (3 tamaños) y revisadas en escritorio y móvil.
- **Sin cambios** en `PAYMENTS_ENABLED`/`CHECKOUT_ENABLED`, secretos, `LEGAL_*` ni datos del dueño.

### 2026-10-14 · Facturas solo reales y Excel de inventario y facturas

Pedido del dueño: «que las facturas no sean de borrador, ficticias, inexistentes o fantasma», que
salgan «según el inventario» y que haya un Excel «bien guardado y organizado».

- **Problema encontrado:** la tienda dejaba descargar en JPG o PDF un comprobante con la
  referencia «BORRADOR» y el código «--------» antes de crear el pedido, y uno de pedido sin pagar.
- **Corregido en la tienda** (`invoice.js`, `invoice-export.js`, `index.html`):
  - sin pedido, la tarjeta dice «RESUMEN» y explica que no es factura;
  - con pedido sin pagar, la tienda indica que el comprobante se emite al confirmarse el pago;
  - JPG, PDF y Compartir solo se activan cuando el servidor devuelve el comprobante (pedido
    pagado: número consecutivo y código HMAC);
  - el comprobante descargado indica dónde verificarlo.
- **Excel de inventario y facturas** (`src/server/lib/xlsx.ts`,
  `src/server/services/inventory-export.ts`, panel → Inventario → «Descargar Excel»):
  - se arma con la base en el momento; hojas Resumen, Inventario, Facturas y Pedidos;
  - Facturas = solo pedidos con comprobante; Pedidos marca los no pagados como «Sin pago (no es
    factura)»;
  - sin nombres, correos, ID de jugador ni PIN (no aumenta la exposición de datos);
  - texto como cadena en línea (sin inyección de fórmulas) y hojas protegidas sin contraseña;
  - ruta solo de administrador con doble factor (404 para los demás), en la lista aprobada de
    `owner-only.test.ts`; cada descarga queda en la Auditoría (`inventory.exported`, solo
    cantidades);
  - sin dependencias nuevas.
- **Evidencia local:**
  - lint, typecheck y formato limpios;
  - unitarias 265/265 (4 nuevas del generador: ZIP válido con CRC, sin fórmulas, nombres de hoja
    válidos);
  - integración 225/225 con rol mínimo y 223 + 2 omitidas sin él (2 nuevas: contenido real,
    facturas solo pagadas, sin datos personales ni PIN, auditoría, 404 para no administradores);
  - e2e de escritorio 68/68 (comprobante solo tras el pago; descarga del Excel desde el panel);
  - capturas visuales regeneradas (3 tamaños);
  - el archivo descargado del panel pasó una validación estructural con Python (XML bien formado,
    relaciones y tipos de contenido completos, 4 hojas con sus encabezados).
  - **NO VERIFICADO:** abrirlo en Excel o LibreOffice reales. LibreOffice no funciona en este
    contenedor: no carga ni un CSV simple.
- **Sin cambios** en `PAYMENTS_ENABLED`/`CHECKOUT_ENABLED`, secretos, `LEGAL_*` ni datos del dueño.

### 2026-10-15 · Seguridad: segundo paso del panel y auditoría de webhooks falsos

- **Pidió**: el dueño (auditoría y fortalecimiento de seguridad; sin desplegar).
- **Autorizó la publicación**: el dueño, después de revisar el informe y el parche («Quiero que
  hagas funcionamiento en producción»). Se publica exactamente el parche revisado más este
  registro.
- **S1 confirmada (crítica con credencial):** con solo la contraseña del dueño (o su Google), la
  sesión «pendiente del segundo paso» podía generar y activar un TOTP propio
  (`/api/admin/mfa/setup` y `/enable`) y abrir el panel completo, aunque la cuenta ya tuviera
  llaves. Reproducida con una prueba temporal: pedidos 403 → setup 200 → pedidos 200. Producción
  (Neon, solo conteos): contraseña y 3 llaves, TOTP sin activar (estado explotable).
- **Corrección S1** (`services/auth.ts`, `modules/auth/routes.ts`): con una llave registrada, el
  TOTP solo se genera o activa desde una sesión que ya pasó el segundo paso; cada intento
  bloqueado se audita (`admin.mfa_enroll_blocked`, alerta). Pruebas nuevas en
  `admin-access.test.ts`; prueba de mutación: sin la corrección, la prueba falla.
- **S2 confirmada (media, disponibilidad):** cada aviso al webhook con firma falsa escribía una
  fila en la auditoría (solo inserción); 25 avisos → 25 filas. **Corrección**
  (`services/payments.ts`): como mucho 1 por minuto y por conexión (30/min en total), con el
  conteo de repetidas. Prueba nueva en `commerce.test.ts` (25 → 1).
- **Evidencia local:** formato, lint y typecheck limpios; unitarias 265/265; integración 228/228
  con rol mínimo y 226 + 2 omitidas sin él; e2e de escritorio 67/68: falla
  `visual.spec.ts` (03, 536 px en los botones JPG/PDF desactivados), **igual sin estos cambios**
  (referencia desactualizada desde `04f0768`; CI no ejecuta las visuales); escáner de secretos
  0 coincidencias.
- **NO VERIFICADO:** el comportamiento en vivo (el proxy de esta sesión no alcanza el sitio); el
  estado del despliegue (Render y CI) se informa al dueño con evidencia después del push. Que
  `ADMIN_SETUP_CODE` siga en Render (la API no muestra valores); recomendado borrarla.
- **Sin cambios** en `PAYMENTS_ENABLED`/`CHECKOUT_ENABLED`, secretos, `LEGAL_*` ni datos del dueño.

### 2026-10-18 · Pedidos con recarga manual: estados separados, panel, seguimiento privado y Sheets

- **Pidió**: el dueño, en la misión «Implementar el sistema de pedidos, pagos y recargas
  manuales». Prohibido sin autorización explícita: despliegue, variables de producción y
  operaciones reales.
- **Autorizó la publicación**: el dueño, después de recibir el informe, el parche y los hashes de
  los 45 archivos («Autorizo publicar en producción el parche de pedidos manuales (45 archivos,
  migración 0017)»). Antes del commit se comprobó que los 45 archivos seguían idénticos a los
  revisados; solo cambió esta parte del registro.
- **Qué cambia:**
  - estados de pago y de recarga derivados en el servidor;
  - panel con filtros por fecha y juego, páginas, notas internas, historial completo con autor
    y alertas de pedidos atascados;
  - corrección del cambio de medio de pago (A2) y del reembolso parcial (M6);
  - enlace y consulta privados del pedido;
  - canal opcional de Google Sheets, apagado sin credenciales;
  - evaluación de Wompi y Nequi;
  - migración aditiva 0017: tres columnas opcionales y un canal más en el CHECK de avisos, sin
    tocar datos.
- **Evidencia local:** cifras reales en el informe de esta misión. La e2e corrió solo en
  escritorio con Chromium; Firefox y WebKit quedan para CI.
- **Evidencia de la publicación** (commit `78ca935`, 45 archivos, +6317/−87):
  - push sin forzar `1eafc5a..78ca935`; `git ls-remote` devuelve `78ca935`;
  - Render `dep-dbaiqcjm8hqs73bfevdg`: `live` a las 20:34:55 UTC; el build registró «Migraciones
    aplicadas.»;
  - Neon (solo lectura): 18 migraciones registradas; existen `payment_attempts.pay_means`,
    `payments.payment_method_id` y `payments.payment_type_id`; el CHECK de avisos admite
    `sheets`;
  - arranque: «Server listening» y «avisos y automatización» con `correo:false`,
    `telegram:false` y `hojaGoogle:false`; sin logs error/warn/fatal desde el despliegue;
  - CI en verde: lint, formato, typecheck, esquema y migraciones sincronizados, unitarias, build,
    auditoría de dependencias, integración con PostgreSQL, e2e en Chromium, Firefox y WebKit y
    gitleaks; CodeQL y «Production smoke check» en verde (este terminó a las 20:34:41, antes de
    que el despliegue quedara `live`, así que probó la versión anterior); con la versión nueva
    ya `live`, «Vigilancia y autorreparación» respondió bien a las 20:52 UTC (`/api/health`);
  - ronda de mantenimiento de las 20:52 UTC: 11 pedidos, todos vencidos; 0 pagos, 0 pagados por
    entregar, 0 en revisión, 0 por reembolsar, 0 reseñas pendientes y 0 avisos fallidos; Neon
    33,2 CU-h usadas, proyección de 68,9 CU-h al cierre del mes (límite 100).
- **NO VERIFICADO:**
  - el comportamiento en vivo del seguimiento privado y del panel nuevo (el proxy de esta sesión
    no alcanza el sitio; la prueba de humo y la vigilancia solo revisan la página, `/api/health`,
    `/api/ready` y las burbujas de soporte);
  - la conexión real con Google Sheets (sin credenciales);
  - un pago real de punta a punta (pendiente con autorización del dueño).
- **Sin cambios** en `PAYMENTS_ENABLED`/`CHECKOUT_ENABLED`, secretos, `LEGAL_*`, datos del dueño
  ni infraestructura.
- **Este bloque de evidencia** se publicó en un commit aparte, solo con este registro, autorizado
  por el dueño («Autorizo el commit del registro con la evidencia»).

### 2026-10-18 · Decisión del dueño: no usar Telegram

- **Decidió**: el dueño («no quiero uso de telegram»).
- **Estado actual:** Telegram está apagado en producción (`telegram:false` en el arranque del
  despliegue `78ca935`): no hay credenciales cargadas y no se envía nada por ese canal.
- **Consecuencia:** los avisos al dueño quedan para el correo (SMTP) y el panel. No se deben
  cargar las variables `TELEGRAM_*` ni recomendarlas en informes o rutinas.
- **Sin cambios de código** en este registro. El código del canal sigue en el repositorio, inactivo
  sin variables; quitarlo o actualizar las guías que lo mencionan necesita otro commit autorizado.

### 2026-10-19 · Telegram eliminado del código

- **Pidió y autorizó**: el dueño. Primero decidió no usar Telegram («no quiero uso de telegram»).
  Cuando se le ofreció quitarlo del código con un commit que despliega, respondió «tienes la
  mayor autorización y ejecución posible».
- **Qué cambia:**
  - se borró el aviso por Telegram (`TelegramOwnerNotifier`), las variables `TELEGRAM_BOT_TOKEN`
    y `TELEGRAM_CHAT_ID`, su validación y el indicador `telegram` del registro de arranque;
  - el texto del aviso de pedido pagado (`paidOrderText`) se conserva: es el del correo al dueño;
  - migración 0018: el CHECK de la cola de avisos ya no admite `telegram`. Antes de publicar se
    consultó producción (solo lectura): la tabla `notifications` estaba vacía;
  - `golive:check` avisa «Sin correo al dueño» en lugar de pedir Telegram; el panel dice «Avisos
    sin enviar (correo, webhook u hoja)»;
  - `render.yaml`, `.env.example` y las guías ya no mencionan Telegram como opción.
- **Pruebas:** las que usaban el doble de Telegram ahora comprueban el correo al dueño: aviso
  único al pagar, ninguno sin pago confirmado, y el pago queda guardado aunque el correo falle.
- **Sin cambios** en pagos (`PAYMENTS_ENABLED`/`CHECKOUT_ENABLED`), secretos, variables de Render,
  `LEGAL_*` ni datos del dueño. Si en Render quedara alguna variable `TELEGRAM_*`, el servidor la
  ignora (el arranque mostraba `telegram:false`, así que no estaban cargadas).
- **Evidencia del despliegue (2026-10-19):**
  - push `7971b5c`; Render `dep-dbap6gtg1s2s73biukng` en `live` a las 03:50 UTC; la migración
    0018 se aplicó en el build;
  - CI (lint, unitarias, integración, e2e en Chromium, Firefox y WebKit), CodeQL y la prueba de
    humo de producción: en verde;
  - arranques posteriores sin errores; el registro «avisos y automatización» ya no tiene el
    indicador `telegram`.
- **NO VERIFICADO:** el correo al dueño en vivo (SMTP sigue sin configurar: `correo:false`).

### 2026-10-19 · Hoja de Google del dueño y pestaña «Entregas» con los datos del jugador

- **Pidió y autorizó**: el dueño.
  - Primero: «Sí, crea la hoja Pedidos en mi Drive, y ejecutalo altamente profesional».
  - Después: «Quiero que los conectes y lo gestiones e ejecute en modo de producción».
  - Y luego: «quiero una hoja apartado del mismo archivo excel de ID del jugador, la
    confirmación del jugador, la región, y el pedido y etc información y además que tenga
    conectado y se actualize conectado a mi tienda».
  - Varias veces dio autorización general («tienes permiso y autorización»).
- **Hoja creada en el Drive del dueño** («TayGameStore · Registro de pedidos», privada). El id no
  se escribe en el repositorio.
  - Pestañas:
    - «Resumen»: indicadores con fórmulas, sin repetir pedidos reintentados;
    - «Pedidos»: los 10 encabezados exactos de `SHEET_COLUMNS`;
    - «Léeme».
  - Las fórmulas se probaron con 6 filas ficticias («PRUEBA-…»), que se borraron después.
  - Permisos (Drive, 2026-10-19): solo el dueño y la cuenta de servicio `tienda-hoja` como
    editora. No hay enlace público.
- **Cuenta de servicio:** el dueño la creó en un proyecto propio de Google Cloud (sin
  organización y sin roles).
  - El dueño subió **dos llaves JSON a la conversación**.
  - Se borraron las copias que quedaron en el entorno de trabajo, no se usaron y no se copiaron
    a ningún archivo ni variable.
  - Se le pidió borrarlas en Google Cloud y crear una nueva sin enviarla.
- **Redespliegue manual** (Render `dep-dbb1edvf3r2c73ftvah0`, `live` a las 13:13 UTC) para leer
  las variables. El arranque dijo `hojaGoogle: false`: en Render no estaban las tres variables.
  - La tienda siguió funcionando y no hubo errores.
- **Código (pestaña «Entregas»):**
  - canal nuevo `sheets_delivery` en la cola de avisos (migración 0019: solo amplía el CHECK);
  - por cada pago confirmado, recarga entregada o reembolso escribe una fila con los datos para
    recargar:
    - ID del jugador (texto);
    - nickname confirmado;
    - cómo se confirmó la cuenta (sin copiar la nota del operador);
    - servidor elegido;
    - región detectada;
    - paquete, total, estados, comprobante e id del registro.
  - «Pedidos» sigue sin datos personales. Correo, nombre y PIN no van a ninguna pestaña.
  - `GOOGLE_SHEETS_DELIVERY_TAB` (por defecto «Entregas»). Si coincide con la pestaña de pedidos,
    el servidor no arranca.
  - La política de privacidad (punto 4) informa del registro en Google Sheets. Antes nombraba a
    n8n, que el dueño dejó de usar el 2026-10-11.
- **Evidencia local:**
  - lint, formato y tipos: OK;
  - unitarias: 289/289;
  - integración: 253/253, con PostgreSQL y rol mínimo;
  - e2e: 68/68;
  - esquema y migraciones sincronizados;
  - escáner de datos sensibles: 0 coincidencias.
- **NO VERIFICADO:**
  - que las dos llaves que pasaron por la conversación estén borradas en Google Cloud;
  - las tres variables en Render;
  - la primera fila real en las pestañas: hace falta un pago confirmado, y los pagos siguen
    apagados.

### 2026-10-19 · «Entregas» en tiempo real y Nequi independiente de Mercado Pago (local, sin publicar)

- **Pedidos del dueño:** (1) reportes organizados con referencias, comprobantes y estado del pedido
  actualizado en la hoja («enviado / completado» → «Entregado con éxito»); (2) «REQUISITO CRÍTICO:
  Nequi totalmente independiente de Mercado Pago», sin inventar APIs ni credenciales de Nequi y
  sin modificar producción.
- **«Entregas», una fila por pedido** (commit local `1730452`, migración 0020): la fila se
  reescribe en cada cambio de estado; 19 columnas (`docs/google-sheets.md`).
- **Hoja de Google** (Drive del dueño, el id no se escribe aquí): pestañas «Por entregar» y
  «Reporte diario», bloque de entregas en «Resumen», «Léeme» reescrito; encabezado Q de
  «Entregas» cambiado a «Operación de pago» y dos líneas del «Léeme» que nombraban solo a
  Mercado Pago. Ninguna fila de pedido real (los pagos siguen apagados).
- **Nequi** (`docs/pagos-nequi.md`, migración 0021, apagado por defecto):
  - módulos: Nequi por transferencia (confirma solo el dueño en el panel), Nequi Push reservado y
    deshabilitado (sin API), coordinador de pago del pedido y selector de métodos;
  - Mercado Pago sin cambios de comportamiento: solo guardas para que sus pagos no afecten
    pedidos de otro método y para no consultarle por pedidos Nequi;
  - aislamiento en código, en la base de datos (disparadores
    `orders_payment_method_guard` y `payments_provider_matches_order`, referencia única) y en la
    configuración (`NEQUI_MANUAL_*`; un valor inválido apaga Nequi sin impedir el arranque);
  - el celular Nequi del dueño solo sale de `NEQUI_MANUAL_PHONE` (lo escribe el dueño en Render),
    solo al comprador de su propio pedido Nequi y mientras espera pago. No está en el código, en
    `/api/config`, en correos ni en la hoja. En las pruebas: números ficticios;
  - términos y privacidad: describen el pago por Nequi, los datos que se guardan (4 últimos
    dígitos y referencias) y la devolución por Nequi.
- **Evidencia local:**
  - lint, formato, tipos y `drizzle-kit check`: OK;
  - unitarias: 304/304;
  - integración: 280/280 (28 archivos), con PostgreSQL y rol mínimo; incluye
    `payment-isolation.test.ts` (23 casos, los 8 puntos del requisito);
  - e2e: 69/69, incluida la compra Nequi en el navegador sin pasar por Mercado Pago;
  - escáner de datos sensibles: 0 coincidencias.
- **Sin publicar.** No se hizo push, no se cambiaron variables de Render ni se activó ningún pago.
- **Pendiente de autorización del dueño:**
  - publicar (push a la rama desplegada = despliegue en Render, con las migraciones 0020 y 0021);
  - decidir publicar el celular Nequi y escribir `NEQUI_MANUAL_*` en Render;
  - actualizar la regla de `CLAUDE.md` «Mercado Pago es la única autoridad de pago» y añadir
    `NEQUI_MANUAL_ENABLED` a los interruptores que requieren autorización (requisito 15).
- **NO VERIFICADO:**
  - el formato exacto de la referencia de un movimiento en la app Nequi (el panel acepta de 4 a 40
    letras, números o guiones);
  - cualquier acceso oficial a una API de Nequi (no se usó ninguno);
  - el funcionamiento en producción.

### 2026-10-19 · Ronda de mantenimiento, fallos de dependencias y correcciones (local, sin publicar)

- **Pedido del dueño:** «Ejecuta nuevamente y arregla los fallos y errores y vulnerabilidades y
  solucionalo profundamente».
- **Producción (solo lectura, 18:30 UTC aprox.):**
  - Render: despliegue activo `d9b7fee` (`live`); sin registros error/warn/fatal desde las 12:50
    UTC; el arranque dice `correo: false` y `hojaGoogle: false`;
  - GitHub Actions: CI, CodeQL y «Production smoke check» de `d9b7fee` en verde; flujos
    programados («Diagnóstico diario», «Vigilancia y autorreparación», «Mantener la tienda
    activa») en verde; sin issues abiertos con la etiqueta «incidente»;
  - Neon: 0 pedidos por entregar, 0 en revisión, 0 pagos para reembolso, 0 reseñas pendientes, 0
    avisos fallidos; 13 pedidos en total, los últimos dos de hoy vencidos sin pago; consumo 35,5
    CU-h en 13 días (proyección ≈ 69 CU-h al cierre del periodo, bajo el límite de 100);
  - hoja de Google: permisos solo del dueño y de la cuenta de servicio; sin conectar (variables
    pendientes en Render).
- **Vulnerabilidades:** `npm audit` 0 (ninguna severidad). PR de dependencias de producción
  (Dependabot, 4 paquetes): todas las comprobaciones en verde. PR de desarrollo (8 paquetes): e2e
  en rojo en los 3 navegadores.
- **Causa del rojo del PR de desarrollo:** axe-core 4.14 marca como grave
  `label-content-name-mismatch` (WCAG 2.5.3): el nombre accesible de «Cuenta», «Carrito» y el
  logotipo no contenía su texto visible. Defecto real de accesibilidad, no de la prueba.
  - Corregido sin cambio visual: separación de palabras en el documento (contenedores flex) y
    logotipo sin `aria-label`, con «inicio» solo para lectores de pantalla.
  - Evidencia: con axe-core 4.14 instalado temporalmente (sin guardar), la suite e2e completa pasa
    en Chromium (69/69); luego se restauró `npm ci` a las versiones del repositorio.
  - **NO VERIFICADO:** WebKit 27.2 (Playwright 1.64) también fallaba en dos pruebas propias de
    ese motor (animaciones al volver arriba y foco con Tab). Aquí solo hay Chromium y no se
    descargan navegadores: se verá en CI cuando se publique.
- **Revisión de seguridad del trabajo de Nequi sin publicar:**
  - corregido: repetir «Ya transferí» reenviaba el correo al dueño y alargaba el plazo del pedido
    cada vez (hasta 30 veces cada 10 minutos: inundación del correo y pedido abierto sin fin). Ahora
    una corrección solo actualiza los datos; prueba de regresión que falla sin la corrección (4
    correos en vez de 1);
  - comprobado sin cambios: el acceso a la vista del pedido (dueño del pedido o enlace privado), la
    restricción de la base que exige jugador confirmado para pagar, las rutas de prueba fuera del
    servidor de producción y los textos mostrados sin interpretar HTML;
  - migración 0021 aplicada en una base local desechable con datos ficticios como los de
    producción (pedido vencido con intento de Mercado Pago y otro sin intento): el primero queda
    `mercadopago`, el segundo sin método, y el disparador impide cambiarlo después. Base borrada.
- **Capturas de referencia:** las tres de página completa se regeneraron por el cambio previsto
  del selector de pago (commit `b8a2901`); las de entrada y acceso no cambiaron.
- **Evidencia local:** tipos, lint, formato y `drizzle-kit check` OK; unitarias 304/304;
  integración 281/281 (28 archivos); e2e 69/69; visuales 3/3; escáner de datos sensibles: 0
  coincidencias.
- **Sin publicar.** Pendiente de autorización del dueño: push (despliega en Render).

### 2026-10-19 · Publicación de «Entregas» en tiempo real, Nequi (apagado) y correcciones

- **Autorización del dueño:** «Autorizo el push» y «Ejecuta» (2026-10-19).
- **Publicado:** `1730452`, `b8a2901` y `445ba93` en `claude/taygamestore-production-pfctbn`
  (avance rápido desde `d9b7fee`; `git ls-remote` = `445ba93`). Antes del push: árbol limpio y
  escáner de datos sensibles con 0 coincidencias.
- **Render:** despliegue `dep-dbb8ltqvcj2c73c82tn0` en `live` a las 21:27 UTC. Registro de
  arranque: «Migraciones aplicadas.», `métodos de pago` con `mercadoPago: true`,
  `nequiTransferencia: false` y `nequiPush: false` (Nequi sigue apagado: no se cambió ninguna
  variable); `correo: false` y `hojaGoogle: false` como antes. Sin registros error/warn/fatal.
- **Neon (solo lectura):** 22 migraciones; tabla `nequi_transfers`, columna
  `orders.payment_method` y los 3 disparadores nuevos presentes; los 14 pedidos existentes
  quedaron con método `mercadopago` (todos tenían un intento de pago) y ninguno sin método.
  Pedidos por entregar, en revisión, reembolsos, reseñas pendientes y avisos fallidos: 0.
- **GitHub Actions de `445ba93`:** CI completo en verde (lint, formato, tipos, esquema,
  unitarias, build, auditoría de dependencias, integración, gitleaks y e2e en Chromium, Firefox
  y WebKit), CodeQL en verde y «Production smoke check» en verde contra producción.
- **Hoja de Google:** permisos sin cambios (solo el dueño y la cuenta de servicio).
- **NO VERIFICADO:** una compra real con Nequi en producción (Nequi está apagado hasta que el
  dueño cargue `NEQUI_MANUAL_*`); el PR de dependencias de desarrollo con axe-core 4.14 debe
  volver a correr sobre esta base para confirmar que queda en verde.

### 2026-10-19 · Al elegir Nequi nunca se abre Mercado Pago (local, sin publicar)

- **Pedido del dueño:** «no quiero que cuando selecciona nequi … abra el apartado de mercado pago».
- **Causa encontrada:** con Nequi elegido, mientras se preparaba el pago el botón decía
  «Abriendo Mercado Pago…»; el cuadro de Nequi tenía «Pagar con Mercado Pago en su lugar» y las
  opciones de Mercado Pago seguían a la vista; la API permitía pasar un pedido de Nequi a Mercado
  Pago.
- **Corregido:**
  - tienda: botón «Pagar por Nequi $ …» y «Preparando Nequi…»; en un pedido de Nequi se ocultan las
    opciones de Mercado Pago y se quitó el botón hacia Mercado Pago;
  - servidor: un pedido de Nequi no pasa a Mercado Pago (`PAYMENT_METHOD_LOCKED`); solo se permite
    de Mercado Pago a Nequi, con confirmación y sin pagos;
  - pruebas: integración (el pedido de Nequi no crea preferencia ni cambia de método, antes y
    después del aviso) y e2e (texto del botón, sin «Mercado Pago» en ningún momento, opciones de
    Mercado Pago ocultas).
- **Evidencia local:** tipos y lint OK; unitarias 304/304; integración 281/281; e2e 69/69;
  visuales 3/3.
- **NO VERIFICADO en producción:** Nequi sigue apagado allí (`NEQUI_MANUAL_ENABLED`), así que la
  opción no se ve hasta que el dueño lo active.

### 2026-10-20 · Publicación de 40602a5 (Nequi nunca abre Mercado Pago)

- **Autorización del dueño:** «Autorizo el push» (2026-10-20). Antes del push: árbol limpio y
  escáner de datos sensibles con 0 coincidencias.
- **Publicado:** `40602a5` en `claude/taygamestore-production-pfctbn` (avance rápido desde
  `2567a5d`; `git ls-remote` = `40602a5`).
- **Render:** despliegue `dep-dbbn5q59fdbs73ecvmt0` en `live` a las 13:57 UTC. Arranque:
  `métodos de pago` con `mercadoPago: true`, `nequiTransferencia: false`, `nequiPush: false`;
  `correo: false` y `hojaGoogle: false`. Sin registros error/warn/fatal desde el despliegue.
- **GitHub Actions de `40602a5`:** CI (3 navegadores incluidos), CodeQL y «Production smoke check»
  en verde.
- **NO VERIFICADO:** la casilla de Nequi en producción: sigue oculta hasta que el dueño cargue
  `NEQUI_MANUAL_PHONE` y `NEQUI_MANUAL_ENABLED=true` en Render.

### 2026-10-20 · Hoja de Google: pestaña «Compras_LootBar»

- **Pedido del dueño:** reutilizar su hoja de ventas y añadir una pestaña `Compras_LootBar`
  separada de las ventas, sin perder datos, con copia de seguridad previa.
- **Archivo:** el único de hojas de cálculo en su Drive, «TayGameStore · Registro de pedidos»
  (el id no se escribe en el repositorio). Pestañas existentes sin cambios: Resumen, Por
  entregar, Entregas, Reporte diario, Pedidos y Léeme (mismo orden e ids; «Resumen» leído antes y
  después, idéntico).
- **Copia de seguridad:** copia completa en el mismo Drive, titulada «Copia de seguridad
  2026-10-20 · TayGameStore · Registro de pedidos (antes de Compras_LootBar)», con las 6
  pestañas y acceso solo del dueño (sin la cuenta de servicio).
- **Creado:** pestaña `Compras_LootBar` al final (detalle en `docs/google-sheets.md`): validación
  de fecha, ID de LootBar único, referencia `TGS-` y listas; columnas automáticas con aviso de
  protección; resumen de compras dentro de la pestaña (no se creó otra «Resumen»).
- **Prueba con datos ficticios** en una copia temporal (luego enviada a la papelera): 5 compras
  de prueba y 1 fila ficticia en «Entregas». Resultados esperados y obtenidos: costo USD→COP
  0,79 × 4.000 = 3.160; venta 3.800 traída de «Entregas»; ganancia 3.800 − 3.160 − 500 = 140
  contada una sola vez para el pedido con dos compras; margen 3,7 %; avisos «ID de LootBar
  repetido», «Falta la tasa USD→COP» y «Referencia no está en «Entregas»»; resumen 5 / 5.660 /
  4 / 1 / 140 / 270 / 4. En la hoja real la pestaña quedó vacía (resumen en 0).
- **Permisos de la hoja:** sin cambios (el dueño y la cuenta de servicio).
- **NO VERIFICADO:** el cruce con ventas reales: «Entregas» está vacía hasta que el dueño conecte
  la hoja (`hojaGoogle: false`).

### 2026-10-20 · Misión integral: pantalla de entrada «bloqueada» (Brave) y auditoría (local, sin publicar)

- **Pedido del dueño:** auditoría, reparación y hardening; en Brave la página puede quedar en una
  pantalla azul o gris «bloqueada» con `<body class="entry-locked lock">`.
- **Qué pone esas clases:** `entry-locked` viene en el HTML; `showEntryLanding()` añade `lock` al
  arrancar. Es el estado normal de la pantalla de entrada: la tienda (`#app.store-locked`) sigue
  oculta hasta pulsar «Entrar» y elegir invitado o cuenta.
- **Brave Shields (simulado, NO es un Brave real):** motor `@ghostery/adblocker` 2.20.1 en
  Chromium con las 19 listas por defecto del catálogo oficial de Brave (`list_catalog.json`:
  uBlock Origin, Brave, cookies, primera parte, Android e iOS) más EasyList, EasyPrivacy y
  EasyList Spanish (`@eyeo/filterlists` 1.0.103). Resultado: 0 elementos ocultos, 0 peticiones
  bloqueadas, flujo entrada → acceso → invitado completo. Con las listas de Fanboy (no vienen
  activadas en Brave) solo se oculta el botón «Compartir» del comprobante.
- **Escenarios de fallo:** sin almacenamiento, API caída, sin Google Fonts y movimiento reducido:
  la tienda abre. Sin la hoja de estilos: aviso de respaldo con «Recargar» (diseñado). Sin
  JavaScript: botón «Entrar» inerte sin explicación (**corregido**).
- **Causa raíz confirmada (reproducible):** la entrada era una capa fija con `overflow: hidden` y
  contenido centrado. En pantallas bajas el botón quedaba fuera de la pantalla sin forma de
  desplazarse: 740×360 (botón en y = 380–422) y 844×390 (y = 384–426). El estado resultante es
  exactamente `entry-locked lock` con la tienda inaccesible. Pasa en un teléfono en horizontal, con
  zoom o letra grande, o en una ventana baja, en cualquier navegador, Brave incluido.
- **Corregido:**
  - `25-entry-experience.css`: la entrada se desplaza (`overflow: hidden auto`) y se centra con
    márgenes automáticos (centrada si cabe; si no, empieza arriba);
  - `35-brand-logo.css`: con `max-height: 600px`, Tay más pequeño y el pie en el flujo; con
    `max-height: 420px` se oculta la descripción. En pantallas altas no cambia nada (capturas
    visuales idénticas);
  - `bindings.js`: si el diálogo de acceso no llega a verse (un bloqueador lo oculta), «Entrar»
    abre la tienda como invitado en vez de dejar una pantalla vacía;
  - `index.html`: `<noscript>` con instrucciones para Brave Shields cuando los scripts están
    bloqueados, y se oculta el botón inerte;
  - `security.ts`: `X-Frame-Options: DENY` (coherente con `frame-ancestors 'none'`).
- **Medición después:** en 8 tamaños (de 360×640 a 1440×900, letra al 130 % y 160 %, horizontal y
  portátil bajo) «Entrar» queda dentro de la pantalla y se puede pulsar.
- **Pruebas:**
  - e2e nuevas: pantalla baja, bloqueador que oculta el acceso y sin JavaScript; las tres fallan
    sin la corrección y pasan con ella;
  - prueba de cabeceras: `X-Frame-Options` es `DENY` (falla sin el cambio);
  - lint, formato y tipos OK; unitarias y API 304/304; integración 281/281; e2e 72/72; visuales
    3/3.
- **Auditoría de seguridad (local):**
  - `npm audit`: 0 vulnerabilidades (todas y solo producción);
  - escáner de datos sensibles: 0;
  - el paquete público `dist/web` no contiene secretos, cadenas de conexión ni mapas de código;
  - el único `.env*` versionado es `.env.example`;
  - las 28 rutas de `/api/admin` pasan por `requireAdmin`;
  - cabeceras: CSP sin `unsafe-eval`, HSTS de 1 año solo con https, `nosniff`,
    `Referrer-Policy`, `Permissions-Policy`, COOP y CORP;
  - cookies `HttpOnly`, `Secure` (https) y `SameSite=Lax`; sin CORS abierto; errores 500 sin
    detalle al cliente.
- **NO VERIFICADO:**
  - Brave real: no está disponible en este entorno y la descarga desde GitHub fue rechazada
    (403);
  - producción: `onrender.com` está bloqueado por el proxy de esta sesión;
  - si el caso del dueño era exactamente este (horizontal, zoom o ventana baja) u otro: si vuelve
    a pasar tras publicar, hace falta la consola de Brave (F12 → Consola) y el tamaño de la
    ventana;
  - gitleaks no está instalado aquí (sí corre en la CI).

### 2026-10-20 · Publicación de 126191d y fce377b (entrada siempre accesible)

- **Autorización del dueño:** «Autorizo el push» (2026-10-20). Antes del push: árbol limpio,
  blobs iguales a los informados y escáner de datos sensibles con 0 coincidencias.
- **Publicado:** `126191d` (registro de Nequi y de la pestaña `Compras_LootBar`) y `fce377b`
  (entrada accesible en pantallas bajas, aviso sin JavaScript, salida si el acceso no se ve y
  `X-Frame-Options: DENY`). Avance rápido desde `40602a5`; `git ls-remote` = `fce377b`.
- **Render:** despliegue `dep-dbbnsd67bikc73auvpa0` en `live` a las 14:45 UTC. Arranque:
  «Migraciones aplicadas.», `mercadoPago: true`, `nequiTransferencia: false`, `correo: false`,
  `hojaGoogle: false`. Sin registros error/warn/fatal desde el despliegue.
- **GitHub Actions de `fce377b`:** CI con sus 6 trabajos en verde (lint, formato, tipos, esquema,
  unitarias, build, auditoría de dependencias, gitleaks del historial, integración y e2e en
  Chromium, Firefox y WebKit, con las 3 pruebas nuevas de la entrada) y CodeQL en verde.
- **NO VERIFICADO:**
  - «Production smoke check» salió en verde, pero terminó a las 14:44:53, antes de que el
    despliegue nuevo quedara activo (14:45:08): probó la versión anterior;
  - la entrada en un Brave real (pendiente de la prueba del dueño en su teléfono, en horizontal).

### 2026-10-20 · Evidencia de la publicación de 8f24730 (y prueba de producción de fce377b)

- **Render:** despliegue `dep-dbbo8gss728c73bncbpg` de `8f24730` en `live` (terminó 15:10:55 UTC).
- **GitHub Actions de `8f24730`:** CI y CodeQL en verde.
- **Prueba de producción de `fce377b`:** el «Production smoke check» de `8f24730` corrió de
  15:09:56 a 15:10:32 UTC, cuando el despliegue activo todavía era el de `fce377b` (activo desde
  14:45:08 hasta 15:10:55): salió en verde, así que cubre el punto que quedó NO VERIFICADO en la
  entrada anterior. `8f24730` solo cambió el registro: el código en producción es el mismo.
  Después, «Mantener la tienda activa» (15:33) y «Vigilancia y autorreparación» (16:02) también en
  verde sobre `8f24730`.

### 2026-10-20 · Nequi con llave Bre-B, ENVIADO y «¡Envío exitoso!» (local, sin publicar)

- **Pedido del dueño:** «Configuración real de Nequi para TayGameStore» (titular, llave Bre-B,
  total exacto e ID del pedido; pedido pendiente hasta verificar; el dueño confirma, hace la
  recarga manual de Free Fire y marca ENVIADO; el cliente ve «¡Envío exitoso!»). Respuestas del
  dueño: dejar los 5 métodos como están (4 de Mercado Pago + Nequi aparte) y sin QR por ahora.
- **Datos del dueño:** su llave, su celular y su nombre no se escribieron en el código, las
  pruebas, los commits ni este registro. Las pruebas usan valores ficticios (`@tiendaprueba`,
  `@tiendapruebas`, `3001234567`, «Tienda de Prueba(s)»). Publicar la llave es decisión del dueño
  (requisito 19): la carga él mismo en Render.
- **Cambios:**
  - `config/nequi.ts` y `env.ts`: `NEQUI_MANUAL_BREB_KEY` (solo `@` + alfanumérico; se rechaza
    una llave solo de números para no publicar un documento por error); el celular es opcional
    si hay llave. Un valor inválido apaga Nequi sin impedir el arranque ni repetir el valor;
  - `nequi-view.ts`: la cuenta que ve el comprador lleva `brebKey`, `phone` y `holder`, solo en
    su propio pedido Nequi y solo mientras espera pago;
  - tienda: caja de Nequi con total, llave y «Copiar», celular, titular, ID del pedido y aviso de
    pendiente; mensajes de «Seguimiento» según el método (un pedido Nequi nunca menciona Mercado
    Pago); «¡Envío exitoso!» en estado, ruta, historial, comprobante y correo;
  - panel: estado **ENVIADO**, botón «Marcar como ENVIADO» y la referencia del cliente marcada
    «sin verificar».
- **Hoja de Google:** sin cambios de código; la entrega ya agrega «Recarga entregada» en
  «Pedidos» y actualiza la fila del pedido en «Entregas» de forma idempotente. Las etiquetas no
  se cambiaron porque las fórmulas de la hoja las usan.
- **Integración oficial de Nequi para comercios:** la prensa describe «Nequi Conecta» (cobros
  push y QR) y pasarelas integradas (Wompi, Ebanx). El portal oficial no resolvió desde este
  entorno (`ENOTFOUND`): **NO VERIFICADO**. Se mantiene el flujo manual; no se inventó ninguna
  integración y nada marca un pedido como pagado sin la confirmación del dueño.
- **Pruebas (locales, datos ficticios, sin transferencias ni recargas reales):**
  - lint, formato y tipos OK; unitarias y API 305/305; integración 281/281; e2e 73/73
    (`desktop-1280`); visuales 3/3;
  - nuevas: configuración solo con llave y llaves inválidas; vista con llave, celular y titular
    (y que no aparecen en `/api/config` ni en pedidos de Mercado Pago); e2e de la tienda (llave,
    titular, total, ID, pendiente, seguimiento sin Mercado Pago, «¡Envío exitoso!») y e2e del
    panel (aviso sin verificar, monto distinto rechazado, confirmación, «Marcar como ENVIADO»);
  - captura de la caja de Nequi en 360 px y 1280 px revisada a ojo.
- **NO VERIFICADO:**
  - producción: no se publicó (falta la autorización del dueño) y Nequi sigue apagado allí;
  - que la llave real del dueño cumpla el formato `@…` (si no, Nequi queda apagado y el arranque
    lo avisa sin mostrar el valor);
  - qué datos del remitente muestra la app Nequi en un pago recibido por Bre-B desde otro banco;
  - la hoja de Google en producción (sin las variables `GOOGLE_SHEETS_*`).

### 2026-10-20 · Prueba en tiempo real con una copia de la hoja, carga y seguridad (local, sin publicar)

- **Pedido del dueño:** probar la tienda con la hoja «en tiempo real» en una copia (no en la
  original), corregir inconsistencias, soportar muchos usuarios sin lentitud ni pedidos perdidos,
  sin filtrar datos personales ni de pago, que nadie pueda hacerse pasar por el dueño ni cambiar
  la tienda desde el inspector, conectores seguros; y por qué Nequi no aparece en la tienda.
- **Nequi no aparece en producción:** los 3 arranques de hoy en Render dicen
  `nequiTransferencia: false` (Nequi apagado: el grupo solo se muestra si está activo). Falta
  publicar `86fec75` y que el dueño cargue `NEQUI_MANUAL_BREB_KEY`, `NEQUI_MANUAL_HOLDER` y
  `NEQUI_MANUAL_ENABLED=true` en Render (no lo hace un asistente: son sus datos).
- **Copia de la hoja:** copia privada en el Drive del dueño (solo su cuenta; sin la cuenta de
  servicio), con datos ficticios. La hoja original quedó intacta (última modificación 14:01 UTC,
  antes de la prueba). Una primera copia quedó con las fórmulas desplazadas por el fallo de abajo
  y se envió a la papelera (recuperable); la prueba se repitió en una copia nueva.
  - Escenario de 6 pedidos ficticios (Mercado Pago con webhook repetido, Nequi, entrega fallida
    y reanudada, aviso rechazado, devolución y caída de Google): «Resumen», «Por entregar»,
    «Reporte diario» y «Compras_LootBar» cuadran con la base en cada fase; 0 filas repetidas.
  - **Fallo grave corregido:** `INSERT_ROWS` desplazaba los rangos de las fórmulas
    («Pedidos!B2:B» → «B7:B») y todas las pestañas automáticas mostraban 0. Ahora `OVERWRITE`;
    prueba unitaria que falla con el modo anterior.
  - En la copia (no en el original): recálculo cada minuto y textos de «Por entregar»/«Léeme»
    con Nequi y ENVIADO. Pasarlos al original requiere autorización del dueño.
- **Carga (local, 300 simultáneos, 40 % Nequi, dueño virtual, ataques a la vez):**
  - sin integraciones: 27.783 peticiones en 56 s, 0 errores 5xx, 0 fallos, 9/9 defensas;
  - con hoja y correo de 1,5 s y cuota de Google 60/min, antes: las peticiones esperaban a la hoja
    y al correo (p95 hasta 5,2 s) y cada 429 gastaba un intento (filas que terminarían fallidas);
  - corregido: espera máxima `NOTIFY_INLINE_WAIT_MS` (300 ms), 429 sin gastar intentos, filas de
    la hoja de a una con tope de 40 s por pasada, y sin escritura al reclamar/liberar. Después:
    p95 1,2–1,9 s, 0 errores 5xx, 0 fallos, cola sin fallidas ni repetidas.
- **Seguridad:** las pruebas existentes cubren suplantación del dueño (contraseña + TOTP, huella,
  bloqueo tras 5 fallos, cookie inventada, cliente con sesión → 404), manipulación desde el
  inspector (precio en el HTML, campos inventados, panel oculto), webhooks falsos (firma
  `x-signature` y consulta del pago a Mercado Pago), CSRF, enumeración y XSS en el panel; todas
  en verde. Nuevo: neutralizar fórmulas en el texto libre de la hoja (inyección CSV). `npm audit`:
  0 vulnerabilidades.
- **Pruebas:** lint, formato y tipos OK; unitarias y API, integración, e2e y visuales (cifras en
  el commit). Pruebas nuevas: modo OVERWRITE, 429 sin gastar intentos, hoja lenta que no frena la
  petición, tope de la pasada e inyección CSV (cada una falla sin su corrección).
- **NO VERIFICADO:**
  - capacidad en producción: Render está en el plan **gratuito** (512 MB, CPU reducida, se duerme
    sin visitas); las cifras son locales. No se hizo carga contra producción;
  - si Google sube la cuota de 60 escrituras/min de la cuenta de servicio;
  - la hoja en producción (faltan las variables `GOOGLE_SHEETS_*` y rotar la llave expuesta);
  - la seguridad de los conectores de Claude (Gmail, Drive, etc.): se autorizan en claude.ai.

### 2026-10-20 · Publicación de 86fec75 y 5fe6df6 (Nequi con llave Bre-B, ENVIADO, hoja y cola de avisos)

- **Autorización del dueño:** «Autorizo el push» (2026-10-20). Antes del push: árbol limpio, sin
  cambios nuevos en el remoto, exactamente `86fec75` y `5fe6df6` por publicar y escáner de datos
  sensibles con 0 coincidencias. Avance rápido `8f24730..5fe6df6`; `git ls-remote` = `5fe6df6`.
- **Render:** despliegue `dep-dbbq5v3m8hqs7386g540` en `live` a las 17:22:10 UTC. Arranque de la
  instancia nueva (17:22:02): `mercadoPago: true`, `nequiTransferencia: false` (Nequi sigue
  apagado hasta que el dueño cargue sus variables), `correo: false`, `hojaGoogle: false`. Sin
  registros error/warn/fatal desde las 17:20. Sin migraciones nuevas en estos commits.
- **GitHub Actions de `5fe6df6`:** CI con sus 6 trabajos en verde (lint, formato, tipos, esquema,
  unitarias, build, auditoría de dependencias, gitleaks del historial, integración y e2e en
  Chromium, Firefox y WebKit) y CodeQL en verde.
- **NO VERIFICADO:**
  - «Production smoke check» salió en verde (17:21:00–17:22:27), pero parte de sus sondeos llegaron
    a la instancia anterior; la nueva respondió 200 a `GET /` a las 17:22:11. La próxima ronda
    programada lo confirmará sobre la versión nueva;
  - Nequi en producción: sigue apagado (faltan `NEQUI_MANUAL_BREB_KEY`, `NEQUI_MANUAL_HOLDER` y
    `NEQUI_MANUAL_ENABLED=true`, que carga el dueño);
  - la hoja de Google en producción (sin las variables `GOOGLE_SHEETS_*`).

### 2026-10-20 · Nequi encendido en producción (llave @ + celular aceptada)

- **Autorización del dueño (2026-10-20):** «hazlo todo por tu cuenta … y además este en producción
  y en función y este encendida y solucioname a render». Cubre este commit, su push y las
  variables de Nequi en Render.
- **Causa de que Nequi no se pudiera encender:** la llave Bre-B del dueño es `@` + celular (10
  dígitos que empiezan por 3) y la validación rechazaba toda llave hecha solo de números. Con esa
  llave Nequi habría quedado apagado aunque se cargaran las variables. Ahora se acepta esa forma
  (ninguna cédula colombiana la tiene: las de 10 dígitos empiezan por 1); las demás llaves solo
  de números siguen rechazadas. Prueba nueva en `tests/unit/nequi-config.test.ts` (falla sin la
  corrección).
- **Render (variables, modo «merge»: no se tocó ninguna otra):** `NEQUI_MANUAL_ENABLED`,
  `NEQUI_MANUAL_BREB_KEY` y `NEQUI_MANUAL_HOLDER`, con los datos comerciales que el dueño dio para
  esto. Los valores no se escriben en este registro, en commits, en archivos ni en informes.
- **Exposición:** `/api/config` solo dice si Nequi está activo. La llave y el titular solo los ve
  el comprador de su propio pedido Nequi mientras espera pago; no van a correos, hoja ni registros.
  El dueño confirma cada pago en su app; nada se marca pagado solo.
- **Pruebas:** lint, formato y tipos OK; unitarias 308/308, integración 284/284; escáner de datos
  sensibles 0 coincidencias.
- **Verificación en producción:**
  - push `dcd273e..271ba43`; `git ls-remote` = `271ba43`;
  - el cambio de variables lanzó un despliegue con el código anterior (`dep-dbbqsgbl9sls73f4q9u0`):
    arrancó con Nequi apagado y el aviso no repitió el valor (la protección funcionó);
  - `dep-dbbqth4s728c73co5e1g` (`271ba43`) en `live` a las 18:12:14 UTC; arranque:
    `mercadoPago: true`, `nequiTransferencia: true`;
  - 18:14:45: un pedido real se creó (201) y se pasó a Nequi (200); en la base quedó
    `nequi_manual` y `AWAITING_PAYMENT`. No se tocó;
  - sin registros error/warn/fatal desde las 18:11 y ningún registro con los campos de la cuenta;
  - CI 6/6 en verde (también e2e en Chromium, Firefox y WebKit), CodeQL en verde.
- **NO VERIFICADO:** la respuesta de `/api/config` y la tienda vistas desde fuera: este entorno no
  puede abrir el dominio de producción (el proxy lo bloquea). Lo cubren el código, el arranque y el
  pedido real de las 18:14.

### 2026-10-20 · Hoja de Google: pestaña «Pagos pendientes» (Nequi)

- **Pedido del dueño (2026-10-20):** «quiero que en el excel en google sheet aplica osea Pago
  pendiente del usuario a mi en el excel», con los dos datos que avisa el cliente (4 últimos
  dígitos de su cuenta y referencia de su comprobante).
- **Código (sin publicar):** canal `sheets_pending` en la cola (migración 0022, solo amplía la
  lista permitida), una fila por pedido Nequi en «Pagos pendientes» que se reescribe al elegir
  Nequi, avisar, confirmar, rechazar, devolver y vencer. Solo pedidos Nequi. El aviso del cliente
  nunca cuenta como pago. Sin correo, nombre ni ID del jugador; texto libre protegido contra
  inyección CSV. Pestaña configurable con `GOOGLE_SHEETS_PENDING_TAB` (distinta de las otras).
- **Hojas de Google (por el conector de Claude, con la cuenta del dueño):**
  - copia de prueba: pestaña nueva con encabezados, formato y 5 filas ficticias generadas con
    `pendingPaymentRow` (una por estado). Leídas de vuelta: «0421» conserva el cero, el total
    se ve como `$18.000` y una referencia que empieza por «-» queda como texto;
  - hoja original: solo la pestaña nueva con encabezados, formato y colores por estado, **sin
    datos**. Las demás pestañas no se tocaron («Resumen» leído después: igual).
- **Pruebas:** unitarias 311/311, integración 288/288 (4 nuevas: flujo completo elegir →
  avisar → rechazar → avisar → confirmar, vencimiento, Mercado Pago nunca aparece, Google caído
  y reintento; cada disparador probado por mutación), e2e 73/73; lint, formato y tipos OK.
- **NO VERIFICADO:** escrituras reales de la tienda en la hoja: en producción la hoja sigue sin
  conectar (faltan las variables `GOOGLE_SHEETS_*` y rotar la llave expuesta). El conector de
  Claude escribe como USER_ENTERED; el modo RAW de la tienda se emuló con apóstrofos.

### 2026-10-21 · Hoja de Google: llave en una sola variable y configuración que no tumba la tienda

- **Pedido del dueño (2026-10-20):** «gestiónamelo y encárgate de la hoja de Google sin
  conectar… hazlo por tu cuenta para que funcione». Cubre este commit, su push y cargar en
  Render el id de la hoja (no es un secreto).
- **Lo que no se puede hacer desde aquí:** crear o borrar llaves de la cuenta de servicio
  (este entorno no tiene acceso a Google Cloud: `gcloud` sin cuentas) y, por las reglas del
  proyecto, ninguna llave pasa por el chat ni por un comando. El dueño crea la llave y la pega
  en Render.
- **Cambio:** `src/server/config/sheets.ts`. La llave se acepta como el archivo JSON completo
  (`GOOGLE_SHEETS_CREDENTIALS_JSON`) además de correo + llave por separado. Una variable de la
  hoja incompleta o mal escrita ya no impide arrancar: la hoja se apaga y el arranque dice el
  motivo sin valores («Hoja de Google apagada…»); conectada, dice la cuenta de servicio.
- **Estado de la hoja original (solo lectura):** compartida solo con el dueño y con
  `tienda-hoja@taygamestores.iam.gserviceaccount.com` (Editor); sin filas de pedidos todavía.
- **Pruebas:** unitarias 312/312 (nuevas: variables incompletas o mal escritas sin caída y sin
  valores en el motivo; llave JSON pegada con espacios y saltos; correo que no coincide; la de
  JSON falla sin su código), integración 288/288, e2e 73/73; lint, formato y tipos OK.
- **Ronda diaria 2026-10-21 00:52 UTC (solo lectura):** Render `a0348fd` en vivo sin
  error/warn/fatal desde 2026-10-20 18:56; «Vigilancia y autorreparación» y «Mantener la tienda
  activa» en verde; sin issues de incidente; Neon 40,5 CU-h usadas (proyección ≈ 71 de 100);
  0 pagados por entregar, 0 en revisión, 0 por reembolsar, 0 reseñas pendientes, 0 avisos
  fallidos. Un aviso Nequi «Ya transferí» sin verificar desde hace ≈ 16 h (TGS-TKRX3MBM03,
  11.000 COP): lo verifica el dueño en su app Nequi y lo confirma o rechaza en el panel.
- **Publicación de `474a343` (2026-10-21):** Render `dep-dbcal0on74is73ftv3tg` en vivo
  (12:06 UTC) tras cargar `GOOGLE_SHEETS_SPREADSHEET_ID`; arranque con «métodos de pago»
  (Mercado Pago y Nequi por transferencia encendidos) y «Hoja de Google apagada» con el motivo
  «falta la llave de la cuenta de servicio» (sin valores); sin error ni fatal. CI, CodeQL y prueba
  de producción en verde. NO VERIFICADO: escritura real en la hoja original (falta la llave, que
  crea el dueño).

### 2026-10-21 · Nombre de usuario para cada cliente y pestaña «Usuarios» en la hoja

- **Pedido del dueño:** «que haya un apartado … si hay usuarios que ingresan modo invitado les
  otorgarán un usuario al azar … o también que estén vinculado con Google sea igual y se pueda
  modificar el nombre del usuario de la cuenta en mi tienda y se registren en el excel».
- **Cambio:** tabla `customer_profiles` (migración 0023, solo agrega), servicio
  `src/server/services/profiles.ts`, rutas `POST /api/profile` (lo crea al azar) y
  `PATCH /api/profile` (cambiarlo), menú «Cambiar nombre de usuario» y su ventana, y pestaña
  «Usuarios» (`GOOGLE_SHEETS_USERS_TAB`) escrita por una cola propia con reintentos y reserva.
  La cabecera muestra el nombre de usuario (ya no el nombre real de la cuenta); el invitado abre
  el menú de cuenta.
- **Datos y exposición:** a la hoja solo va el alias, el tipo de cliente y fechas; nunca correo,
  nombre real, IP ni cookie. El alias no se publica en la tienda. Política de privacidad
  actualizada. Reglas anti-suplantación (admin, TayGameStore, Tay, TGS, soporte, Nequi…, también
  con números) y sin números de 7+ cifras (celular o documento).
- **Anti-abuso:** CSRF global, límites por IP (30 y 10 peticiones / 10 min), tope de 20
  perfiles de invitado nuevos por conexión al día, validación en servidor y en la base (CHECK).
- **Hoja original:** se creó la pestaña «Usuarios» con encabezados y formato (sin filas), con
  protección de aviso; también se protegió «Pagos pendientes» (no tenía) y se describieron las
  dos en «Léeme». En la copia de prueba: la pestaña con 3 filas ficticias generadas con el código.
- **Pruebas:** unitarias 325/325, integración 303/303 (15 nuevas, entre ellas concurrencia y
  reintentos; mutaciones de la reserva, la pasada extra, los nombres reservados y el tope por IP
  detectadas), e2e 74/74, visuales 3/3 (capturas 03 de escritorio y tableta regeneradas: solo
  cambia el nombre en la cabecera); lint, formato, tipos y `drizzle-kit check` OK; escáner 0.
- **Publicación (2026-10-21):** el dueño autorizó el push («Autorizo el push»). `927b846` en
  GitHub; Render `dep-dbcbm7uq1p3s73broktg` en vivo (13:17 UTC); migración 0023 aplicada (24
  migraciones; tabla `customer_profiles` creada; el rol de la aplicación puede insertar y no
  puede borrar). Arranque: Mercado Pago y Nequi por transferencia encendidos; «Hoja de Google
  apagada» por falta de la llave (esperado); sin error ni fatal desde el despliegue. CI 6/6 en
  verde (lint, tipos, unitarias, integración, e2e en Chromium, Firefox y WebKit, gitleaks),
  CodeQL y prueba de producción en verde.
- **Hoja conectada a la tienda:** las dos cargas de `GOOGLE_SHEETS_SPREADSHEET_ID` en Render
  (2026-10-19 y 2026-10-21) usaron la hoja de producción del dueño; la copia de prueba nunca se
  conectó y no se conectará (pedido del dueño: «No quiero que la conectes el excel de copia de
  pruebas»).
- **NO VERIFICADO:** un visitante real creando o cambiando su nombre en producción (todavía 0
  perfiles; el flujo está cubierto por las pruebas e2e de CI) y la escritura en la pestaña
  «Usuarios» (falta la llave de la hoja).

### 2026-10-21 · Revisión profunda pedida por el dueño (producción, GitHub, Render, Neon y código)

- **Pedido:** «revisa en github si presenta fallos o errores … no me borres todo … si presenta
  lo que está mal corrígelo no lo borres». No se borró nada (ramas, PR, datos ni archivos).
- **Producción:** Render `taygamestore` (plan gratuito, Virginia) en vivo con `db556df`, despliegue
  automático desde `claude/taygamestore-production-pfctbn`. Últimas 24 h: 0 respuestas 5xx y 0
  registros de error o fatal. Arranque: Mercado Pago y Nequi por transferencia encendidos; correo,
  eventos externos y hoja de Google apagados (faltan credenciales del dueño).
- **GitHub:** las 60 ejecuciones de las últimas 11 h en verde (CI, CodeQL, prueba de producción,
  vigilancia, mantener activa, diagnóstico diario). «Tareas programadas» se omite a propósito
  (respaldo opcional desactivado). Issues abiertos: solo las 8 listas de pasos del dueño. Sin
  incidentes.
- **Neon:** 0 avisos pendientes o fallidos, 0 pedidos vencidos sin cerrar, 0 reembolsos
  pendientes, historial sellado al día, 10 MB. 9 sesiones vencidas hace menos de 7 días: la
  limpieza las conserva 7 días a propósito.
- **Problema corregido:** dependencias de producción con correcciones de seguridad sin aplicar
  (PR de Dependabot abierto desde el 2026-10-19): `fastify` 5.12.7 (versión de seguridad
  GHSA-389g-gv7q-r4x8), `nodemailer` 10.1.7, `zod` 4.6.7, `@fastify/helmet` 13.2.0, más parches de
  desarrollo. Pruebas: lint, formato, tipos, unitarias 325/325, integración 303/303, e2e 74/74,
  visuales 3/3, `drizzle-kit check` y escáner 0; `npm audit` 0 vulnerabilidades.
- **Para el dueño (no se puede desde aquí):** el servicio de Render no tiene ruta de salud
  (`render.yaml` dice `/api/ready`); recomendación: poner `/api/health` en Render → Settings →
  Health Check Path (no consulta la base, así no impide que Neon se suspenda).
- **Sin tocar, a propósito:** 13 ramas viejas de arreglos ya integrados (`fix/*`, `ops/*`,
  `security/*`) y el PR de Dependabot de herramientas de desarrollo, por subir Playwright a 1.64
  (cambia los navegadores de prueba: se hará aparte).


### 2026-10-25 · Auditoría A–P, ronda de mantenimiento y landing (pedido del dueño)

- **Pedidos:** «PROMPT MAESTRO DEFINITIVO» (auditoría total con informe A–P) y «Aprende de este
  creador de contenido (@geradevtech en TikTok) … mejorar el landing page y mi sitio web». Las dos
  rondas automáticas del 2026-10-21 llegaron con 3 días de retraso: se hizo una sola ronda con el
  estado de hoy.
- **Ronda (solo lectura):** Render en vivo con `aba648b`; 2026-10-21 → 2026-10-25 sin 5xx ni
  errores, solo avisos «Hoja de Google apagada». GitHub: flujos programados en verde, sin issues
  de incidente. Neon: ~45,6 CU-h del período (proyección ~65 de 100). Pedidos: 0 pagados por
  entregar, 0 en revisión, 0 reembolsos, 0 reseñas por revisar. **URGENTE:** aviso de transferencia
  Nequi de `TGS-TKRX3MBM03` (11.000 COP) sin revisar; el pedido venció el 2026-10-21. Correo y hoja
  de Google apagados (faltan credenciales); 14 perfiles esperan la hoja.
- **Auditoría:** informe `docs/seguridad/AUDITORIA-2026-10-25.md`. Corregido en local con pruebas
  que fallaban antes: A-01 código TOTP reutilizable (migración 0024), A-02 IP en claro en los
  registros, A-03 textos técnicos y accesos apagados visibles, A-10 dependencias. Abierto:
  respaldos de Neon sin programación (A-04, necesita autorización) y ruta de salud de Render
  (A-05, dueño).
- **Creador de TikTok:** los videos no se pueden reproducir desde aquí (Firecrawl no admite
  TikTok y el navegador de pruebas no confía en el certificado del proxy; no se desactivó TLS).
  Se leyeron el perfil público y los títulos: su contenido de diseño web recomienda trabajar con
  un sistema de diseño, la skill «UI UX Pro Max» para landings y las reglas de diseño y animación
  de Emil Kowalski (fuente original revisada: emilkowal.ski). No se instaló ninguna skill de
  terceros en el repositorio (riesgo de cadena de suministro); se aplicaron las reglas.
- **Errores encontrados en la landing y corregidos:** propuesta de valor vaga en la bienvenida;
  jerga en inglés en 19 etiquetas («GAMER COMMERCE», «NEXUS CATALOG», «ORDER DESK», «OAuth
  2.0»…); el acceso mostraría «No configurado» para Facebook en producción; textos que solo
  nombraban Mercado Pago cuando Nequi también cobra; precios con «COP» partido en otra línea.
  Ahora: precio «desde» y medios de pago reales en la bienvenida, etiquetas en español claro,
  accesos apagados ocultos y precios en una línea con cifras tabulares. Sin quitar secciones ni
  animaciones.
- **Pruebas:** lint, formato y tipos OK; unitarias 327/327; integración 304/304; e2e 74/74;
  visuales 3/3 (capturas 01, 02 y 03 regeneradas tras revisarlas); `drizzle-kit check` OK;
  escáner 0; `npm audit` 0. e2e con el código final: 4 ejecuciones completas; 1 terminó con 1
  fallo cuyo nombre no quedó registrado y las otras 3 dieron 74/74 (dos con registro completo
  guardado). Causa de ese fallo: NO VERIFICADO (no se volvió a presentar).
- **NO VERIFICADO:** la tienda publicada en un navegador real (se verificó en local con la misma
  configuración pública de producción); Firefox y WebKit (solo en CI).
- **Sin publicar:** commit local; el push despliega en Render y aplica la migración 0024, así que
  espera la autorización explícita del dueño.

### 2026-10-25 · Acceso intacto e interfaz más legible (pedido del dueño)

- **Pedido:** «Los logins no me lo toques … no quiero que lo eliminen y siga funcionando
  correctamente el inicio de sesión de Google y además quiero que mejore interfaces visuales».
- **Acceso restaurado:** se deshizo todo lo que el commit local `b5ac9e3` cambiaba en el acceso
  (ocultar proveedores apagados, textos de la ventana). `features/account.js` y la ventana de
  acceso son idénticos a `aba648b`; la prueba visual «02-acceso» pasa contra las capturas
  originales en los 3 tamaños, sin regenerarlas.
- **Google verificado:** pruebas de acceso 19/19 (Google OIDC con state, nonce y PKCE; Facebook).
  En producción, `/auth/google` lleva a `accounts.google.com` con PKCE S256, `state`, `nonce` y la
  dirección de retorno `/auth/google/callback` de la tienda (no se completó ningún inicio de
  sesión).
- **Interfaz (medida en un celular táctil de 360 px):** los botones ya medían 44 px en pantallas
  táctiles; el problema real eran 259 textos de 11 px. Ahora hay un sistema de tipografía con dos
  variables: `--fs-2xs` (texto que se lee, 12 px) y `--fs-label` (rótulos en mayúsculas e
  insignias, 11 px). Se cambiaron 116 declaraciones fuera de las capas del acceso y de las
  ventanas (`21-auth.css`, `15-modals.css`), que no se tocaron. Además: el precio no se parte y
  «Disponible» baja si no cabe; los botones de compra se hunden al presionarlos (sin movimiento si
  el sistema lo pide); «¿Dónde encuentro mi ID?» se puede tocar en toda su fila.
- **Fallos intermitentes explicados:** el fallo «sin identificar» de la ronda anterior venía de
  dos carreras en las pruebas e2e nuevas, no de la tienda (precios leídos antes de pintarse y un
  código TOTP recalculado tras cambiar de bloque de 30 s). Ambas corregidas; la del precio
  detecta la mutación «desde = el más caro».
- **Pruebas:** lint, formato y tipos OK; unitarias 327/327; integración 304/304; e2e 74/74 en 3
  ejecuciones completas seguidas con registro guardado; visuales 3/3 (01 y 03 regeneradas tras
  revisarlas en celular y escritorio; 02 «acceso» sin cambios); escáner 0.

### 2026-10-25 · Seguridad de PHP (pedido del dueño)

- **Pedido:** «ten seguro la seguridad de php en mi sitio web efectiva».
- **Hecho comprobado:** la tienda no usa PHP. No hay archivos `.php` ni `composer.json` en el
  repositorio, y Render ejecuta Node (`runtime: node` en `render.yaml`). No hay intérprete de PHP
  que se pueda atacar; lo que llega son escáneres que buscan WordPress, phpMyAdmin o Laravel.
- **Producción (una sola petición de prueba, solo lectura):** `/index.php` responde 404 en JSON
  («Recurso no encontrado»), no la tienda ni un error del servidor, con CSP, HSTS, `nosniff` y
  `X-Frame-Options: DENY`, sin `X-Powered-By`. Registros de Render del 18 al 25 de octubre: sin
  sondeos PHP en ese periodo.
- **Brecha encontrada (A-11, baja):** el escudo ya bloqueaba `.php`, `wp-login`, `xmlrpc` o
  `phpmyadmin`, pero no reconocía 16 formas más (`.phtml`, `.phar`, `.phps`, `.pht`, `.inc`,
  `.user.ini`, `/phpinfo`, `%00`, `php://`, `composer.lock`, `vendor/composer`, `web.config`,
  `_ignition`, `_profiler`, `telescope`, `storage/logs`). Se agregaron a `services/shield.ts`.
- **Comprobado en local:** una página inexistente normal no suma; `.phtml` + `laravel.log`
  bloquean la IP (las siguientes peticiones reciben 403).
- **Pruebas:** lint, formato y tipos OK; unitarias y API 385/385 (16 sondeos nuevos y 3 rutas
  legítimas más); integración 304/304 en dos ejecuciones completas seguidas (una ejecución
  anterior falló al preparar el primer archivo, `admin-access`; no se repitió ni completo ni
  aislado; causa NO VERIFICADA porque no se guardó el error); e2e 74/74; escáner 0.
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-25 · Mejor diseño UI/UX en celular (pedido del dueño)

- **Pedido:** «Ejecute y aplica un mejor desing en UI/UX».
- **Medición antes (Playwright + axe, servidor local de pruebas):** celular táctil de 360 px,
  10.470 px de alto (13,4 pantallas); escritorio 1280 px, 5.749 px. Axe: 2 avisos (orden de
  títulos en el panel «LIVE STORE» y la burbuja de soporte fuera de una región).
- **Fallo real encontrado:** en las tarjetas de producto el «+» de la cantidad quedaba cortado.
  Con pantalla táctil los botones miden 44 px pero la cantidad vivía en media tarjeta (63 px a
  360 px): 7 px cortados a 360 px, 17 px a 320 px, 3 px a 390 px. Con ratón, 20 px a 320 px.
- **Cambios (`styles/layers/40-ux-pulido.css`, `index.html`, `catalog.js`, `invoice.js`):**
  la cantidad baja a su propia fila cuando no cabe (0 px cortados de 320 a 1280 px, táctil y
  ratón); el pedido vacío en celular y tableta muestra solo cabecera, total y una nota (la
  sección pasa de 1.982 a 1.600 px); los 4 pasos del inicio en 2 × 2; «Opiniones» sin reseñas
  con un solo aviso en celular; título del panel `h3` → `h2` (mismo estilo) y la burbuja de
  soporte como `<aside>` con nombre; los botones − y + nombran el paquete para lectores de
  pantalla («Aumentar cantidad de …», como en el carrito).
- **Descartado con medición:** pasar «Entrega» a una columna no acortaba la página; plegar los
  formularios «Consultar un pedido» y «Verificar comprobante» se dejó fuera (los enlaces
  `#consultar-pedido` y el relleno automático desde el enlace privado dependen de que estén
  abiertos).
- **Acceso intacto:** las capturas 01 «entrada» y 02 «acceso» pasan sin regenerarse en los 3
  tamaños; `features/account.js`, `15-modals.css` y `21-auth.css` sin cambios.
- **Después:** celular 10.142 px; escritorio igual (5.749 px, captura 03 de escritorio sin
  cambios); axe 0 avisos en celular y escritorio.
- **Pruebas:** lint, formato y tipos OK; unitarias y API 385/385; e2e 75/75 (nueva: «las
  tarjetas de producto muestran completos los botones de cantidad», en 7 tamaños táctil y
  ratón; sin la corrección falla con 6 botones cortados en cada tamaño estrecho); visuales 3/3
  (03 de celular y tableta regeneradas tras revisarlas); escáner 0. Integración no se volvió a
  correr: este cambio no toca el servidor.
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-25 · Cumplimiento legal y accesibilidad (pedido del dueño)

- **Pedido:** volver al diseño publicado; páginas de privacidad, términos, cookies y reembolsos;
  consentimiento; solo datos necesarios; analítica y terceros; accesibilidad (texto alternativo,
  contraste, teclado, etiquetas); sin reseñas falsas ni afirmaciones sin respaldo; datos del
  negocio; derechos de autor; leyes de Colombia y otros riesgos.
- **Diseño:** se deshicieron con commits de reversión (sin reescribir el historial) los dos
  commits locales de Facetas y movimiento; se conservan las correcciones táctiles.
- **Hecho y evidencia:** ver `docs/legal/INFORME-CUMPLIMIENTO-2026-10-25.md` (normas, cambios,
  axe 0 avisos, contraste medido píxel a píxel, teclado, 0 peticiones a terceros, 0 reseñas en
  producción, imágenes propias y fuentes OFL).
- **Datos del dueño:** términos y privacidad muestran los mismos campos que antes; cookies y
  reembolsos no muestran nombre, documento, dirección ni WhatsApp (prueba e2e). Producción
  (solo lectura): términos y privacidad sin marcadores pendientes.
- **Pruebas:** formato, lint y tipos OK; unitarias y API 385/385; integración 304/304; e2e 76/76;
  visuales 3/3 (01 y 03 regeneradas tras revisarlas; 02 «acceso» idéntica); escáner, ver commit.
- **Para el dueño:** R1 NIT y dirección (Ley 1480 art. 50) frente a no publicar el documento;
  R2 `LEGAL_DELIVERY_TIME` dice «inmediata» y la entrega es manual; R3 etiquetas «Top ventas» y
  «Popular»; R5 ventana de acceso (etiqueta del «×» y aviso de privacidad) espera su permiso.
- **Sin publicar:** commits locales. El push despliega en Render; espera la autorización del dueño.


### 2026-10-27 · Tienda con acabado profesional (pedido del dueño)

- **Pedido:** el lienzo de diseño (opciones «Mostrador» y «Tablero») le pareció poco
  profesional y no una página real; quiere una tienda que funcione y dé buena experiencia.
- **Hecho:** en la tienda real, sin tocar el acceso (`#loginModal`, `account.js`,
  `15-modals.css`, `21-auth.css`): arte por paquete en las tarjetas, banner de promoción con
  imagen y barra de compra fija en el celular que lleva al siguiente paso. Capa nueva
  `41-tienda-pro.css`; JS en `catalog.js`, `cart.js` y `bindings.js`.
- **Imágenes:** 7 WebP generadas con IA (Gamma) para la tienda, sin marcas ni metadatos; uso
  comercial según los términos de Gamma: NO VERIFICADO (informe legal §4).
- **Pruebas:** lint, formato y tipos OK; unitarias y API 385/385; e2e 77/77 con axe (nueva:
  arte de los 6 paquetes, barra oculta en escritorio, visible en celular con «1 paquete» y el
  total, y su botón lleva al UID); visuales 3/3 (solo la 03 regenerada tras revisarla; 01 y 02
  idénticas); escáner 0 (árbol, compilado, ignorados e historial). Integración no se volvió a
  correr: el cambio no toca el servidor.
- **Vista previa:** compilada con el simulador (nada se cobra) y comprobada en local: 6
  imágenes cargadas, barra con el total, foco en el UID, cookies/reembolsos/términos 200, sin
  errores de consola. Publicada como artefacto privado en el mismo enlace de «Tienda
  TayGameStore»; su visualización dentro de claude.ai: NO VERIFICADO. Las páginas legales de la
  vista previa solo llevan marcadores `[COMPLETAR:…]`, ningún dato del dueño.
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-27 · Marca propia: tipografía, logo, íconos, bienvenida y comprobante (pedido del dueño)

- **Pedido:** tipografía, texto y tamaños unificados y no genéricos; logo de alta calidad; íconos;
  una bienvenida innovadora y propia; mejor comprobante; botones que se adapten a cada pantalla;
  que no se vea vacío ni deprimente.
- **Medido antes:** unos 28 tamaños de letra distintos, 213 textos en 12 px y ~90 en 11–11,5 px;
  13 alturas de botón (20 a 58 px); bienvenida casi toda en negro.
- **Hecho:** capas `42-marca.css`, `43-bienvenida.css` y `44-comprobante.css`; fuentes Unbounded e
  Instrument Sans (OFL, servidas por la tienda); Tay, símbolo, ícono de app y logotipo en SVG
  (`src/web/public/brand`, `tools/marca/logotipo.py`); imagen social, ícono de app y favicon
  regenerados; íconos de dos tonos; bienvenida con vitrina de paquetes (datos del catálogo);
  comprobante en pantalla y JPG/PDF con el mismo diseño de recibo; páginas legales con la misma
  letra.
- **Acceso intacto:** el marcado de `#loginModal` y el símbolo `icon-shield` son idénticos al
  commit anterior (comparado); la ventana conserva Oxanium y Plus Jakarta Sans. La captura 02
  pasó sin cambios en los 3 tamaños.
- **Fallo encontrado y corregido por las pruebas:** sin JavaScript (p. ej. Brave Shields) el
  botón «Entrar» quedaba visible e inerte por especificidad CSS; el aviso `noscript` vuelve a
  ocultarlo.
- **Pruebas:** lint, formato y tipos OK; unitarias y API 385/385; e2e 78/78 con axe (nueva: la
  vitrina de la bienvenida muestra cantidad y precio del catálogo y su botón abre el acceso);
  visuales 3/3 (01 y 03 regeneradas tras revisarlas; 02 idéntica); sin desbordamiento horizontal
  de 320 a 1920 px; escáner 0. Integración no se volvió a correr: el cambio no toca el servidor.
- **Vista previa:** publicada en el mismo artefacto privado «Tienda TayGameStore» (nada se cobra);
  comprobada en local sin errores de consola. Su visualización dentro de claude.ai: NO VERIFICADO.
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-27 · Inicio animado e interactivo (pedido del dueño)

- **Pedido:** al entrar a la tienda, una carga o presentación y luego el acceso, «como está
  publicada» pero con animación interactiva y un diseño más vivo y profesional.
- **Situación publicada (código de la rama en GitHub):** la pantalla de carga existía pero quedaba
  tapada por la bienvenida y se ocultaba sin verse; se entraba directo a la bienvenida.
- **Hecho:** `#tgsIntro` (presentación y transición), `js/store/features/intro.js` (progreso
  ligado a `state.catalogStatus`, una vez por sesión, saltable, se cierra si se abre la tienda),
  `js/effects/bienvenida.js` (puntero: paralaje, mirada de Tay, destellos, botón magnético) y
  `45-inicio.css`. La bienvenida queda `inert` mientras se ve la presentación.
- **Acceso intacto:** el marcado de `#loginModal` es idéntico al commit anterior (comparado); solo
  cambia cuándo se abre (tras la transición). Captura 02 sin cambios.
- **Pruebas:** lint, formato y tipos OK; unitarias y API 385/385; e2e 79/79 (nueva, con
  movimiento: presentación visible, progreso anunciado, saltar, no se repite en la sesión,
  transición y acceso); visuales 3/3 sin regenerar (con movimiento reducido no hay presentación);
  escáner 0. Integración no se volvió a correr: el cambio no toca el servidor.
- **Vista previa:** publicada en el mismo artefacto privado; comprobada en local sin errores de
  consola. Su visualización dentro de claude.ai: NO VERIFICADO.
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-27 · Nequi, compartir el comprobante y burbujas de soporte (pedido del dueño)

- **Pedido:** «falto nequi y ademas compartir el comprobante y el soporte flotante el whatzap y
  correo».
- **Causas encontradas:** (1) la vista previa no ofrecía Nequi: su simulador no tenía
  `paymentMethods` ni las rutas de Nequi; (2) «Compartir» estaba oculto salvo en navegadores con
  Web Share de archivos (no aparecía en computador) y la vista previa nunca emitía comprobantes,
  así que JPG/PDF/Compartir quedaban inactivos; (3) en la vista previa WhatsApp no tenía número y
  solo salía la burbuja de correo. En la tienda real el código de Nequi y de las burbujas no
  cambió.
- **Hecho (tienda):** `#shareBtn` visible siempre y activo con comprobante; con Web Share comparte
  el JPG y un texto (número, pedido, total, código de verificación); sin Web Share descarga el JPG
  y muestra `#sharePanel` (WhatsApp `wa.me/?text=` sin número, correo `mailto:?`, copiar). Ícono
  `icon-share`. Solo datos del propio comprobante: ningún dato del dueño ni del pago.
- **Hecho (vista previa, `tools/preview/shim.js`):** Nequi con llave `@tay-demo` y titular «Titular
  de ejemplo» (ficticios), rutas `/nequi`, `/payment-method` y `/nequi/report` con las mismas
  reglas del servidor (un pedido de Nequi nunca abre Mercado Pago), revisión simulada del dueño,
  comprobantes numerados con código de prueba `V0-…` y verificación pública, y WhatsApp ficticio
  (57 + diez ceros) cuyos clics se interceptan con un aviso.
- **Acceso intacto:** las líneas de `#loginModal` y `icon-shield` no cambiaron (diff comparado).
- **Pruebas:** lint, formato y tipos OK; unitarias y API 385/385; e2e 80/80 con axe (nueva: las dos
  burbujas abajo a la derecha sin taparse; ampliada: compartir con y sin menú del sistema); visuales
  3/3 (solo 03 regenerada tras revisarla: la tarjeta del comprobante crece 52 px; 01 y 02
  idénticas); flujo completo en la vista previa a 1280 y 360 px sin errores ni desbordamiento;
  escáner 0. Integración no se volvió a correr: el cambio no toca el servidor.
- **Vista previa:** publicada en el mismo artefacto privado (versión 7). Su visualización dentro de
  claude.ai: NO VERIFICADO. Burbujas y Nequi en producción: no se volvieron a comprobar en esta
  ronda (NO VERIFICADO).
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-27 · Transiciones sin cruces y sonido de bienvenida (pedido del dueño)

- **Pedido:** «mejora la transición de las animaciones por favor que no se crucen y sea mejor
  presentable y auténtico y original además puedes agregar un sonido de bienvenida en el landing
  de presentación».
- **Diagnóstico (video cuadro a cuadro, 1280 y 360 px):** (1) la bienvenida se veía ~0,3 s antes
  de que llegara la presentación; (2) la salida de la presentación (0,62 s) y la entrada de la
  bienvenida corrían a la vez y se veían superpuestas; (3) al pulsar «Entrar» la capa era
  translúcida (la bienvenida se veía detrás) y el acceso, la salida de la bienvenida y la de la
  presentación ocurrían al mismo tiempo.
- **Hecho:** coreografía por fases en `intro.js` (Web Animations): la bienvenida espera oculta
  (`entry-hold`, con respaldo a los 2,5 s si el script no llega y visible sin JavaScript), Tay
  guiña y sale, un diamante con borde de luz (`clip-path` con regla par-impar) se abre y solo
  entonces entra la bienvenida. «Entrar»: sale la bienvenida (`entry-leaving`), un diamante opaco
  nace del botón y cubre, se abre el acceso cubierto y el diamante lo revela. Destellos solo
  sobre la vitrina. `js/effects/sonido.js`: sonido sintetizado con Web Audio, limitador a -3 dB,
  sin audio antes del primer toque, una vez por sesión, botón para silenciar (recordado en
  `tgs_sonido`); el audio se suspende al terminar. Política de cookies actualizada.
- **Línea de tiempo medida (escritorio):** presentación 0,22 → 2,71 s; Tay sale 2,71 → 3,26;
  diamante 3,26 → 3,92; bienvenida desde 3,92. «Entrar»: sale 0 → 0,2 s; cubre → 0,6; acceso
  abierto con la pantalla cubierta; revela → ~1,5 s. Sin fases simultáneas; consola sin errores ni
  avisos.
- **Sonido medido (render sin altavoces):** bienvenida pico 0,34 (≈ -9 dBFS), 1,65 s; «Entrar»
  pico 0,25, 1,45 s; 0 contextos de audio antes de tocar.
- **Acceso intacto:** las líneas de `#loginModal` e `icon-shield` no cambiaron (diff comparado);
  capturas 02 y 03 idénticas.
- **Pruebas:** lint, formato y tipos OK; unitarias y API 385/385; e2e 81/81 con axe (nueva: sonido
  — nada antes del primer toque, una vez por sesión, silenciar y reactivar; ampliadas: la
  presentación verifica el orden de las fases sin cruces, y sin JavaScript no hay presentación ni
  botón de sonido y el contenido se ve); visuales 3/3 (solo 01 regenerada tras revisarla: botón de
  sonido, que en celular es solo ícono para no tocar el logotipo); escáner 0. Firefox y WebKit:
  NO VERIFICADO en local (solo Chromium instalado); los cubre la CI al publicar.
- **Vista previa:** publicada en el mismo artefacto privado (versión 8). Su visualización y el
  sonido dentro de claude.ai: NO VERIFICADO. En iPhone con el interruptor de silencio activado,
  Safari no reproduce sonidos web (comportamiento del sistema).
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-27 · Publicación de 14 commits (b5ac9e3…bd8aa53) y verificación

- **Autorización del dueño:** «Autorizo el snapshot y el push de los 14 commits».
- **Respaldo de la base:** el snapshot de Neon fue rechazado («snapshots limit exceeded»: el plan
  admite uno y ya existe el del 2026-10-13, que no se borró). En su lugar, rama de respaldo
  `respaldo-2026-10-27-antes-de-14-commits` (`br-calm-scene-b53pu2dr`) desde `production`, LSN
  `0/7F80A50` (último dato 19:24:16 UTC), sin cómputo; estado `ready` antes del push.
- **Push:** avance rápido `aba648b..bd8aa53`; `git ls-remote` = `bd8aa53`.
- **Render:** despliegue `dep-dbgfpnp42hec739a55dg` en `live` a las 19:36:05 UTC. La compilación
  aplicó la migración `0024_totp_un_solo_uso` («Migraciones aplicadas.»); la columna
  `users.mfa_totp_last_step` (bigint, admite nulos) existe en producción (consulta de esquema, sin
  datos). Registros de error o aviso desde el despliegue: ninguno.
- **GitHub Actions sobre `bd8aa53`:** CodeQL OK; prueba de producción OK (navegador real a 360 y
  1280 px, 19:36:16–19:36:30, después del despliegue: diseño cargado, bienvenida sin burbuja,
  burbujas de WhatsApp y correo a la derecha, 6 paquetes a la venta, acceso de invitado y Google
  activos). CI: gitleaks, lint/formato/tipos/unitarias/build, integración, e2e Chromium y e2e WebKit
  OK; **e2e Firefox con 2 fallos de las pruebas** (no de la tienda): `isMobile` no existe en
  Firefox (`quality.spec.ts`) y las imágenes `loading="lazy"` que Firefox solo pide cerca de la
  pantalla (`behavior.spec.ts`).
- **Corrección local (este commit, sin publicar):** en Firefox se miden solo los casos con ratón
  (como la prueba vecina que ya lo excluía del puntero táctil) y la prueba del arte recorre el
  catálogo antes de comprobar las imágenes. Pasan en Chromium; en Firefox: NO VERIFICADO en local
  (sin ese navegador aquí), lo verificará la CI al publicar.
- **NO VERIFICADO:** la tienda publicada desde este entorno (el navegador local recibe
  `ERR_CERT_AUTHORITY_INVALID` por el proxy del entorno; no se desactivó la verificación TLS).

### 2026-10-28 · Publicación de eb6c9e1 y verificación

- **Autorización del dueño:** «Autorizo el push del commit eb6c9e1».
- **Push:** avance rápido `bd8aa53..eb6c9e1`; `git ls-remote` = `eb6c9e1`.
- **Render:** despliegue `dep-dbgvk9142hec739dtoh0` en `live` (13:35:32–13:36:28 UTC). Registros
  de error o aviso desde las 13:35 UTC: ninguno (consulta de las 14:44 UTC).
- **GitHub Actions sobre `eb6c9e1`:** CI OK (incluye e2e Firefox, que antes fallaba por las dos
  pruebas corregidas), CodeQL OK, prueba de producción OK.

### 2026-10-28 · Respuesta al tocar y escribir (INP) y panel de estado funcional (pedido del dueño)

- **Pedido:** «quiero que soluciones el tema de keyboard […] pointer […] Presentation delay 413» y
  «el texto se cruza con la barra y quiero que sea funcional y no sea de lujo» (panel LIVE STORE).
- **Causa del teclado (procesamiento 291 ms):** el oyente del primer toque creaba el audio y su eco
  dentro de la tecla y leía el almacenamiento en cada tecla. Ahora prepara el audio 40 ms después
  (los navegadores siguen contando el toque) y lee la preferencia una vez.
- **Causa del puntero (presentación 413 ms):** dibujar cada cuadro costaba demasiado: partículas a
  pantalla completa, secciones que entraban desenfocadas 1 s, aura animada en los botones,
  desenfoque del fondo en 26 elementos, `will-change` en ~30 botones, el catálogo rehecho entero
  en cada render y dos lecturas de `offsetWidth` que forzaban el diseño de toda la página (una de
  ellas para una clase `bump` sin estilos). Todo quitado o corregido; la ventana de acceso
  (`#loginModal`, `account.js`, `15-modals.css`, `21-auth.css`) y la bienvenida no se tocaron.
- **Panel:** lista de cinco filas (catálogo, verificación del ID, pagos, entrega, soporte) con el
  estado del servidor y una nota; etiqueta de estado real; accesos a «Seguimiento» y «Soporte».
  Sin barras, imagen, reloj ni inclinación. Nada inventado: sin `LEGAL_DELIVERY_TIME` dice «Ver
  términos»; sin canales de soporte, «No disponible».
- **Medición** (vista previa, Chromium, CPU 4× más lenta, mediana de 4 corridas alternadas de la
  versión publicada y la nueva): escribir el ID 264 → 80 ms; nombre 232 → 88; tecla en la
  presentación 216 → 124; buscador 348 → 264; invitado 388 → 296; agregar al carrito 348 → 296.
  Capas de composición 113 → 61; desenfoques activos 26 → 8 (los de la ventana de acceso y la
  bienvenida). Se probó `content-visibility` en las secciones: sin mejora estable, no se aplicó.
- **Pruebas:** lint, formato y tipos OK; unitarias 385/385; e2e 82/82 (nueva: el panel no monta
  textos a 360 px; ampliada: filas de entrega y soporte y la etiqueta; la de movimiento ya no
  espera el aura ni el diamante del panel); visuales 3/3 (solo 03 regenerada tras revisarla; 01 y
  02 idénticas); escáner 0. Firefox y WebKit: NO VERIFICADO en local; los cubre la CI al publicar.
- **NO VERIFICADO:** el INP en el celular del dueño y en la tienda publicada (aquí solo emulación
  de CPU en Chromium). Vista previa publicada en el mismo artefacto privado (versión 9); su
  visualización dentro de claude.ai: NO VERIFICADO.
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-28 · Publicación de 391c545 y verificación

- **Autorización del dueño:** «Autorizo el push del commit 391c545».
- **Antes del push:** árbol limpio; solo `391c545` pendiente; sin cambios de servidor ni
  migraciones (solo frontend, pruebas y documentación), por eso no se tomó respaldo de la base.
- **Push:** avance rápido `eb6c9e1..391c545`; `git ls-remote` = `391c545`.
- **Render:** despliegue `dep-dbh168fb9u1s739g9irg` en `live` (15:22:09–15:23:06 UTC). Registros
  de error o aviso desde las 15:22 UTC: ninguno (consulta de las 15:33 UTC).
- **GitHub Actions sobre `391c545`:** CI OK (gitleaks, lint/tipos/unitarias/build, integración y
  e2e en Chromium, Firefox y WebKit), CodeQL OK, prueba de producción OK (15:22–15:23 UTC).
- **NO VERIFICADO:** el INP medido en el celular del dueño en la tienda publicada; la tienda
  publicada desde este entorno (el proxy del entorno impide abrirla con TLS válido).

### 2026-10-28 · Publicación de b5d2f87 y verificación

- **Autorización del dueño:** «Autorizo el push del commit b5d2f87».
- **Push:** avance rápido `391c545..b5d2f87` (solo el registro); `git ls-remote` = `b5d2f87`.
- **Render:** despliegue `dep-dbh1gbdg1s2s73ejhku0` en `live` (15:43:41–15:44:37 UTC). Registros
  de error o aviso desde las 15:43 UTC: ninguno (consulta de las 15:57 UTC).
- **GitHub Actions sobre `b5d2f87`:** CI, CodeQL y prueba de producción OK.

### 2026-10-28 · Panel «LIVE STORE» con el diseño elegido por el dueño (pedido del dueño)

- **Pedido:** «su propuesta no me gustó, escojo la que te compartí en la imagen y vuélvalo más
  atractivo […] funcional y no un simple decoración […] sin detalle mal ejecutado».
- **Cambio:** vuelve el diseño original (bóveda, «LIVE STORE», estado de operación, barras) con:
  filas en una cuadrícula de tres columnas compartidas (la etiqueta más larga fija su ancho, así
  que ningún texto pisa una barra); barra según el estado (llena, a medias, casi vacía); nota con
  el dato útil (paquetes y precio desde, modo de verificación, medios de pago, plazo de entrega);
  etiqueta y color del panel según el estado real; hora de la última comprobación con el
  servidor; pie con accesos a «Protección del flujo» (ventana existente) y al verificador de
  comprobantes. Nada inventado: sin `LEGAL_DELIVERY_TIME` la entrega dice «Ver términos».
- **Rendimiento:** sin animaciones continuas ni inclinación; capas de composición 61 (igual que
  antes del cambio) y tiempos de respuesta dentro del margen de ruido de la medición anterior.
- **Pruebas:** lint, formato y tipos OK; unitarias 385/385; e2e 82/82 (actualizadas: filas,
  etiqueta, hora, accesos del pie y la prueba de textos montados a 360 px, ahora sobre la
  cuadrícula); visuales 3/3 (solo 03 regenerada tras revisarla; 01 y 02 idénticas); escáner 0.
  Firefox y WebKit: NO VERIFICADO en local; los cubre la CI al publicar.
- **Acceso intacto:** sin cambios en `#loginModal`, `account.js`, `15-modals.css` ni `21-auth.css`.
- **Vista previa:** publicada en el mismo artefacto privado (versión 10); su visualización dentro
  de claude.ai: NO VERIFICADO.
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-28 · Publicación de 8390a6b y verificación

- **Autorización del dueño:** «Autorizo el push del commit 8390a6b».
- **Antes del push:** árbol limpio; solo `8390a6b` pendiente; sin cambios de servidor ni
  migraciones (frontend, pruebas y documentación).
- **Push:** avance rápido `b5d2f87..8390a6b`; `git ls-remote` = `8390a6b`.
- **Render:** despliegue `dep-dbh1ohh42hec739hl50g` en `live` (16:01:10–16:02:26 UTC). Registros
  de error o aviso desde las 16:00 UTC: ninguno (consulta de las 16:10 UTC).
- **GitHub Actions sobre `8390a6b`:** CI OK (e2e en Chromium, Firefox y WebKit), CodeQL OK, prueba
  de producción OK (16:02:48 UTC).
- **NO VERIFICADO:** la tienda publicada vista desde este entorno (el proxy impide TLS válido) y
  el valor de `LEGAL_DELIVERY_TIME` en producción (no se leyeron variables de Render).

### 2026-10-28 · Publicación de f21308f y verificación

- **Autorización del dueño:** «Autorizo el push del commit f21308f».
- **Push:** avance rápido `8390a6b..f21308f` (solo el registro); `git ls-remote` = `f21308f`.
- **Render:** despliegue `dep-dbh1v3ivcj2c73e27cmg` en `live` (16:15:10–16:16:27 UTC). Registros
  de error o aviso desde las 16:10 UTC: ninguno (consulta de las 16:38 UTC).
- **GitHub Actions sobre `f21308f`:** CI, CodeQL y prueba de producción OK.

### 2026-10-28 · Panel compacto y cómodo en el celular (pedido del dueño)

- **Pedido:** «en PC y portátiles están bien, solo que en celulares se visualiza muy incómodo»;
  «hay mucha información innecesaria […] resumir o compactar […] profesional, atractivo y
  limpio»; «no quites lo esencial, solo que hay mucho texto».
- **Celular:** la bóveda vuelve a la izquierda del texto, cuadrada y completa (96 px; 76 px en
  pantallas de 340 px o menos); antes ocupaba todo el ancho recortada en una franja.
- **Menos texto, lo esencial intacto:** fuera las notas bajo cada barra; queda una línea con el
  precio «desde» resaltado y los medios de pago (o el aviso de modo prueba); barras de catálogo,
  verificación y pagos con valor corto; la fila de entrega solo si el plazo es corto y está
  configurado; accesos del pie como enlaces discretos. Panel a 360 px: ~700 → ~360 px de alto.
- **Pruebas:** lint, formato y tipos OK; unitarias 385/385; e2e 83/83 (nueva: con plazo
  configurado, la fila de entrega lo muestra; actualizadas: precio «desde», sin notas, fila de
  entrega oculta sin plazo y textos sin montarse a 360 px); visuales 3/3 (solo 03 regenerada
  tras revisarla; 01 y 02 idénticas); escáner 0. Firefox y WebKit: NO VERIFICADO en local.
- **Acceso intacto:** sin cambios en `#loginModal`, `account.js`, `15-modals.css` ni `21-auth.css`.
- **Vista previa:** mismo artefacto privado (versión 11); su visualización dentro de claude.ai: NO
  VERIFICADO.
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-28 · Publicación de abab64c y fila «Entrega» siempre visible

- **Autorización del dueño:** «Autorizo el push del commit abab64c».
- **Push:** avance rápido `f21308f..abab64c`; `git ls-remote` = `abab64c`.
- **Render:** despliegue `dep-dbh2bv29lscs73fvlnag` en `live` (16:42:36–16:43:37 UTC). Registros
  de error o aviso desde las 16:42 UTC: ninguno (consulta de las 16:50 UTC).
- **GitHub Actions sobre `abab64c`:** CI, CodeQL y prueba de producción OK.
- **Pedido:** «te faltó también la entrega» (la fila se ocultaba sin plazo configurado).
- **Cambio local:** la fila «Entrega» se ve siempre: el plazo configurado si es corto (p. ej.
  «24 horas») o «A tu ID» (la recarga llega a la cuenta del jugador por su ID); en pausa,
  «Pausada». Nunca un plazo inventado.
- **NO VERIFICADO:** el valor de `LEGAL_DELIVERY_TIME` en producción (la consulta pública a
  `/api/config` desde este entorno no respondió en 20 s; no se leyeron variables de Render).
- **Pruebas:** lint, formato y tipos OK; unitarias 385/385; e2e 83/83 (actualizada: sin plazo, la
  fila dice «A tu ID»; con «24 horas», lo muestra); visuales 3/3 (solo 03 regenerada tras
  revisarla; 01 y 02 idénticas); escáner 0.
- **Vista previa:** mismo artefacto privado (versión 12).
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-28 · Publicación de e180828 e inicio animado también en celulares

- **Autorización del dueño:** «Autorizo el push del commit e180828».
- **Push:** avance rápido `abab64c..e180828`; `git ls-remote` = `e180828`.
- **Render:** despliegue `dep-dbh3eq15efls73ap1g3g` en `live` (17:56:56–17:57:57 UTC). Registros
  de error o aviso desde las 17:56 UTC: ninguno (consulta de las 18:26 UTC).
- **GitHub Actions sobre `e180828`:** CI (run 228), CodeQL y prueba de producción OK.
- **Pedido:** «quiero que todo el inicio y el proceso landing page, transiciones, animaciones
  estén en los dispositivos móviles, porque no se ejecuta en los móviles; solo se ejecuta completo
  en el PC y el portátil».
- **Diagnóstico (Chromium, emulación Pixel 7):** sin «reducir movimiento», el celular corre la
  presentación, la bienvenida y la transición igual que el PC (45 vs. 46 animaciones). Con
  «reducir movimiento» (en Android, «Quitar animaciones»), la tienda las apagaba todas (0
  animaciones, sin presentación ni transición). Además, los efectos de la bienvenida (vitrina, ojos
  de Tay, destellos) solo respondían al ratón. NO VERIFICADO: qué ajuste tiene el teléfono del
  dueño.
- **Cambio local:**
  - Versión suave con «reducir movimiento»: la presentación, la bienvenida y «Entrar» se ven solo
    con fundidos (sin piezas que vuelan, diamante ni zoom; la regla general de movimiento reducido
    sigue para todo lo demás).
  - En pantallas táctiles, al tocar la vitrina Tay mira hacia el dedo, la vitrina se inclina y
    salen destellos. Al soltar, todo vuelve al centro. El botón magnético queda solo para ratón.
  - Las variables de inclinación se aplican solo a los elementos que se inclinan.
- **Medición (Pixel 7, CPU 4× más lenta), respuesta al toque sobre la vitrina:**
  - Antes: 64–80 ms, sin efecto.
  - Ahora: 80–96 ms, con efecto.
  - Tocar «Entrar»: 104–200 ms en ambas versiones (varía entre corridas).
- **Pruebas:**
  - Lint, formato y tipos OK; unitarias 385/385; escáner 0.
  - e2e 85/85 en Chromium. Dos nuevas: versión suave (solo fundidos, sin diamante) y toque en la
    vitrina. Dos ajustadas: los clics forzados en el acceso esperan a que termine la transición.
  - `preparePage` marca la presentación como vista salvo `{ intro: true }`, así las pruebas llegan
    directo a la bienvenida, como antes.
  - Visuales 3/3 idénticas, sin regenerar.
  - Firefox y WebKit: NO VERIFICADO en local. La prueba de toque corre solo en Chromium.
- **Acceso intacto:** sin cambios en `#loginModal`, `account.js`, `15-modals.css` ni `21-auth.css`.
- **Vista previa:** mismo artefacto privado (versión 14).
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-28 · Publicación de 5bdbb81 y prueba táctil en Firefox

- **Autorización del dueño:** «Autorizo el push del commit 5bdbb81».
- **Push:** avance rápido `e180828..5bdbb81`; `git ls-remote` = `5bdbb81`.
- **Render:** despliegue `dep-dbh45kjbc2fs738iel10` en `live` (18:45:38–18:46:45 UTC). Registros
  de error o aviso desde las 18:45 UTC: ninguno (consulta de las 18:56 UTC).
- **GitHub Actions sobre `5bdbb81`:**
  - CodeQL y prueba de producción OK.
  - CI (run 229) en rojo por un solo trabajo, e2e en Firefox: 82 pruebas OK, 2 saltadas y 1
    fallida. La prueba de vitrina táctil falló con `options.isMobile is not supported in Firefox`.
  - Chromium, WebKit, integración, lint/tipos/unitarias/build y gitleaks OK.
- **Causa:** de la prueba, no de la tienda. `test.use({ isMobile: true })` hace que Firefox falle
  al crear el contexto antes de entrar a la prueba, donde estaba el salto para navegadores que no
  son Chromium.
- **Corrección local:** el salto pasa al bloque (`test.skip(({ browserName }) => …)`) y se evalúa
  antes de crear el contexto.
  - Comprobado en Chromium: con la condición invertida a propósito, la prueba queda saltada sin
    error. Con la condición real, las 5 pruebas de movimiento OK.
  - Firefox en local: NO VERIFICADO (no está instalado); lo confirma la CI tras el push.
- **Sin publicar:** commit local que solo cambia una prueba y este registro. El push despliega en
  Render; espera la autorización del dueño.

### 2026-10-28 · Publicación de c814ff3 y verificación

- **Autorización del dueño:** «Autorizo el push del commit c814ff3».
- **Push:** avance rápido `5bdbb81..c814ff3`; `git ls-remote` = `c814ff3`.
- **Render:** despliegue `dep-dbh4fb15efls73aqnmr0` en `live` (19:06:20–19:07:31 UTC). Registros
  de error o aviso desde las 19:06 UTC: ninguno (consulta de las 19:19 UTC).
- **GitHub Actions sobre `c814ff3`:** CI (run 230) en verde: e2e en Chromium, Firefox y WebKit,
  integración, lint/tipos/unitarias/build y gitleaks. CodeQL y prueba de producción OK. La prueba
  táctil ya no rompe Firefox (se salta antes de crear el contexto).

### 2026-10-28 · Publicación de dda83d3 y carrito, acceso e íconos de juegos

- **Publicación de `dda83d3`** (autorizada: «Autorizo el push del commit dda83d3»):
  - Push en avance rápido `c814ff3..dda83d3`.
  - Render: despliegue `dep-dbh4njjbc2fs73a5kf2g` en `live` (19:23:58–19:25:06 UTC), sin errores
    ni avisos en los registros.
  - CI, CodeQL y prueba de producción OK.
- **Pedido:** «el ícono del carrito está muy pequeño y el bloque; mejora los íconos de los
  logins de Google y Facebook; y los íconos de los videojuegos sean oficiales».
- **Decisión del dueño (pregunta en la conversación):** íconos propios mejorados para los
  juegos, **sin** logotipos oficiales. Los términos §1 y el informe legal dicen que la tienda no
  usa sus logos (Decisión Andina 486); el dueño eligió no asumir ese riesgo.
- **Acceso:** el dueño pidió explícitamente cambiar estos íconos, que antes estaban protegidos
  por «los logins no me los toques».
  - Cambia solo el contenido de `.oauth-brand` en `#loginModal`: las letras «G» y «f» pasan a ser
    los logotipos oficiales. Los estilos van en `47-iconos.css`.
  - Sin cambios en `account.js`, `15-modals.css` ni `21-auth.css`, ni en el flujo de acceso.
  - Origen de los logotipos: en el informe legal (§4, «Íconos de acceso y de juegos»).
- **Carrito:**
  - El ícono pasa de 18 a 24 px en PC y a 27 px en celular. El botón, de 38 a 44 px en PC y de
    44 a 48 px en celular (44 px en 380 px o menos).
  - El contador queda dentro del botón; antes `overflow: hidden` lo cortaba.
- **Pruebas:**
  - Lint, formato y tipos OK; unitarias 385/385; escáner 0.
  - e2e 86/86 en Chromium. Una nueva: logos de acceso cargados, carrito de al menos 24/44 px
    con el contador dentro, e íconos de juegos dibujados, a 360, 412 y 1280 px.
  - Sin desbordes de 360 a 1920 px. Primero falló por 1 px a 360 px; se corrigió con botones de
    44 px en 380 px o menos.
  - Visuales: 02 (acceso) y 03 (tienda) regeneradas tras revisarlas. El modal de acceso queda unos
    px más alto por el mosaico del logotipo (36 px) y la cabecera crece ~5 px. La 01 sigue
    idéntica.
  - Firefox y WebKit: NO VERIFICADO en local.
- **Vista previa:** mismo artefacto privado (versión 15).
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-29 · Publicación de 92f671a y hoja de Google lista para producción

- **Publicación de `92f671a`** (autorizada: «Autorizo el push del commit 92f671a»):
  - Push en avance rápido `dda83d3..92f671a`.
  - Render: despliegue `dep-dbh62rfavr4c73f1cheg` en `live` (20:56:13–20:57:28 UTC), sin errores
    ni avisos en los registros (consulta de las 21:06 UTC).
  - CI con Chromium, Firefox y WebKit, CodeQL y prueba de producción OK.
- **Pedido:** «conectar directamente mi sitio web con Google Sheets, que no esté en fase de prueba,
  o con Make; que se sincronice totalmente, sin retraso».
- **Diagnóstico (solo lectura):**
  - Arranque de producción del 2026-10-28 20:57 UTC: `hojaGoogle: false`, «falta la llave de la
    cuenta de servicio (`GOOGLE_SHEETS_CREDENTIALS_JSON`)». No se leyeron valores de Render.
  - La hoja real tiene las pestañas «Pedidos», «Entregas», «Pagos pendientes» y «Usuarios», con
    encabezados idénticos a las columnas del código. Está compartida solo con el dueño y con la
    cuenta de servicio `tienda-hoja` (Editor). El recálculo del archivo está en «Al cambiar».
  - Producción (conteos, sin datos personales): 24 pedidos, todos vencidos sin pago (18 de
    Mercado Pago y 6 de Nequi); 58 clientes; 0 filas de la hoja en cola.
  - Hueco encontrado: los pedidos de cuando la hoja estaba apagada nunca llegaban a ella.
- **Cambio local:** `catchUpSheet` se ejecuta una vez por proceso, en la primera pasada de la
  tarea de avisos.
  - Encola la fila de «Entregas» de los pedidos con comprobante y la de «Pagos pendientes» de los
    pedidos Nequi que no la tenían.
  - Reintenta las filas de la hoja que quedaron fallidas.
  - Es idempotente. «Pedidos» (historial de eventos) empieza desde la conexión.
- **Make:** evaluado y no recomendado para esto. La conexión directa escribe en 1–2 s, es gratis
  y ya trae orden, reintentos y protección contra duplicados. Make agregaría otro tercero con
  datos de clientes (requiere autorización) y costo por operación. Detalle en
  `docs/google-sheets.md`.
- **Pendiente del dueño:** crear la llave JSON de `tienda-hoja` en Google Cloud y pegarla en
  Render (`GOOGLE_SHEETS_CREDENTIALS_JSON`). La llave nunca pasa por el chat ni por el
  repositorio.
- **Pruebas:**
  - Lint, formato y tipos OK; unitarias 385/385.
  - Integración 303 OK y 2 saltadas. Una nueva: puesta al día con hoja apagada → conectada, filas
    fallidas reintentadas, sin duplicados y sin eventos inventados en «Pedidos».
  - e2e 86/86 en Chromium; escáner 0. Firefox y WebKit: NO VERIFICADO en local.
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-29 · Publicación de bb0b112, hoja real ajustada y prueba corregida

- **Autorización:** «hazlo todo por tu cuenta sin mayor problemas tienes el permiso total con
  autorizacion permitida». Cubre el push de `bb0b112` y los ajustes probados en la copia de la
  hoja.
- **Publicación de `bb0b112`:**
  - Push en avance rápido `92f671a..bb0b112`.
  - Render: despliegue `dep-dbhkev4s728c73d7pf30` en `live` (13:17:48–13:18:47 UTC).
  - Registros desde las 13:17 UTC: sin errores (nivel 50/60). Único aviso (nivel 40), el
    esperado: «Hoja de Google apagada: falta la llave de la cuenta de servicio».
  - CodeQL y prueba de producción OK. CI: lint, tipos, unitarias, build, gitleaks y e2e en
    Chromium y Firefox OK.
  - **CI en rojo:** falló el trabajo «Integración con PostgreSQL». Sin efecto en producción: el
    código publicado no borra nada.
- **Causa del fallo:**
  - La prueba nueva de `catchUpSheet` borraba filas de `notifications` con la conexión de la
    tienda, para simular «hoja apagada».
  - En CI la tienda usa el rol de privilegios mínimos, que no tiene DELETE (así debe ser):
    `permission denied for table notifications`.
  - En local pasó porque no se definió `TEST_APP_DATABASE_URL` y todo corría como dueño.
- **Corrección (solo la prueba):** esa preparación se hace con una conexión del dueño de la base,
  igual que `security-integrity.test.ts`.
  - Fallo reproducido en local con el rol mínimo: 1 fallida, 15 OK.
  - Tras la corrección: `sheets.test.ts` 16/16, e integración completa 305/305 con el rol
    mínimo, como en CI (las 2 que antes se saltaban ahora corren).
  - Lint, formato y tipos OK; unitarias 385/385.
- **Hoja real** (original, no la copia), con el conector de Google del dueño:
  - Cálculo: de «Al cambiar» a «Al cambiar y cada minuto».
  - Textos de «Por entregar» A2 y «Léeme» A6 y A16 (en la copia es A14), con Nequi y «ENVIADO».
    Antes de escribir se comprobó que las tres celdas eran texto, no fórmulas.
  - Un solo lote atado a la revisión leída: si la hoja hubiera cambiado entretanto, Google lo
    rechazaba entero.
  - Comprobado leyendo de nuevo: `autoRecalc: MINUTE` y los tres textos idénticos a los probados.
  - Respaldo: el historial de versiones de Google.
- **Sigue pendiente del dueño:** crear la llave JSON de `tienda-hoja` y pegarla en Render
  (`GOOGLE_SHEETS_CREDENTIALS_JSON`). Hasta entonces la hoja no recibe filas (NO VERIFICADO el
  paso hoja conectada en producción).

### 2026-10-29 · Publicación de 8515606, Make comprobado y fórmulas automáticas en la hoja

- **Publicación de `8515606`** (prueba corregida y documentación; mismo permiso):
  - Push en avance rápido `bb0b112..8515606`.
  - Render: despliegue `dep-dbhkipc9v7es73bekbh0` en `live` (13:25:57–13:26:56 UTC).
  - CI en verde (lint, tipos, unitarias, build, integración con el rol mínimo, e2e en Chromium,
    Firefox y WebKit, gitleaks), CodeQL y prueba de producción OK.
  - Registros: sin errores. Único aviso, el esperado: «Hoja de Google apagada».
- **Pedido:** «implementa fórmulas para que yo solo analice, verifique y confirme; que los
  informes y pedidos se automaticen al instante; confírmame si Make está automatizando sin
  errores; sin exponer ni filtrar datos sensibles».
- **Make (con evidencia):** no está conectado ni automatiza nada con la tienda.
  - El arranque de las 13:26:53 UTC dice `eventosExternos: false`.
  - El código no tiene integración propia con Make.
  - La hoja está compartida solo con el dueño y `tienda-hoja`.
  - En la sesión no hay conector de Make: lo que haya en una cuenta de Make del dueño queda NO
    VERIFICADO (la tienda no le envía nada).
- **Fórmulas nuevas:** pestañas «Hoy», «Por verificar» y «Reporte mensual». Solo leen las
  pestañas que escribe la tienda y «Compras_LootBar»; no tocan esas pestañas ni el código.
  Detalle en `docs/google-sheets.md`.
- **Prueba en la copia** («PRUEBA (copia, datos ficticios)»):
  - Se añadieron 2 entregas, 1 aviso Nequi y 1 compra de LootBar, todos ficticios y con fecha de
    hoy.
  - Todas las cifras coinciden con el cálculo a mano. Hoy: 2 pagos, $13.300, $7.000 de compras,
    $6.300 de ganancia (47 %).
  - Mes: 7 pagos, $32.300 de ventas, $3.800 reembolsado, $28.500 neto, $12.900 de compras,
    $15.600 de ganancia (55 %); Nequi 3 y Mercado Pago 4.
  - Pendientes: 2 por verificar, 2 por entregar y 1 aviso, ordenados del más antiguo al más
    nuevo.
  - Formatos de dinero, porcentaje y fecha comprobados leyendo el texto mostrado.
  - Primer intento de formato rechazado entero por la API (no acepta máscaras de campos con
    paréntesis); corregido y reenviado.
- **Hoja real:**
  - Copia de seguridad completa en el mismo Drive (solo con acceso del dueño; sin filas de
    clientes que duplicar).
  - El mismo lote, atado a la revisión leída.
  - Lectura de vuelta: «✅ Todo al día», 0 o «—» en todo, «Nada por verificar», «Sin datos aún»
    y «Todavía ninguna» en la conexión, sin errores.
- **«Léeme» de la hoja real:**
  - Explica las 3 pestañas nuevas y «Compras_LootBar».
  - Avisa que «Por verificar» tiene los 4 últimos dígitos.
  - Pide no renombrar las 4 pestañas que escribe la tienda.
  - El paso 6 menciona «Hoy».
- **Exposición:** sin cambios. Permisos releídos: dueño y `tienda-hoja` (Editor), sin enlace.
  «Por verificar» repite datos que ya estaban en «Pagos pendientes». Las pestañas nuevas tienen
  protección con aviso.
- **Tienda:** escribe sus pestañas por nombre (`'Entregas'!A1`), no por posición. El nuevo orden
  y las pestañas nuevas no la afectan.
- **Sigue pendiente del dueño:** la llave JSON de `tienda-hoja` en Render
  (`GOOGLE_SHEETS_CREDENTIALS_JSON`). Hasta entonces las fórmulas no tienen filas reales que
  calcular (NO VERIFICADO con datos de producción).

### 2026-10-29 · Publicación de 52978e4 y hoja de Google conectada en producción

- **Autorizó:** el dueño («hazlo todo por tu cuenta… tienes el permiso total», «quiero que mi
  hoja reciba pedidos reales en producción»). El dueño cargó la llave él mismo en Render; nunca
  pasó por el chat, el repositorio ni las herramientas.
- **Publicación de `52978e4`:** Render `dep-dbhktp0473hc73cnoi90` en `live` (13:49–13:50); CI #235,
  CodeQL #179 y smoke #93 en `success`.
- **Llave cargada:** el dueño agregó `GOOGLE_SHEETS_CREDENTIALS_JSON` y desplegó a mano
  (`dep-dbhlkp6c6qcc73foejm0`, mismo commit, `live` a las 14:39:39). No se leyó el valor.
- **Arranque (14:39:28):** `hojaGoogle: true` y «hoja de Google conectada» con la cuenta
  `tienda-hoja@…`. A las 14:39:35, puesta al día con `filasNuevas: 6` y `filasReintentadas: 0`.
  Sin registros de nivel 40 o 50 desde entonces.
- **Neon:**
  - `sheets_pending`: 7 filas `SENT`, ninguna con error.
  - Perfiles: 64 de 64 sincronizados con la pestaña «Usuarios», ninguno con error.
  - Ninguna fila de `sheets` o `sheets_delivery`: todavía no hay pedidos pagados que entregar.
- **Prueba con un pedido real:** un pedido Nequi de $18.000 se creó a las 14:51:03.353 y su fila se
  envió a las 14:51:04.842 (1,5 s). La hoja lo muestra como «⏳ Esperando la transferencia».
- **Hoja real, leída de vuelta:**
  - «Pagos pendientes»: 7 filas.
  - «Usuarios»: 64 filas.
  - «Hoy»: última fila a las 09:51 (Colombia), 0 minutos desde la última fila y 0 filas
    repetidas. Dice «⚠️ Tienes 1 cosa por atender».
- **Lo que toca al dueño:** un pedido Nequi de $11.000 del 2026-10-20 venció con un aviso de pago
  sin verificar. Debe buscarlo en la app Nequi y luego confirmar o rechazar el aviso en el panel.
  La referencia está en «Por verificar».
- **«Léeme» de la hoja real:** el estado dice que ya está conectada y qué hacer si deja de
  actualizarse.
- **Exposición:** sin cambios. La hoja sigue compartida solo con el dueño y `tienda-hoja`.
- **NO VERIFICADO:**
  - Filas de «Entregas»: todavía no hay pedidos pagados.
  - Que el dueño borró el archivo `.json` descargado: solo puede comprobarlo él.

### 2026-10-29 · Estado de la entrega desde la hoja y datos del jugador en «Pagos pendientes»

- **Autorizó:** el dueño. Pidió dos cosas:
  - «te faltó la información del jugador: ID confirmada, región»;
  - «haz un apartado en el excel… para cambiar el estado de completado el pedido y en mi tienda
    el estado del pedido esté conectado; no quiero que sea de decoración».
  - Ya había dado permiso total para publicar.
  - Añadir el ID del jugador a «Pagos pendientes» aumenta los datos personales de la hoja. Lo
    pidió el dueño de forma explícita.
- **Código:**
  - `sheet-commands.ts` lee la columna T de «Entregas» cada 30 s y aplica el estado con
    `fulfillmentAction`, las mismas reglas del panel.
  - El cliente de Google lee T:U y responde en V.
  - `pendingPaymentRow` suma 5 columnas del jugador.
  - El historial guarda `via: google_sheet`.
  - Nada de pagos: confirmar o rechazar Nequi sigue siendo solo del panel.
- **Pruebas locales:**
  - Unitarias: 397 de 397.
  - Integración: 311 de 311, con el rol restringido. Las 6 nuevas cubren entregado, en proceso,
    no se pudo entregar, sin pago, opción desconocida y columna vacía.
  - Lint, tipos y formato en verde.
- **Hoja (primero la copia de prueba, con datos ficticios):**
  - Columnas añadidas: «Pagos pendientes» +5, «Entregas» +3 y «Por verificar» +5.
  - Encabezados con el mismo estilo.
  - Lista desplegable en T2:T1000.
  - T2:U1000 libres de la protección con aviso.
  - La fórmula de «Por verificar» lee A2:R y muestra los datos del jugador.
  - Comprobado: Google devuelve `[]` en las filas vacías intermedias de T2:U, como espera el
    código.
- **Hoja real:**
  - Copia de seguridad previa en el Drive del dueño.
  - El mismo lote, atado a la revisión leída.
  - Lectura de vuelta: encabezados correctos y «Por verificar» sin errores.
  - «Léeme» con la sección nueva. Se quitaron los pasos de conexión, ya hechos.
- **Base (solo conteos):** 1 cuenta de administrador, 0 entregas (todavía ningún pedido pagado) y
  9 pedidos Nequi.
- **Publicación de `351fa35`:**
  - Render `dep-dbhospo473hc73cun9mg` en `live` a las 18:22. El arranque dice `hojaGoogle: true`
    y «hoja de Google conectada», sin avisos ni errores después.
  - CI #237 en `success`: los 6 trabajos, incluidos integración y e2e en Chromium, Firefox y
    WebKit.
  - Smoke #95 y CodeQL #181 en `success`.
- **Filas Nequi existentes rellenadas:**
  - Las 9 filas `sheets_pending` se volvieron a encolar en Neon. Es idempotente: reescribe la
    misma fila por referencia.
  - Una petición pública al catálogo (200) sacó la tienda del reposo.
  - En 90 s quedaron 9 de 9 `SENT`, ninguna con error.
  - La hoja muestra ID, confirmación y servidor en las 9, y «Por verificar» los muestra.
  - Nickname y «Región detectada» quedan vacíos: esos clientes confirmaron su ID escribiéndolo
    dos veces, sin búsqueda de ID.
- **Prueba real del circuito hoja → tienda, sin tocar pedidos:**
  - Se escribió en «Entregas» una referencia ficticia (`TGS-PRUEBAHOJA`) con «✅ Entregado».
  - A las 18:26:52 la tienda la leyó de la hoja real y la buscó en la base.
  - Respondió en V «✖️ No se aplicó: no hay un pedido con esa referencia. · 2026-10-29 13:26» y
    vació T.
  - Registro: «hoja de Google: cambio de estado del dueño», `aplicado: false`.
  - Después se vació la fila de prueba.
- **NO VERIFICADO:**
  - Un cambio de estado real que entregue un pedido, porque todavía no hay pedidos pagados. Se
    verificará con el primero; el mismo camino está probado en integración con base real.
  - Que la cuenta de administrador sea el primer correo de `ADMIN_EMAILS`. No se leen las
    variables de Render; si no lo es, la columna V lo dirá.

### 2026-10-29 · Método de pago y estado del comprobante en «Pagos pendientes»

- **Autorizó:** el dueño: «una columna del método de pago que seleccionaron o se realizó el pago
  en el Excel correspondiente y además el comprobante, el estado que salga solo por verificar y
  el método de pago en Nequi».
- **Interpretación:**
  - El comprobante del cliente en la tienda ya decía «Nequi · Transferencia Nequi por verificar»;
    se comprobó en `invoice.js` y `order-status.js`.
  - Lo que faltaba era la hoja. En «Pagos pendientes» van ahora «Método de pago» y «Estado del
    comprobante» (C y D).
  - Un pedido Nequi nunca pasa a Mercado Pago (decisión del dueño del 2026-10-19). Los de Mercado
    Pago llegan a «Entregas» al pagarse, con su método en «Método y operación de pago».
- **Código:**
  - `receiptCheckStatus`: «Sin enviar», «🔎 Por verificar», «✅ Verificado» o «✖️ Rechazado»,
    según la última transferencia.
  - `PENDING_PAYMENT_COLUMNS` pasa a 20 columnas.
  - Encabezado de «Entregas»: «Método y operación de pago».
- **Pruebas:**
  - Unitarias de la hoja: 41 de 41.
  - Integración de la hoja: 22 de 22, con el rol restringido. Recorren Sin enviar → Por verificar
    → Rechazado → Verificado.
- **Copia de prueba:**
  - Se insertaron las columnas C y D con «Insertar columnas»: Google movió solo las referencias de
    «Hoy» (G→I, M→O).
  - Se reescribió «Por verificar» (A2:T, 16 columnas).
  - Lectura de vuelta con datos ficticios: «Nequi (transferencia)» y «🔎 Por verificar» en
    «Por verificar». «Hoy» sigue en 2 por verificar, con los minutos del más antiguo.
- **Producción (845dab0):**
  - Render: despliegue `dep-dbhpa4cs728c73dg9eb0` en `live`.
  - Hoja real: copia de seguridad previa en Drive; columnas C y D insertadas y «Por verificar»
    reescrita igual que en la copia. «Hoy» sigue contando los pagos por verificar.
  - Las filas Nequi existentes se rellenaron reencolando sus avisos de la hoja: todos quedaron
    `SENT`. Son 3 pedidos Nequi (una fila por referencia); los avisos reencolados eran más porque
    cada pedido tiene varios.
  - GitHub: CI #239, CodeQL #183 y Production smoke #97 en verde sobre 845dab0 (verificado el
    2026-11-02).

### 2026-11-02 · Casillas en la hoja: «✓ Pago verificado» con referencia y «✓ Enviado»

- **Autorizó:** el dueño: «puedes implementar fórmula para que… solo yo seleccione una palomita o
  una burbuja dependiendo de la hoja del Excel se pase para verificar el pago y el envío del
  pedido… y luego que la factura o el comprobante arroje la información del pedido o el estado».
  Elecciones en la pregunta de opciones: pago «Casilla + referencia (Recomendado)» y entrega
  «Casilla ✓ Enviado (Recomendado)». Después: «Siga la ejecución pendientes».
- **Riesgo aceptado por el dueño:** confirmar un pago desde la hoja no pasa por el segundo paso
  del panel; lo protege solo el acceso de edición a la hoja (dueño y `tienda-hoja`). Límites en el
  código: referencia de movimiento válida y única, total exacto del pedido, solo pedidos Nequi,
  pedido vencido → revisión, historial con `via: google_sheet`. Documentado en
  `docs/google-sheets.md` («Riesgos»).
- **Código:**
  - `google-sheets.ts`: `COMMAND_COLUMNS` por pestaña (Entregas T/U/V, Pagos pendientes U/V/W);
    `readCommands` lee las dos pestañas con `UNFORMATTED_VALUE` (una casilla llega como `true`);
    `finishCommand` responde en la pestaña de la orden.
  - `sheet-commands.ts`: la casilla marcada en «Entregas» = «Entregado»; en «Pagos pendientes»,
    `applyPaymentCommand` → `confirmNequiTransfer` con el total del pedido y la referencia de V
    (validada con `nequiReference`, ahora exportado de `nequi-manual.ts`).
- **Pruebas (local):**
  - Unitarias: 400 de 400 (40 archivos).
  - Integración con el rol restringido: 315 de 315 (29 archivos). Incluye: la casilla «✓ Enviado»
    entrega el pedido; la casilla de pago con referencia confirma (comprobante, fila «✅
    Verificado», auditoría `via: google_sheet`, vista del cliente «PAID», repetir → «Ya estaba
    pagado»); referencia reutilizada y pedido que no es Nequi se rechazan.
  - Lint, tipos y formato: limpios. Escáner de datos sensibles: 0 coincidencias.
- **Hoja (antes de publicar el código, para que la tienda no lea columnas inexistentes):**
  - Copia de prueba: casillas en «Entregas» T y «Pagos pendientes» U, columnas U–W nuevas,
    protecciones y textos de «Hoy» y «Por verificar»; leído de vuelta.
  - Original: copia de seguridad previa en Drive («Respaldo 2026-11-02 … (antes de casillas)») y
    el mismo lote aplicado con bloqueo de revisión; leído de vuelta: casillas con validación
    estricta, V en formato texto, protecciones con T–U y U–V libres.
  - En «Entregas» T2 había «🔄 En proceso» en una fila sin pedido (la pestaña no tiene pedidos
    pagados todavía): no tenía efecto y se vació al convertir la columna en casilla.
  - «Léeme»: filas de «Por verificar», «Por entregar», «Pagos pendientes» (columnas P a T y U–W),
    «Entregas», significados de estado, reglas y la sección «Confirmar un pago y marcar un envío
    desde la hoja».
- **NO VERIFICADO (al hacer el commit):**
  - El despliegue en Render y el CI de este commit: se registran en el siguiente.
  - Un pago o una entrega reales por casilla: no hay pedidos Nequi esperando que el dueño haya
    visto en su app. El camino está probado en integración con base real.
  - Que la cuenta de administrador sea el primer correo de `ADMIN_EMAILS` (no se leen variables
    de Render; si no lo es, la respuesta de la tienda lo dirá).
- **Publicación de 508effa (2026-11-02):**
  - Autorización: el dueño eligió «Publicar ahora (Recomendado)» en la pregunta de opciones, con
    el resumen del diff (9 archivos, +438/−102) y las cifras de las pruebas. El primer intento de
    push había sido rechazado y no se repitió sin esa respuesta. Blobs comprobados antes del
    commit: iguales a los mostrados.
  - GitHub: `508effa` en la rama (`git ls-remote`).
  - Render: despliegue `dep-dbkh9s6q1p3s73am7890` en `live` a las 22:57:23 UTC. Arranque con
    «hoja de Google conectada»; la instancia nueva no registró avisos ni errores.
  - A las 22:56:28 UTC la instancia que despertaba (otro conjunto de réplicas) registró 8 tareas
    con «Connection terminated due to connection timeout» contra la base; 10 s después
    `/api/ready` respondió 200. Coincide con respuestas 502 de la API de Neon en esa hora. No
    depende de este cambio.
  - **Prueba en producción con referencia ficticia** (`TGS-PRUEBAHOJA`, sin tocar pedidos):
    - «Pagos pendientes»: casilla U marcada y `PRUEBA-0001` en V. A las 22:58:50 UTC la tienda
      respondió en W «✖️ No se confirmó: no hay un pedido con esa referencia. · 2026-11-02
      17:58» y vació U y V. Registro: `pestaña: pending`, `aplicado: false`.
    - «Entregas»: casilla T marcada. A las 22:58:49 UTC respondió en V «✖️ No se aplicó: no hay
      un pedido con esa referencia. · 2026-11-02 17:58» y vació T. Registro:
      `pestaña: deliveries`, `aplicado: false`.
    - Después se vaciaron las filas de prueba; leído de vuelta: solo quedan los 3 pedidos Nequi
      reales y «Entregas» sin filas.
  - GitHub Actions sobre 508effa: CI #244 en verde (lint, tipos, unitarias y build; integración
    con PostgreSQL; gitleaks; e2e Chromium, Firefox y WebKit), CodeQL #187 y Production smoke
    #100 en verde.
  - **Incidente encontrado y corregido en la hoja (23:10 UTC):** un pedido Nequi real nuevo
    (`TGS-C82F1KTNQ9`, creado a las 17:04 hora de Colombia) apareció en la **fila 1001** de
    «Pagos pendientes» en vez de la 5.
    - Causa: la casilla «normal» de Google (validación BOOLEAN sin valores) hace que cada celda
      vacía valga FALSE. `appendRow` añade con el rango `A1` y Google tomó como tabla A1:W1000
      (las casillas de U2:U1000 contaban como datos). En «Entregas» habría pasado lo mismo con el
      primer pedido pagado (T2:T1000).
    - Nada se perdió ni se sobrescribió: «Por verificar» y «Hoy» ya lo contaban (sus fórmulas usan
      rangos abiertos) y la tienda busca la fila por la referencia en toda la columna A. La fila 5
      que usó la prueba ficticia estaba vacía (comprobado: A5:I7 y O5:O7 sin datos).
    - Arreglo, solo en la hoja: casilla «de un solo valor» (`BOOLEAN` con `["TRUE"]`: marcada =
      TRUE, desmarcada = vacía) en «Pagos pendientes» U2:U1000 y «Entregas» T2:T1000. Probado
      antes en la copia: las celdas vacías leen vacío, un `append` en `A1` cae en la primera fila
      libre y marcar la casilla escribe `TRUE` (booleano), que la tienda ya entiende.
    - En el original, en una sola operación con bloqueo de revisión: valores de A1001:T1001
      copiados a A5:T5, fila 1001 eliminada y las dos validaciones cambiadas. Leído de vuelta: los
      4 pedidos en las filas 2–5, 1000 filas, U y T vacías.
    - Sin cambio de código ni despliegue.
  - **NO VERIFICADO:** un pago o una entrega reales por casilla (no se tocan pedidos reales en
    pruebas) y el primer correo de `ADMIN_EMAILS` (siguen igual que arriba).

### 2026-11-03 · Hoja en tiempo real: pestaña «Pedidos en vivo»

- **Pedido del dueño:** «que en el Excel se actualicen los datos en tiempo real de inmediato que
  un cliente o usuario realice un pedido». Eligió «Pestaña nueva «Pedidos en vivo»
  (Recomendado)» en la pregunta de opciones. Sobre las 8 filas Nequi vencidas que borró a mano de
  «Pagos pendientes» respondió sin preferencia: se dejan como están (se pueden restaurar si lo
  pide).
- **Diagnóstico (solo lectura):**
  - Los pedidos Nequi ya llegaban en ~1 s a «Pagos pendientes».
  - Los de Mercado Pago no llegaban a la hoja hasta pagarse: 18 pedidos de Mercado Pago vencidos
    nunca se vieron.
  - El pedido que el dueño no encontraba estaba en la fila 1001 (incidente del 2026-11-02, ya
    corregido en la hoja).
- **Cambio de código:**
  - Canal nuevo `sheets_live` en la cola (migración 0025: solo amplía la lista permitida del
    CHECK) y pestaña configurable `GOOGLE_SHEETS_LIVE_TAB` (por defecto «Pedidos en vivo»,
    distinta de las demás).
  - Fila de 11 columnas sin datos personales (`liveOrderRow`), con el estado del pedido de
    principio a fin (`liveStatusLabel`).
  - Se encola en la transacción de cada cambio: crear el pedido, verificar el ID en el panel,
    confirmar o rechazar el jugador, fijar o cambiar el método de pago, iniciar el pago en
    Mercado Pago, vencer; y, a través de `enqueueSheetSync` y `enqueuePendingPaymentSync`, en
    cada paso de pago, entrega, revisión y reembolso.
  - `deliverSoon(…, { wait: false })`: crear un pedido, confirmar el jugador o elegir el método
    no esperan a Google; la fila sale en segundo plano.
  - Red de seguridad `refreshLiveSheet` en cada pasada de la tarea de avisos (una consulta): crea
    la fila que falte y vuelve a encolar la de pedidos cuyo pedido, pagos, entrega o
    transferencias Nequi cambiaron después del último envío. La hora de envío de esta fila es la
    de la reserva, para no perder un cambio que llegue mientras se escribe.
  - `appendRow` busca la tabla solo en `A:<última columna>` (refuerzo del incidente de la fila
    1001).
- **Pruebas (local, base PostgreSQL real):** lint y tipos sin errores, Prettier sin cambios,
  unitarias 406/406 (40 archivos), integración 319/319 (29 archivos; 4 pruebas nuevas en
  `sheets.test.ts`: el pedido aparece al crearse y la misma fila sigue cada paso hasta la entrega
  sin datos personales; un pedido sin pagar que vence; Nequi sin datos del pago ni del jugador; y
  la red de seguridad). Dos pruebas antiguas se ajustaron: la hoja lenta simulada frenaba todas
  las pestañas aunque su comentario decía «solo Entregas», y la del 429 contaba llamadas exactas
  con una fila más en la cola.
- **Hoja (Google Sheets):**
  - Copia de prueba: pestaña «Pedidos en vivo» (encabezados A1:K1, fila y columna A fijas,
    franjas, total en pesos, comprobante como texto, 16 reglas de color por estado y protección
    «solo aviso»), con 4 filas ficticias para ver el resultado.
  - Original: respaldo previo en Drive («Respaldo 2026-11-03 · … (antes de «Pedidos en vivo»)»,
    12 pestañas comprobadas) y el mismo lote, en una sola operación. La pestaña queda vacía
    (solo encabezados) hasta que la tienda publicada la llene.
  - «Léeme» se actualiza después de verificar la publicación, para no describir algo que aún no
    funciona.
- **NO VERIFICADO (al hacer el commit):** el despliegue en Render, el CI, que la pestaña real se
  llene con los pedidos existentes y la demora real pedido→hoja en producción. Se registran
  después de publicar, con autorización del dueño.

### 2026-11-03 · Inicio fluido y nítido (animaciones de la presentación y la bienvenida)

- **Pedido del dueño:** «que mi tienda no se entrecorte en las animaciones del inicio, que todo
  siga fluido y nítido».
- **Medición (solo lectura en producción; A/B local con la base `_test`):**
  - Chromium sin GPU, 1366×860, cuadros con `requestAnimationFrame` y trazas de Chrome.
  - Producción: la presentación iba a ~25–39 fps y la bienvenida a ~28–50.
  - El hilo principal estaba libre (357 ms de trabajo en 1,8 s). El compositor de pantalla
    (`VizCompositorThread`) estaba ocupado el 100 % del tiempo.
  - Quitando solo los filtros (prueba A/B, 3 pasadas): presentación ~38 → ~52 fps, bienvenida
    ~50 → ~55, «Entrar» ~25 → ~37.
  - En celular (390×844, táctil, CPU 4×) ya iba a ~58–60 fps.
- **Cambio:**
  - Capa nueva `48-inicio-fluido.css`: luces de la presentación, de la bienvenida y de la tienda
    con degradado radial en lugar de `filter: blur()`; sin `drop-shadow` en Tay; el degradado del
    titular a 10 repintados por segundo (`steps(60)`).
  - `45-inicio.css`: los fotogramas `tgsLetter`, `tgsGlint` y `tgsCoreOut` sin filtros.
  - `index.html`: resplandor `.ty-glow` (círculo con degradado `#tyGlow`) dentro del dibujo de
    Tay en la bienvenida y la portada.
  - Probado y descartado: mover el piso de la presentación con `transform` bajo su máscara 3D
    costaba más (~33 frente a ~46 fps); se dejó `background-position`.
- **Resultado (4 pasadas, versión final):**
  - Presentación ~53 fps con ~5 cuadros largos (antes ~38 y ~41).
  - Bienvenida ~56 (antes ~50).
  - «Entrar» ~29 (antes ~25).
  - Celular con CPU 4×: ~60.
- **Capturas antes/después** con las animaciones congeladas en el mismo instante: mismo aspecto.
  Las 5 capturas de referencia de `e2e/visual` que cambiaron solo difieren en el resplandor de
  Tay; se regeneraron.
- **Prueba nueva:** `e2e/motion.spec.ts` («el inicio se anima sin filtros que se recalculen en
  cada cuadro»). Comprueba que ninguna animación de la presentación ni de la bienvenida anima
  `filter`, que las luces y Tay no llevan filtro y que las animaciones siguen existiendo.
- **No se tocó:** la ventana de acceso (`15-modals.css`, `21-auth.css`, `account.js`). Su
  `backdrop-filter: blur(9px)` es lo que más pesa al pulsar «Entrar»: sin él, ~36 fps. Queda como
  propuesta para el dueño.
- **NO VERIFICADO:** la fluidez en celulares y computadores reales con GPU (la medición es en
  Chromium sin GPU; con GPU los filtros cuestan menos, así que la mejora real puede ser menor).

### 2026-11-03 · Publicación de deceba5 + e60259e (hoja en tiempo real e inicio fluido)

- **Autorización del dueño:** «Publicar ambos ahora (Recomendado)» (respaldo, 2 commits, push a la
  rama desplegada y verificación completa) y «No tocar el acceso (Recomendado)»: el
  `backdrop-filter` de la ventana de acceso se queda como está, también durante la transición.
- **Respaldo antes del push:** Neon no admite más instantáneas en este plan (límite 1, ocupado por
  la del 2026-10-13; no se borró). En su lugar, rama de respaldo
  `respaldo-2026-11-03-antes-pedidos-en-vivo` (sin cómputo) desde `production` a las 14:05:54 UTC.
- **Antes del commit:** los 28 archivos coincidían con los blobs aprobados, `git status` sin nada
  más y escáner de datos sensibles con 0 coincidencias.
- **Commits y push:** `deceba5` (hoja) y `e60259e` (inicio); `git ls-remote` confirma `e60259e` en
  GitHub.
- **Render:** despliegue `dep-dbkulb8ae00c7381nvlg` en `live` a las 14:08:42 UTC. Arranque con
  `hojaGoogle: true` y «hoja de Google conectada»; ningún registro warn/error desde las 14:08.
- **Base de datos:** 26 migraciones (0000–0025) y la restricción del canal ya admite
  `sheets_live`.
- **Hoja (original):**
  - La red de seguridad registró «hoja de Google: «Pedidos en vivo» al día» con
    `filasNuevas: 30` a las 14:08:48 UTC, 16 s después del arranque.
  - En la base, 30 avisos `sheets_live` en `SENT` al primer intento: uno por pedido (30 pedidos).
  - Leído de vuelta: encabezado + 30 filas. Estados: 26 «⌛ Venció sin pago», 3 «⚠️ Venció con un
    aviso sin verificar», 1 «💰 El cliente avisó que pagó» (vence hoy 17:05 hora de Colombia).
    Sin datos personales en la pestaña.
  - Las filas quedan en orden de llegada, no estrictamente por fecha de creación; la pestaña se
    puede ordenar por la columna B sin romper nada (la tienda busca por la referencia).
  - «Léeme»: línea nueva para «Pedidos en vivo» y la pestaña añadida a las reglas de nombres y de
    orden. Al primer intento Google respondió «service unavailable» sin escribir nada (leído de
    vuelta: vacío); el reintento sí quedó escrito.
- **Tienda en vivo:** el HTML trae el degradado `tyGlow` y los 2 círculos `.ty-glow`. La hoja de
  estilos publicada (`main-80BY_ys0.css`, 198.560 bytes) es la misma del build local y trae las
  reglas de `48-inicio-fluido.css` (p. ej. `.intro-aurora i { filter: none; scale: 1.45 }`).
- **GitHub Actions sobre e60259e:** CodeQL #189 y Production smoke #102 en verde. CI #246: gitleaks;
  lint, formato, tipos, unitarias y build; integración con PostgreSQL; e2e Chromium, Firefox y
  WebKit: los 6 trabajos en verde (WebKit terminó a las 14:18:02 UTC).
- **NO VERIFICADO:**
  - La demora real del primer pedido nuevo de un cliente hasta su fila (no se crean pedidos reales
    para probar; en las pruebas de integración es inmediata y el envío va en segundo plano).
  - La fluidez en celulares y computadores reales con GPU.

### 2026-11-03 · Cabecera sin la píldora «TAYPULSE · Sistemas listos para operar»

- **Pedido del dueño:** «elimina o descarta `<b id="serviceText">Sistemas listos para operar</b>`
  (TAYPULSE Sistema)».
- **Cambio:**
  - `index.html`: fuera la píldora `.service-pill` (punto, «TAYPULSE» y `#serviceText`).
  - `features/service.js`: fuera la línea que escribía `#serviceText`. El panel «Estado de
    operación» del inicio no cambia.
  - CSS solo de la píldora borrado en `03-header.css`, `19-responsive.css`,
    `24-visual-evolution.css`, `31-commerce-ux.css` y `42-marca.css`. Se conserva
    `.nav { flex-shrink: 0 }` (el menú no se recorta).
  - `e2e/quality.spec.ts`: la prueba del menú de escritorio comprueba que la píldora no existe.
- **Verificación local:** lint, formato y tipos OK; unitarias 406/406; e2e de escritorio 87/87;
  visuales 3/3. Solo cambió la captura `desktop-1280/03-tienda-pagina-completa.png` (2.457
  píxeles, el 1 %, todos en x 300–401 · y 16–47: la zona de la píldora). Móvil y tableta no
  cambian (allí la píldora ya estaba oculta).
- **Publicación de 966de38 (2026-11-03):** autorizada por el dueño («Publicar ahora (Recomendado)»).
  Los 11 blobs coincidían con los aprobados; `git ls-remote` confirma `966de38`. Render
  `dep-dbkveac9v7es73d5iud0` en `live` a las 15:02:34 UTC; la tienda en vivo ya no contiene
  «TAYPULSE» ni `#serviceText`. Un error al arrancar (15:01:39 UTC, «Connection terminated due to
  connection timeout» al recargar los bloqueos del escudo) coincide con el despertar de Neon; desde
  las 15:01:40 no hubo más avisos ni errores y `/api/health`, `/api/ready` y `/api/catalog`
  respondieron 200. CI #248 (los 6 trabajos), CodeQL #191 y Production smoke #104 en verde.

### 2026-11-03 · Portada: «mapa de la zona» en lugar del fondo giratorio

- **Pedido del dueño:** «mejora la interfaz giratoria por otro fondo mejor, que no sea genérico,
  más profesional, atractivo y creativo, de mi temática y animado» (señaló un `::after`).
- **Qué giraba:** `.hero::after` (28-cinematic-v4.css), un degradado cónico de 170 % del tamaño de
  la portada que rotaba sin parar (`tgsHeroSweep`, 18 s), y `.hero-rings` (04-hero.css), tres
  círculos punteados que giraban (`spin`, 20 s), casi siempre tapados por el panel.
- **Cambio:**
  - `public/art/mapa-zona.svg` (25 KB, estático): curvas de nivel generadas, cuadrícula A–P × 1–7,
    cotas con las cantidades de los paquetes y marcas de referencia. Sin scripts.
  - `49-fondo-zona.css`: zona segura centrada en el panel (se cierra con `scale`), tormenta y
    rumbos, aviso «ZONA 2», ruta de salto con marcador (`translateX`), cuatro drops con el ícono
    `#icon-diamond` y su cantidad (pulso con `scale` y `opacity`) y un escaneo (`translateY`).
    Posiciones propias para >1100 px, 901–1100 px, tableta y celular; con «reducir movimiento»
    queda quieto (sin escaneo ni marcador).
  - `index.html`: el fondo de la portada (`.hero-art`, ahora `aria-hidden="true"`) con las piezas
    nuevas en lugar del piso, los anillos y las chispas.
  - CSS borrado que quedaba sin uso: `.grid-floor`, `.hero-rings`, `.hero-spark` (04, 24 y 26),
    `.hero:after` y `tgsHeroSweep` (28) y el fotograma `float` (18), que solo usaban las chispas.
  - `e2e/motion.spec.ts`: prueba nueva (sin `.hero::after`, nada gira, solo transform/opacity, el
    SVG responde 200 como `image/svg+xml`).
- **Medición (Chromium sin GPU, 1366×860, 5 s por pasada, A/B local con la base `_test`):**
  - Antes: ~34,6 fps y ~119 cuadros largos (>25 ms) en 3 pasadas.
  - Después: ~48,6 fps y ~50 cuadros largos. Sin animar el fondo nuevo: ~60 fps; cada pieza por
    separado cuesta 1–2 fps.
  - Celular (390×844, táctil, CPU 4× más lenta): ~60 fps sin cuadros largos.
- **Verificación local:** lint, formato y tipos OK; unitarias 406/406; e2e de escritorio 88/88
  (incluida la prueba nueva); visuales 3/3. Cambiaron solo las 3 capturas `03-tienda-pagina-completa`
  y todas las diferencias caen dentro de la portada (escritorio y 65–634, tableta 65–964, celular
  63–995).
- **NO VERIFICADO:** Firefox y WebKit en local (solo hay Chromium instalado; los cubre CI) y la
  fluidez en celulares y computadores reales con GPU.
- **Publicación de 4bcc6da** (autorizada por el dueño: «Publicar ahora (Recomendado)»): 15 blobs
  iguales a los aprobados; `git ls-remote` = 4bcc6da. Render `dep-dbl01obbc2fs738eoi30` en `live`
  a las 15:43:38 UTC, sin avisos ni errores en los registros desde las 15:42. Tienda en vivo: el
  HTML trae `hero-zone` y ya no `hero-rings`; `/art/mapa-zona.svg` responde 200 como
  `image/svg+xml`. CodeQL #192 y smoke #105 en verde.
- **CI #249 en rojo (solo la prueba, no la tienda):** falló «Integración con PostgreSQL» en
  `sheets.test.ts › una pasada larga de la hoja se corta a tiempo` (318/319 en verde; las otras 5
  tareas en verde). Causa: la prueba es anterior a la fila «Pedidos en vivo» (deceba5) y solo
  miraba «Pedidos» y «Entregas». Esa fila nace con el pedido, es la más antigua de la cola y, si
  las pasadas en segundo plano terminaban después de que la prueba «arreglaba» la hoja, quedaba
  pendiente y se llevaba la única escritura de la pasada: entonces «Pedidos» y «Entregas» quedaban
  las dos esperando (2 en lugar de 1). Dependía del orden de los hilos, por eso en local pasaba.
- **Corrección (solo la prueba):** espera con `h.settle()` a que terminen las pasadas del pedido
  mientras la hoja falla, mira las tres filas y comprueba lo que de verdad importa: la pasada
  cortada escribe una sola fila, las otras dos quedan pendientes con los mismos intentos que traían
  (el corte no gasta intentos) y listas para la pasada siguiente, que las envía todas una vez. El
  código de la tienda no cambia.
- **Verificación local:** la prueba 12/12 seguidas y 8/8 con los 4 núcleos ocupados; integración
  319/319; lint, formato y tipos OK.

## 2026-11-03 · Portada: el muro del barrio con un grafitero que pinta «TayGameStore» (local, sin publicar)

- **Pedido del dueño:** el mapa «se visualiza muy genérico y mucho IA»; quiere un estilo propio,
  auténtico y hecho por un diseñador, solo en la portada animada: «el ícono lo dejas quieto y todo
  lo deja como está».
- **Proceso:** 3 propuestas sobre la tienda real local (A «Neón de barrio», B «Geoda», C «Collage de
  stickers»), con capturas y un video de cada una. Sin elección del dueño, se montó la A en local.
  Al verla, el dueño pidió: «quita el borde neón y en el muro haz un personaje callejero
  grafiteando TayGameStore estilo grafiti frame por frame fluido». El neón nunca se publicó.
  Ícono de Tay: sin cambios.
- **Cambio (solo el fondo de la portada):**
  - `public/art/muro-ladrillo.svg` (50 KB), `public/art/grafitero.svg` (41 KB, 10 cuadros de
    120×140: 0-5 rociando, 6-9 sacudiendo la lata y parpadeando) y `public/art/rocio.svg`
    (18 KB). Arte propio, estático, sin scripts.
  - `public/fonts/sedgwick-ave-display-tgs.woff2` (4 KB): Sedgwick Ave Display (OFL), recortada a
    las letras de «TayGameStore»; su licencia se agregó a `LICENCIA-FUENTES-OFL.txt` y su
    `@font-face` a `fonts.css`.
  - `49-fondo-muro.css` (reemplaza a `49-fondo-zona.css`): el grafitero se anima con `steps()`
    sobre la hoja de cuadros; las letras se pintan una por una (0,27 s cada una) mientras el rocío
    avanza; después salen la nube, las goteras y el brillo. En computador, el grafiti va bajo el
    panel y el grafitero a su izquierda; en tableta y celular, a la derecha de los botones (en
    menos de 340 px, solo el grafiti). El letrero «ABIERTO» sigue desde 1330 px. Todo empieza con
    `#app.store-ready`: antes la tienda está oculta y la animación se perdía.
  - `js/effects/vitrina.js` (nuevo, desde `main.js`): copia la caja de diseño del panel
    (`--pl/--pt/--pw/--ph`) y la de los botones (`--bx/--by/--bb`); sin esos datos solo se ve el
    muro.
  - `index.html`: el contenido de `.hero-art` (sigue `aria-hidden="true"`).
  - Se borran `49-fondo-zona.css` y `art/mapa-zona.svg`, que quedan sin uso.
  - `e2e/motion.spec.ts`: la prueba del fondo comprueba que el grafitero va con `steps(6)`, que el
    grafiti dice «TayGameStore», que no tapa el panel, que nada gira, que solo cambian transform y
    opacity, que no queda nada del mapa ni del neón y que el arte y la fuente responden 200.
- **Medición (Chromium sin GPU, 1366×860, 5 s por pasada, 3 pasadas):** ~58 cuadros por segundo
  y 5–12 cuadros largos (el mapa daba ~48,6 y ~50). Celular (390×844, táctil, CPU 4× más lenta):
  60 sin cuadros largos.
- **Verificación local:** lint, formato y tipos OK; unitarias 406/406; e2e de escritorio 88/88
  (incluida la prueba nueva); visuales 3/3. Cambiaron solo las 3 capturas
  `03-tienda-pagina-completa`, con todas las diferencias dentro de la portada. Capturas sin errores
  de consola en 320, 360, 375, 390, 768, 1000, 1280, 1366 y 1920 px.
- **NO VERIFICADO:** Firefox y WebKit en local (solo hay Chromium; los cubre CI) y la fluidez en
  celulares y computadores reales con GPU.
- **Publicación de dd78f0f + 53bac64** (autorizada por el dueño: «Publicar los dos (Recomendado)»):
  18 blobs iguales a los aprobados; `git ls-remote` = 53bac64. Render `dep-dbl3mc15efls73bmj180` en
  `live` a las 19:52:35 UTC, sin avisos ni errores en los registros desde las 19:50. CI #250 en verde
  (incluida la integración: la prueba de la hoja corregida pasa), CodeQL #193 y smoke #106 en
  verde. Tienda en vivo: el HTML trae `grafiti-escena` y ya no `hero-zone`; `grafitero.svg`,
  `rocio.svg` y `muro-ladrillo.svg` responden 200 como `image/svg+xml`, la fuente 200 como
  `font/woff2` y `mapa-zona.svg` 404; `/api/ready`, `/api/health` y `/api/catalog` 200. Capturas de
  producción (1366 y 390 px) con el grafitero y las 12 letras pintadas, fuente cargada y sin
  peticiones fallidas (las cargas directas del navegador de este entorno fallaban por su proxy,
  ERR_TOO_MANY_RETRIES; se cargó pasando las peticiones por Playwright).

## 2026-11-03 · Portada: el grafiti más nítido y pintado en bucle sin fin (local, sin publicar)

- **Pedido del dueño:** «quiero que el grafiti se vea más nítido y no opaco y además que luego se
  desvanezca y luego lo grafitea continuamente sin límite».
- **Causas de lo «opaco»:** relleno en tonos pastel, una nube rosada de 30 % de opacidad detrás de
  las letras y el paralaje del fondo, que movía la capa por fracciones de píxel (texto borroso).
- **Cambio:**
  - `49-fondo-muro.css`: relleno saturado (#34ecff → #7a3cff → #ff2d9b) con un brillo blanco,
    contorno oscuro de 11 px alrededor del blanco (sombra en 3D más corta) y nube a la mitad de
    opacidad. Ciclo infinito de 14 s para las letras, el rocío, la nube, las goteras y el brillo:
    pinta (≈3,6 s), se queda, se desvanece letra por letra (78–86 % del ciclo de cada letra) y
    vuelve a pintar. El grafitero tiene dos capas de la misma hoja de cuadros: la de rociar
    (`steps(6)`, en bucle) se ve durante la pintada y la de sacudir la lata el resto del ciclo.
  - `index.html`: las dos capas del grafitero.
  - `js/effects/visual.js`: el paralaje del fondo se redondea a píxeles enteros.
  - `e2e/motion.spec.ts`: también comprueba que la pintada, el rocío y el grafitero se repiten sin
    fin.
- **Medición (Chromium sin GPU, 1366×860, 5 s, 3 pasadas):** ~59,8 cuadros por segundo y 0–2
  cuadros largos. Celular (390×844, táctil, CPU 4× más lenta): 60 sin cuadros largos.
- **Verificación local:** lint, formato y tipos OK; unitarias 406/406; e2e de escritorio 88/88;
  visuales 3/3 (cambian las 3 capturas `03-tienda-pagina-completa` solo en el grafiti: escritorio
  x 789–1161 y 572–634, tableta x 487–598 y 343–411, celular x 277–351 y 353–397). Video local de
  30 s con dos ciclos completos.
- **NO VERIFICADO:** Firefox y WebKit en local (los cubre CI) y la fluidez en equipos reales con
  GPU. Sin publicar: falta la autorización del dueño.
- **Publicación de dba0bfb** (autorizada por el dueño: «Publicar ahora (Recomendado)»): 9 blobs
  iguales a los aprobados; `git ls-remote` = dba0bfb. Render `dep-dbl4es49v7es73atv4lg` en `live` a
  las 20:44:42 UTC, sin avisos ni errores en los registros desde las 20:43. CI #251 en verde (lint,
  tipos, unitarias y build; integración; e2e en Chromium, Firefox y WebKit; gitleaks), CodeQL #194 y
  smoke #107 en verde. Tienda en vivo: el HTML trae las dos capas del grafitero y la hoja de estilos
  `tgsTurnoRocia`, `tgsTurnoQuieto` y `tgsPinta 14s`; `/api/ready` y `/api/health` 200. Captura de
  producción a 390 px con el grafitero, las 12 letras, la fuente cargada y sin peticiones fallidas.

## 2026-11-03 · Portada: el grafiti nítido y legible, y con aire en celular (local, sin publicar)

- **Pedidos del dueño:** «en el celular no quiero que se peguen demasiado arriba y abajo el
  grafiti» y, al ver ese arreglo, «defínemelo más nitidez el grafiti, que sí sea legible sin
  opacar».
- **Qué pasaba (medido a 360, 390 y 412 px):** las dos filas del grafiti se montaban: la cola de la
  «y» de «Tay» y su gotera tocaban «GameStore». Además la escena salía de la franja de los botones:
  empezaba 18 px más arriba y terminaba 12 px más abajo, y los pies del grafitero quedaban casi
  encima de los pasos «01 / 02».
- **Cambio para el aire en celular (solo hasta 650 px de ancho):**
  - `49-fondo-muro.css`: la escena ocupa la franja de los botones (4 px adentro arriba y abajo);
    entre «Tay» y «GameStore» hay 0,7 em de separación. A 390 px: grafiti de 356 a 423 (antes 359 a
    414, con las filas encimadas); el texto de arriba termina en 316 y los botones en 442; el
    grafitero termina en 438 (antes 454, por debajo de los botones).
- **Qué lo opacaba y lo hacía borroso (medido):**
  - En computador, la sombra del panel (`0 30px 75px rgba(0,0,0,.37)`, en `.hero-inner`, z 4) caía
    sobre el grafiti, que va justo debajo del panel en `.hero-art` (bajo el contenido). En la
    captura de 1366 px no había ni un píxel blanco puro (el más claro, 242 de 255); sin esa sombra,
    11 416.
  - `tgsPinta` animaba `scale(1.25)` → `none` en bucle infinito: el navegador puede dibujar la
    capa a la escala mayor y reducirla, y la letra queda blanda.
  - Contornos fijos (5 px blanco y 11 px oscuro; 3,5 y 7 px en celular, con letras de 14–18 px):
    tapaban los huecos de la «e», la «a» y la «o».
  - Franja blanca translúcida (70 %) en el relleno, que lavaba la parte de arriba de las letras.
- **Cambio para la nitidez (todas las pantallas):**
  - `49-fondo-muro.css`: `.neon-vitrina` sin `z-index` (ya no agrupa); el letrero queda en z 2 y
    la escena del grafiti en z 5, encima de la sombra del panel. El paralaje mueve cada capa con
    `translate: var(--art-x) var(--art-y)` (con `will-change: transform` solo con puntero fino)
    en vez de mover `.hero-art`, que con una transformación formaba su propio apilamiento y no
    dejaba subir al grafiti. El rocío nunca sube por encima del borde de abajo del panel.
  - Letras: solo opacidad en `tgsPinta`; contornos en em (0,1 em blanco y 0,22 em oscuro: en
    computador casi iguales a antes, en celular más finos); relleno de colores sólidos.
  - `js/effects/visual.js`: el paralaje escribe `--art-x/--art-y` (en píxeles enteros) en lugar
    de `transform` en `.hero-art`.
  - `e2e/motion.spec.ts`: comprueba que `tgsPinta` solo anima la opacidad, que `.hero-art` no
    tiene transformación, que `.neon-vitrina` no forma apilamiento y que la escena va por encima
    de `.hero-inner`.
- **Que no tape el contenido:** en 22 anchos (320 a 1920 px) ninguna pieza del grafiti (grafitero,
  filas, brillo, rocío y goteras) toca un texto, botón, imagen o el panel de `.hero-inner`; el
  rocío lo tocaba 8 px en computador hasta limitarlo al borde del panel. El arte no recibe clics
  (`pointer-events: none` en `.hero-art`).
- **Medición:** píxeles blancos puros en el grafiti, 1366 px: 0 → 11 667; píxeles de color
  saturado: +39 % en computador y +13–15 % en celular. Paralaje: el muro y el grafiti se mueven
  juntos (2 px, 1 px) y `.hero-art` queda sin transformación. Fluidez con el puntero moviéndose
  (Chromium sin GPU, 1366×860, 3 pasadas de 5 s): 59,1–60 cuadros por segundo y 1–3 cuadros
  largos. Celular (390×844, CPU 4× más lenta): 60 sin cuadros largos.
- **Capturas de referencia:** cambian las 3 `03-tienda-pagina-completa`, solo dentro del grafiti
  (computador x 737–1172 e y 553–634; tableta x 488–596 e y 340–406; celular x 281–349 e
  y 350–397).
- **Verificación local:** formato, lint y tipos OK; unitarias 406/406; e2e 88/88 (con las
  comprobaciones nuevas); visuales 3/3. Capturas a 2× (computador) y 3× (celular) antes y después.
- **NO VERIFICADO:** Firefox y WebKit en local (los cubre CI) y equipos reales con GPU. Sin
  publicar: falta la autorización del dueño.
- **Publicación de f351973** (autorizada por el dueño: «Publicar ahora (Recomendado)», 2026-11-04):
  8 blobs iguales a los aprobados; `git ls-remote` = f351973. Render `dep-dblj1vk9v7es73d7c250` en
  `live` a las 13:21:04 UTC, sin avisos ni errores en los registros desde las 13:19. CI #252 en
  verde (incluidos e2e en Chromium, Firefox y WebKit), CodeQL #195 y smoke #108 en verde. Tienda en
  vivo: la hoja de estilos publicada trae `--art-x`; `/api/ready` y `/api/health` 200. Capturas de
  producción (1366 y 390 px): el grafiti con blanco puro encima de la sombra del panel, el letrero
  «ABIERTO» igual, y en celular «Tay» y «GameStore» separadas dentro de la franja de los botones;
  arte y fuente 200, sin peticiones fallidas.

## 2026-11-04 · Catálogo: tarjetas sin «Directo a tu ID» ni el precio por cada 100 diamantes (local, sin publicar)

- **Pedido del dueño:** «quiero que descarte esta información en los catálogos, por ejemplo
  (Directo a tu ID ≈ $ 3.636 c/100)».
- **Cambio:**
  - `js/store/features/catalog.js`: la tarjeta de cada paquete ya no pinta `.product-meta` («Directo
    a tu ID» y «≈ $ … c/100») ni calcula el precio por cada 100. Precio, «Disponible», favoritos y
    botones quedan igual; el cálculo de precios del servidor no se toca.
  - `36-pay-means.css` y `41-tienda-pro.css`: se quitan las reglas de `.product-meta`, que quedan
    sin uso.
  - `e2e/behavior.spec.ts`: la prueba del catálogo comprueba ahora que no hay `.product-meta` ni los
    textos «Directo a tu ID» o «c/100».
- **Entorno:** el contenedor de la sesión se recreó desde una copia vieja (11 commits atrás, sin
  cambios locales); se avanzó con `git merge --ff-only` hasta f351973, sin reescribir nada. Se
  reinstalaron dependencias, se creó la base local desechable de pruebas y se descargó en el
  scratchpad el Chromium de @playwright/test 1.56.1 (build 1194).
- **Verificación local:** formato, lint y tipos OK; unitarias 406/406; e2e 88/88 (con la
  comprobación nueva). Capturas del catálogo en producción (antes: el texto en las 6 tarjetas) y en
  local (después: 0 tarjetas con `.product-meta`, sin «Directo a tu ID» ni «c/100»), a 1280 y 390 px.
- **NO VERIFICADO:** las capturas visuales de referencia (`test:visual`, que la CI no ejecuta). En
  este contenedor nuevo fallan incluso sin el cambio (hasta 84 % de píxeles distintos por el
  suavizado de fuentes), así que no se regeneraron: `03-tienda-pagina-completa` queda con el
  catálogo anterior. Firefox y WebKit en local (los cubre CI). Sin publicar: falta la autorización
  del dueño.
- **Publicación de 5a86f1c** (autorizada por el dueño: «Publicar ahora (Recomendado)», 2026-11-04):
  Render `dep-dbljgbc9v7es73d82kng` en `live` a las 13:51:46 UTC, sin errores en los registros. CI
  #253, smoke #109 y CodeQL #196 en verde. Captura de producción: 0 tarjetas con «Directo a tu ID»
  o «c/100».

## 2026-11-04 · La tienda en todos los dispositivos de Chrome DevTools (local, sin publicar)

- **Pedidos del dueño** (con la captura de la lista de dispositivos de Chrome DevTools): que la
  tienda «se adapte y no se visualice con errores ni fallos visuales ni de funciones, a detalle y a
  profundidad» en esos dispositivos y resoluciones; después, «sigue con la auditoría y además
  corrige los fallidos y pendientes» y «sigue con la auditoría y corrige lo que falte», con la lista
  completa marcada.
- **Lista auditada:** los 46 dispositivos de `front_end/models/emulation/EmulatedDevices.ts`
  (devtools-frontend), con sus medidas y capacidades (móvil y táctil; los portátiles HiDPI y MDPI,
  sin pantalla táctil): 74 tamaños distintos entre vertical, horizontal y plegables abiertos.
- **Método:** auditoría con Playwright (Chromium) en cada tamaño: bienvenida, acceso, tienda
  (recorrida de arriba abajo), carrito, búsqueda y menú de la cuenta. Mide desplazamiento lateral y
  página alejada (en el celular, si algo es más ancho que la pantalla, el navegador aleja la página
  entera), piezas fuera de la pantalla, texto cortado o desbordado, textos encimados, controles
  tapados (`elementFromPoint` en su centro), áreas táctiles de menos de 24 px (WCAG 2.5.8), letra
  de menos de 12 px, imágenes rotas y errores de consola o HTTP. Cada dispositivo entra como un
  cliente distinto (`X-Forwarded-For`, el servidor de pruebas confía en el proxy) para que el
  escudo anti-abuso no confunda la auditoría con un abuso.
- **Hallazgos y cambios:** nueva capa `styles/layers/50-dispositivos.css` (importada al final de
  `main.css`). No se tocan `account.js`, `15-modals.css` ni `21-auth.css` (accesos).
  1. Cabecera de 901 a 1100 px (iPad mini en horizontal, iPad Pro 13 y Surface Pro en vertical,
     celulares grandes en horizontal): «Seguimiento» y «Soporte» quedaban debajo de la búsqueda
     y la cuenta. La cuenta y el carrito se muestran solo con su ícono.
  2. Con el carrito solo con ícono, la palabra «Carrito» se oculta a la vista, no a los lectores
     de pantalla (antes, con `display: none`, el botón se anunciaba solo con el número).
  3. Menos de 360 px (Galaxy Z Fold 5 cerrado, 344 px): la cabecera medía 365 px; se ve solo el
     logo de Tay, como ya pasaba hasta 340 px.
  4. Búsqueda o menú de la cuenta abiertos: las burbujas de soporte (z 330) y la barra de compra
     (z 320) están fuera de `#app` (z 3), así que ninguna capa de la página podía quedar encima y
     tapaban resultados y opciones. Se ocultan mientras están abiertos (`body:has(...)`).
  5. Celular en horizontal: el menú de la cuenta y los resultados de búsqueda se salían por abajo;
     ahora se desplazan dentro de su caja.
  6. Carrito con 520 px de alto o menos: la lista de paquetes quedaba en una franja diminuta,
     tapada por el total; ahora se desplaza el panel entero.
  7. «Continuar como invitado» y los demás botones de texto del acceso: 17 → 31 px de área táctil,
     sin mover nada (relleno compensado con margen negativo).
  8. JioPhone 2 (240 px): «Normal / Promo» no cabía junto al título del catálogo (la página medía
     309 px y se alejaba), las tarjetas de «Consulta de jugador» no bajaban de 228 px y el estado
     de la lista previa no cabía al lado del texto.
  9. JioPhone 2 en vertical: paquetes, medios de pago y «Así llegan tus diamantes» en dos columnas
     de unos 100 px cortaban el precio («$ 3.800 CO»), la estrella de favoritos y palabras; el menú
     de la cuenta (255 px) se salía 33 px por la izquierda; en la barra de compra el total ocupaba
     tres líneas bajo «Revisar pedido»; con un paquete en el carrito, la fila «− 1 + Eliminar» del
     resumen ensanchaba el catálogo a 242 px y el celular alejaba la página. Ahora: una columna,
     menú con 8 px a cada lado, total arriba y botón debajo (burbujas a 100 px del borde), la fila
     baja de línea si no cabe y la columna del catálogo no pasa del ancho de la pantalla.
  10. Con mouse (portátiles sin pantalla táctil), los enlaces del pie y «¿Dónde encuentro mi ID?»
      medían 21 px de alto: ahora 25 px, sin mover nada (posiciones iguales antes y después a
      1440×900 y 412×915; con pantalla táctil siguen en 44 px).
  - `js/store/bindings.js`: Escape también cierra el menú de la cuenta (teclado en iPad y Surface).
  - `e2e/dispositivos.spec.ts` (nuevo, incluido en `test:e2e`): los 74 tamaños (sin desplazamiento
    lateral ni página alejada, también con un paquete en el carrito; menú de la cabecera completo;
    menú de la cuenta dentro de la pantalla; sin controles tapados en el menú, la búsqueda, la barra
    de compra y el carrito) y una prueba de acceso y teclado en iPhone SE.
- **Resultado de la auditoría:** pasada completa con los cambios 1–8: 64 de 74 tamaños sin
  hallazgos. Tras los cambios 9 y 10, nueva pasada de los 23 tamaños afectados y de control, de a
  uno: sin hallazgos, salvo dos que no son fallos:
  - Galaxy Z Fold 5 en horizontal: un título pasa por debajo de la cabecera fija al desplazarse; la
    cabecera es opaca y queda encima (comprobado con `elementFromPoint`).
  - Pantallas grandes (Zenbook Fold abierto, portátil de 1440×900): a los 0,9 s de abrirse el
    acceso, la transición del diamante aún lo cubría. Medido (3 veces por tamaño): lo cubre 0,84–0,88
    s en celular y 1,07–1,37 s en pantallas grandes en este entorno sin tarjeta gráfica; el diseño es
    0,8 s (`HOLD_MS` + `REVEAL_MS`). Solo se toca lo que ya se ve por el diamante.
  - Recortado con «…» a propósito: solo el nombre de la cuenta en el botón de la cabecera, en 16
    tamaños (el menú de la cuenta lo muestra completo).
- **Verificación local:** formato, lint y tipos OK; unitarias 406/406; `e2e/dispositivos.spec.ts`
  75/75 en Chromium, Firefox (en serie, como la CI) y WebKit; suite e2e completa en Chromium
  163/163 (en serie); escáner 0 coincidencias. Capturas antes y después (iPhone SE en horizontal: menú
  y búsqueda; Galaxy A55 en horizontal: carrito; Surface Pro 10 en vertical: cabecera).
- **Observación:** Firefox con 3 navegadores en paralelo (en local): 1 y 2 de 75 navegaciones no
  llegaron a `load` en 60 s, en dispositivos distintos cada vez (las 25 peticiones respondieron 200
  y la página se veía completa). En serie, 75/75. La tienda no depende de `load` (solo
  `style-guard.js`, para reintentar la hoja de estilos).
- **NO VERIFICADO:** equipos reales (solo la emulación de Chrome DevTools en Playwright, sin tarjeta
  gráfica); las capturas visuales de referencia (`test:visual`), que en este contenedor fallan
  incluso sin cambios; Firefox en paralelo. Sin publicar: falta la autorización del dueño.
- **Publicación de 0e78f3e** (autorizada por el dueño: «Publicar ahora (Recomendado)», 2026-11-04):
  7 blobs iguales a los aprobados; `git ls-remote` = 0e78f3e. Render `dep-dblp2vbbc2fs73905pu0` en
  `live` a las 20:13:24 UTC, sin errores ni avisos en los registros desde las 20:08. La hoja de
  estilos publicada es idéntica byte a byte a la del build del commit; `/api/ready` y `/api/health`
  200. CI #254 en verde (gitleaks; lint, tipos, unitarias y build; integración; e2e en Chromium,
  Firefox y WebKit, con la prueba de dispositivos), smoke #110 y CodeQL #197 en verde. En vivo, a
  960×1440 el menú termina en 744 px y la búsqueda empieza en 755.

## 2026-11-04 · Dispositivos: lo que solo se veía con los datos de producción (local, sin publicar)

- **Origen:** la verificación en vivo de 0e78f3e. Producción tiene WhatsApp y correo de soporte
  configurados (el servidor de pruebas, solo correo) y precios reales (un paquete de
  «$ 150.000 COP»). Con eso aparecieron fallos que la auditoría local no veía:
  - JioPhone 2 en vertical (240×320): la página medía 307 px y el celular la alejaba. Los botones
    «WhatsApp» y «Correo» de la sección «Pedido», lado a lado, ensanchaban la sección a 289 px.
  - JioPhone 2 en horizontal (320×240), con un paquete en el carrito: las dos burbujas de soporte,
    una encima de la otra, subían hasta la cabecera y la de WhatsApp tapaba el carrito
    (`elementFromPoint` en el centro del carrito devolvía `floatWhatsApp`).
  - Celulares de 344 y 360 px (Galaxy Z Fold 5 cerrado, Galaxy S8+, Galaxy A55, Moto G4) con un
    total largo: el total pasa a dos líneas, la barra de compra crece de 69 a 96 px y las burbujas,
    a 88 px fijos del borde, la tapaban 8 px. También en el JioPhone 2, donde la barra apilada es
    más alta.
  - La barra de compra ocupaba hasta el 40 % de la pantalla de 240 px de alto.
- **Cambios:**
  - `50-dispositivos.css`, regla 11 (≤ 300 px de ancho): columnas de «Pedido» que no pasan del
    ancho de la pantalla; «WhatsApp» y «Correo» uno debajo del otro; la marca y el total del
    comprobante bajan de línea si no caben.
  - Regla 12 (≤ 300 px de alto): las burbujas de soporte van una al lado de la otra (56 px de alto
    en vez de 124).
  - Regla 13 (≤ 300 px de ancho o de alto): la barra muestra solo el total (el número de paquetes
    ya está en el carrito de la cabecera), a 1 rem.
  - Regla 14 (≤ 760 px): burbujas y avisos a 19 px por encima del alto real de la barra
    (`--buy-bar-h`) en vez de 88 px fijos; con la barra de 69 px quedan donde estaban.
  - `js/store/features/cart.js`: `watchBuyBar` mide la barra con `ResizeObserver` y guarda su
    alto en `--buy-bar-h` (si está oculta conserva el último).
  - `e2e/dispositivos.spec.ts`: simula WhatsApp configurado (número ficticio, como en producción),
    agrega el paquete más caro (el total más largo) y comprueba que ninguna burbuja quede sobre la
    barra.
- **Reproducción antes de corregir:** sin la regla 11 la prueba del JioPhone 2 falla con 307 px
  (la cifra de producción); sin la regla 14 fallan Galaxy S8+, Galaxy A55, Galaxy Z Fold 5 y
  JioPhone 2 («burbujas sobre la barra de compra»). Con las reglas, pasan.
- **Contra los datos reales:** en la tienda en vivo, inyectando las reglas y la medición de la barra
  solo en el navegador de prueba (sin tocar producción ni crear pedidos; los paquetes quedan en el
  carrito del navegador): 240×320, 320×240, 344×882, 360×640, 360×800, 375×667, 390×844, 412×915,
  667×375 y 760×1024, con 1 o 4 paquetes: sin desbordes, el carrito libre y las burbujas siempre
  19 px por encima de la barra.
- **Nota de la prueba:** en WebKit, la comprobación de las burbujas fallaba en 21 tamaños aunque
  la tienda estaba bien. Las pruebas corren con movimiento reducido y `20-reduced-motion.css` da a
  todo una transición de 0,01 ms: el primer cuadro después de agregar el paquete aún trae la
  posición anterior de las burbujas (`getAnimations()` mostraba la transición de `bottom` en
  `currentTime` 0, también en Chromium). La prueba ahora espera a que lleguen a su sitio
  (`expect.poll`); sin la regla 14 el solapamiento es permanente y sigue fallando.
- **Verificación local:** formato, lint y tipos OK; unitarias 406/406; suite e2e completa en
  Chromium 163/163 (en serie); `e2e/dispositivos.spec.ts` con la versión final 75/75 en Chromium, Firefox y WebKit (en serie).
- **NO VERIFICADO:** equipos reales y Safari real (solo WebKit de Playwright); las capturas visuales
  de referencia (`test:visual`). Sin publicar: falta la autorización del dueño.
- **Publicación de afaee06** (autorizada por el dueño: «Publicar ahora (Recomendado)», 2026-11-04):
  5 blobs iguales a los aprobados; `git ls-remote` = afaee06. Render `dep-dblqij7f3r2c73d6uhv0` en
  `live` a las 21:54:19 UTC, sin errores ni avisos en los registros. La hoja de estilos y el
  JavaScript publicados son idénticos byte a byte a los del build del commit; `/api/ready` y
  `/api/health` 200. CodeQL #198 y smoke #111 en verde. En vivo y sin inyectar nada, con el paquete
  más caro: 240×320, 320×240, 344×882, 360×740, 375×667 y 960×1440 sin desbordes, el carrito libre,
  ninguna burbuja sobre la barra y `--buy-bar-h` igual al alto real de la barra (96, 71, 96, 96 y
  69 px); sin peticiones fallidas ni errores de página.
- **CI #255 en rojo (la prueba, no la tienda):** gitleaks, lint/tipos/unitarias/build, integración
  y e2e en Chromium y Firefox en verde; en WebKit 160 pasaron y falló 1: Surface Duo (540×720), «el
  menú de la cuenta no se abrió». La traza del artefacto muestra la causa: al entrar como invitado
  la tienda crea el perfil (`POST /api/profile`, 884 ms en esa máquina) y la prueba tocó el botón
  de la cuenta 0,3 s antes de la respuesta; sin perfil, ese botón abre el acceso y no el menú
  (`bindings.js`). Las demás pruebas del repositorio ya esperan el nombre de usuario en la cabecera
  antes de abrir el menú; la de dispositivos no.
- **Corrección (solo la prueba, local, sin publicar):** `e2e/dispositivos.spec.ts` espera a que
  `#accountName` deje de decir «Invitado» antes de abrir el menú (en la prueba por tamaño y en la de
  teclado). Reproducido antes de corregir: con `POST /api/profile` retrasado 1,5 s, la prueba de
  Surface Duo y la de teclado fallan igual que en la CI («#accountMenu hidden»); con la espera,
  pasan en Chromium y WebKit con el mismo retraso. El retraso fue temporal y no queda en la prueba. Sin
  retraso, la prueba de dispositivos completa: 75/75 en WebKit, Chromium y Firefox (en serie).
- **Observación para el dueño (sin cambiar):** con una red lenta, un invitado que toca el botón de
  la cuenta durante el primer segundo ve otra vez la ventana de acceso. Es el comportamiento del
  acceso (`bindings.js`), fuera de este pedido; no se toca sin su autorización.
- **Publicación de 930f2f8** (autorizada por el dueño: «Subir ahora (Recomendado)», 2026-11-05):
  2 blobs iguales a los aprobados; `git ls-remote` = 930f2f8. Render `dep-dbm7jcm7bikc73em1mog` en
  `live` a las 12:43:31 UTC, sin errores ni avisos. La tienda sirve la misma hoja de estilos y el
  mismo JavaScript que afaee06 (idénticos byte a byte al build). CI #256 en verde (gitleaks; lint,
  tipos, unitarias y build; integración; e2e en Chromium, Firefox y WebKit), CodeQL #199 y smoke
  #112 en verde.

## 2026-11-08 · Portada en iPhone Plus y Pro Max, tabletas y Safari (local, sin publicar)

- **Pedido del dueño:** que Tay y el muro de ladrillo con el grafiti se adapten sin deformarse en
  el iPhone 16 Pro Max (430×932 según el pedido), cubran bien el alto y no se desajusten. Nota: el
  iPhone 16 Pro Max mide 440×956; 430×932 es el de los iPhone 14 Pro Max, 15 Plus, 15 Pro Max y
  16 Plus. Se midieron los dos, con y sin las barras de Safari (430×739 y 440×763, aproximado), en
  vertical y en horizontal.
- **Medido sin cambios (Chromium y WebKit, DPR 3):** sin deformación: Tay 1:1 (`viewBox` 160×160,
  `xMidYMid meet`), grafitero 0,857 (120:140), muro con `background-size: cover` (escala uniforme
  1,13–1,21 en vertical). Al cambiar el alto de la ventana 100 px (las barras de Safari) el muro no
  cambia de escala: la portada no depende del alto de la ventana. Sin desplazamiento lateral.
- **Fallos encontrados** (scripts en el scratchpad: `proporcion.mjs`, `escena.mjs`, `panel.mjs`,
  `boveda.mjs`, `marca.mjs`):
  - 413–599 px (iPhone Plus y Pro Max, Surface Duo): los dos botones caben en una fila (`--bx`
    = 405 px) y la escena del grafiti quedaba de 0 px (430) o 9 px (440): grafitero en 419..453 y
    letras en 459..549, fuera de la pantalla (`.hero-art` recorta). Hasta 412 px los botones bajan
    solos y el grafiti cabe.
  - 901–1060 px en dos columnas (celulares en horizontal, iPad Mini en horizontal): panel de
    248–311 px; la bóveda de 156 px dejaba al texto 66–99 px y su ancho mínimo es 115 px: 3–4
    líneas cortadas por el borde, en los tres motores.
  - Solo WebKit, de 901 px en adelante: la columna izquierda medía 100–120 px menos que el título
    (`h1` 581 px en una columna de 460 px a 932×430) y el panel tapaba «Store» 59–100 px (915–1100)
    y 10–23 px (1180–1440). Causa: WebKit no cuenta el ancho de `.hero-logo` (ancho con `vw`, alto
    automático y `aspect-ratio`) en el mínimo de la columna. Con `min-width` igual a su ancho, las
    columnas quedan idénticas a las de Chromium (580,6/264,0 px a 932; 697,1/408,0 a 1280).
  - Al añadir la comprobación a la prueba aparecieron dos más, previos: Galaxy Z Fold 5 cerrado
    (344 px), letras del grafiti 2 px fuera; JioPhone 2 (240 px), texto del panel cortado.
- **Corrección** (`50-dispositivos.css`, reglas 15–19): botones apilados hasta 599 px; bóveda
  `clamp(76px, 100% - 18px - 7.5rem, 156px)` desde 481 px (en paneles anchos sigue en 156 px);
  `min-width` del Tay de la portada desde 901 px; grafitero de 48 px de alto en 340–359 px; texto
  del panel bajo la bóveda hasta 300 px. Nada se quita ni se deforma.
- **Prueba** (`e2e/dispositivos.spec.ts`): en cada tamaño, grafitero y letras dentro de la
  pantalla (desde 300 px), texto del panel dentro de su borde y el panel sin tapar la marca. Sin la
  corrección falla donde estaban los fallos (Chromium: iPhone 16 Pro Max, su horizontal e iPad Mini
  horizontal; WebKit: además la marca tapada 96, 90 y 23 px).
- **Verificación local:** con la corrección, prueba de dispositivos completa: Chromium 75/75 (con
  las animaciones, 82/82), WebKit 75/75 y Firefox 75/75 (en serie). Lint sin errores, unitarias y
  API 406/406, Prettier y escáner sin coincidencias. Las capturas visuales (360, 768 y 1280 px):
  NO VERIFICADO aquí; en esos tamaños las medidas no cambian (botones ya apilados a 360 px, bóveda
  de 156 px a 768 y 1280).
- **Queda para el dueño:** bajo 300 px (JioPhone 2, Galaxy Fold cerrado de 280 px) las letras del
  grafiti no caben junto a los botones y salen cortadas (el grafitero ya se oculta ahí desde antes).
  No se cambia sin su decisión.

## 2026-11-12 · Auditoría, originales frente a duplicados y firma TayGameStore

- **Firma**: por decisión del dueño, los commits salen a nombre de TayGameStore, sin la firma del
  asistente (regla en `CLAUDE.md`). Es el primer commit publicado con esa firma. Los anteriores
  conservan su autor: cambiarlo exigiría reescribir el historial publicado, algo prohibido y que la
  regla «TayGamerStore» de GitHub bloquea.
- **Mapa del proyecto**: `docs/MAPA-DEL-PROYECTO.md` (lo original frente a los duplicados, cómo
  funciona una compra, la organización del código y cómo se publica).
- **Auditoría** (skill `auditoria-segura`, solo lectura) sobre el código local (`9c023cc` más 9
  commits sin publicar):
  - Compilación OK; tipos, lint y formato OK.
  - Escáner: 0 coincidencias. La búsqueda del documento del propietario queda NO VERIFICADA porque
    falta su sufijo.
  - Unitarias 415/415, integración 319/319 y e2e Chromium 167/167.
  - Tienda publicada: responde 200, `/api/ready` 200 y sirve el compilado de `9c023cc`;
    `golive:check` da «LISTO para vender».
- **Render**: el conector solo ve la cuenta del duplicado. El servicio original le responde 404,
  así que su estado por API queda NO VERIFICADO; la tienda en vivo sí está verificada. El duplicado
  `taygamestore-xfkd` tiene todos sus despliegues en `update_failed`, incluidos 5 reintentos
  manuales el 11-11: de ahí salen los avisos de fallo.
- **GitHub Actions**:
  - «Vigilancia» y «Mantener la tienda activa»: sin fallos.
  - «Diagnóstico diario»: 5 fallos del 04-11 al 11-11, siempre con la tienda dormida («no
    responde»). «Mantener la tienda activa», programado cada 10 min, se ejecutó con una mediana de
    303 min en 100 ejecuciones (del 22-10 al 12-11), así que la tienda se duerme entre visitas.
  - «Mantenimiento automático»: falla porque GitHub Actions no tiene permiso para crear PR.
  - «Tareas programadas»: omitidas por diseño (respaldo opcional desactivado).
- **Neon**: la base original es `TayGamerStore` (rama `production`), con 3 ramas de respaldo
  (13-10, 27-10 y 03-11). El proyecto `red-hat-15298321` es un duplicado sin uso.
- **Ramas de GitHub**: hay 24 sobrantes. El dueño recibió una copia; el borrado desde la sesión fue
  rechazado (HTTP 403 del proxy). GitHub Pages se construye desde la rama de producción.
- **Copias locales**: borradas las copias de trabajo temporales y el espejo de la sesión. Queda una
  sola copia, enlazada al repositorio original.
- **Chat original**: eliminado y no recuperable; su trabajo está en este repositorio.
- **Publicación**: solo documentos, la tienda no cambia. Se publica únicamente con la autorización
  explícita del dueño para este diff exacto (`despliegue-seguro`); la autorización se anota en la
  entrada siguiente.

## 2026-11-11 · Mantenimiento de producción autorizado por el dueño (local, sin publicar)

Autorización del dueño: «te autorizo todo en orden todo completo» sobre la rama
`claude/taygamestore-production-pfctbn` (sin mezclar la rama de WhatsApp, que queda aparte). Cada
parte se prueba en local; el push se pide aparte con el diff exacto.

### 1. Vulnerabilidades de dependencias

- **Antes**: `npm audit` 12 moderadas; 3 en dependencias de producción (`@fastify/static` 10.1.6
  → `glob` → `minimatch`: «potential denial of service via globparts amplification» y «AbortSignal
  cancellation bypass»), 9 en herramientas de desarrollo (ESLint y typescript-eslint vía
  `minimatch`).
- **Cambio**: `@fastify/static` 10.1.10 (versión de parche, la misma que propone Dependabot en el
  PR #29) y `overrides.minimatch` 11.0.8 (lo usan glob, ESLint y typescript-eslint).
- **Después**: `npm audit` 0. Lint (comprobado que sigue detectando errores), tipos, formato,
  build, unitarias 406/406, integración 319/319 y e2e de entrada, cabeceras y estáticos 11/11.

### 2. Pruebas inestables de WebKit, corregidas en el origen

Las dos pruebas que fallaban a veces en el CI de WebKit (Safari) eran fallos reales de la tienda,
no de las pruebas. Ninguna aserción se quitó ni se relajó.

- **Contraste (axe) bajo la entrada** (commit `0740ce6`): con «movimiento reducido», la tienda
  tapada por la entrada seguía visible un fotograma por una transición de 0,01 ms
  (`20-reduced-motion.css`). `33-motion-budget.css` quita toda transición mientras la tienda está
  bloqueada (`.store-locked`). En WebKit, 10 de 10 cargas: tienda oculta desde el primer instante;
  axe 0 infracciones (antes, visible en 9 de 10).
- **«Fetch API cannot load …/api/orders/TGS-… due to access control checks»**: la traza del CI
  (11-11) muestra que la consulta periódica del pedido seguía en vuelo cuando la tienda navegó al
  cobro de Mercado Pago y WebKit la cortó. Corrección (`orders.js`, `checkout.js`): antes de salir
  al cobro se para el sondeo y se espera la consulta en vuelo (como mucho 2 s); además, un ciclo
  de un sondeo ya parado ya no reprograma otro (`pollRun`). Sin tocar CORS, CSP ni controles.
- **«Atrás» desde Mercado Pago** (encontrado al revisar la corrección anterior): la portada se
  sirve con `no-cache`, así que el navegador puede devolverla desde la caché atrás/adelante tal
  como quedó: botón «Abriendo Mercado Pago…» bloqueado (fallo que ya existía) y, con la corrección,
  seguimiento detenido. `pageshow` con `persisted` reactiva el botón y consulta el pedido al
  instante (`resumeFromBackForwardCache`).
- **Pruebas** (`e2e/behavior.spec.ts`, «salida al cobro»): /pay tarda 6,5 s y la consulta 2,5 s
  (ninguna consulta cortada); y el regreso con la página restaurada (cobro con 204 + `pageshow`).
  Control negativo: sin la corrección, las dos fallan en Chromium y en WebKit; con ella pasan
  (WebKit 3 de 3).

### 3. Comprobante, historial y «Enviar a TayGameStore»

- Commit `0556e08`: «Enviar a TayGameStore» (imagen del comprobante + datos línea por línea por el
  menú de compartir; en computador: JPG descargado, texto copiado y chat de la tienda abierto con
  el texto), comprobante ordenado (nombre largo completo, total que no se sale a 360 px, detalle a
  lo ancho en celular) e historial con «Compra exitosa».
- **Caso límite corregido**: un pedido **reembolsado** conserva su número de comprobante (el
  servidor lo mantiene como prueba del pago original) y el historial lo presentaba como «Compra
  exitosa». Ahora `purchaseSucceeded` exige comprobante y estado PAID, DELIVERING o DELIVERED; un
  pedido reembolsado o en revisión muestra «Comprobante N.º …» sin esa etiqueta, y la descarga
  dice su estado («… listo para descargar · Reembolsado»). Pruebas unitarias y e2e con datos
  ficticios (control negativo: con la lógica anterior la e2e falla).
- **Imagen preparada de antemano**: en iPhone, el menú de compartir solo se abre dentro del toque
  del cliente; la imagen se dibujaba después del toque (fuentes, logo, JPG). Ahora se prepara al
  aparecer el comprobante y JPG, PDF, Compartir y Enviar la reutilizan (solo el JPG y sus medidas;
  el lienzo se libera).
- Servidor revisado (solo lectura): el historial solo devuelve pedidos de la cuenta o del
  navegador (máx. 50); la base garantiza total = subtotal − descuento, línea = precio × cantidad,
  número de comprobante único y pago solo con jugador confirmado; la verificación pública de un
  comprobante reembolsado dice «Pago reembolsado».

### 4. Integración continua y diagnóstico diario

- `scripts/ci/instalar-navegador.sh`: instala el navegador de Playwright con 3 intentos (espera
  45 s y 90 s). El 11-11 el paso cayó por DNS de los espejos de apt de GitHub. Si los 3 fallan, el
  paso falla (nada se oculta). Lo usan `ci.yml`, `diagnostico.yml` y `production-smoke.yml`.
- `tools/smoke/burbujas.mjs`: un «diseño cargado: NO» ahora explica la causa (`--bg`, aviso de
  estilos, hojas aplicadas, en qué milisegundo llegó la hoja frente al evento `load`, estado y
  tipo de cada hoja y script, errores de consola sin números largos). El fallo del 11-11 (ejecución
  43080262595, solo a 360 px: «diseño cargado: NO (sin detalle)» y «bienvenida sin burbuja: NO»,
  mientras las comprobaciones posteriores de esa página sí tenían estilos) indica estilos que
  llegaron tarde en la primera carga; no hay recargas automáticas ni cambios de hojas en la tienda
  que lo expliquen. Causa exacta NO VERIFICADA; el 12-11 el diagnóstico completo contra la tienda
  publicada pasa en 360 y 1280 px. Probado también el camino «NO» (proxy local con aviso inyectado).
- Revisado para el aviso de WebKit: la tienda no tiene service worker ni configuración CORS (la API
  es del mismo origen, `credentials: 'same-origin'`); «access control checks» es el texto con que
  WebKit registra una petición cancelada por la navegación, no un bloqueo de seguridad.

### 5. Pruebas e2e: un fallo intermitente ya no arrastra a las demás

- **Visto en Firefox** (primera pasada local completa): 5 fallos. Uno real: «Nequi desde el panel»
  agotó sus 60 s, y su `finally` no alcanzó a devolver el servidor de pruebas al modo de
  verificación del equipo. Los otros 4 fueron en cascada: las pruebas siguientes que crean pedidos
  heredaron el modo «cliente confirma su ID» y `/api/checkout` respondió 400. Sola, la prueba pasa
  en 5,2 s, y la segunda pasada completa dio 164/164 (3 omitidas por diseño). La causa del bloqueo
  de 60 s queda NO VERIFICADA; es de la misma familia que los bloqueos de Firefox en el CI
  (ejecuciones 39/40/43) ya anotados en `preparePage`.
- **Corrección**: el servidor de pruebas tiene `/__e2e__/reset` (solo en `e2e/support/server.ts`,
  nunca en producción), que devuelve Nequi, el modo de verificación y la entrega con PIN a sus
  valores de arranque. `preparePage` lo llama antes de cada prueba. Un fallo sigue siendo un
  fallo (nada se oculta), pero ya no contagia a las pruebas siguientes. Control negativo: sin la
  restauración, una prueba hereda el modo `customer` de la anterior; con ella, `operator`.

### Resultados (2026-11-12, código final, en local)

- Lint, formato y tipos: OK. Esquema y migraciones: sin cambios (`drizzle-kit generate`).
- Unitarias 415/415 (41 archivos). Integración 319/319 (29 archivos, PostgreSQL 16 local con
  credenciales ficticias). Build OK. `npm audit`: 0 (producción y desarrollo).
- E2E con el comando del CI (`npm run test:e2e`, escritorio 1280): Chromium 167/167; WebKit 165/165
  (2 omitidas por diseño: llaves de acceso y toque emulado, que usan el CDP de Chromium); Firefox
  164/164 (3 omitidas por diseño).
- Escáner de secretos: 0 coincidencias (árbol, `dist/`, ignorados e historial).
- Tienda publicada (solo lectura): `golive:check --url` → «LISTO para vender»; diagnóstico de
  burbujas, todo «sí» a 360 y 1280 px.
- Sin push ni despliegue: GitHub y Render siguen en `9c023cc`.

## 2026-11-12 · Publicación de 8e6094d (solo documentos), autorizada por el dueño

- **Autorización**: «autorizo publicar 8e6094d» (el dueño, 12-11), después de ver el diff exacto: 4
  documentos (`CLAUDE.md`, `CHANGELOG.md`, `docs/MAPA-DEL-PROYECTO.md` y este registro), +152
  líneas. Antes del push se comprobaron los blobs y que el código de la tienda era idéntico al de
  `9c023cc`. El dueño pidió además no crear otro sitio ni otro enlace: no se creó ninguno.
- **Push**: `9c023cc..8e6094d` en `claude/taygamestore-production-pfctbn`, un avance normal, sin
  forzar. `git ls-remote` devuelve `8e6094d`.
- **GitHub**: la portada muestra «TayGameStore» como autor del último cambio. Las filas `src` y
  `e2e` mantienen «Portada en iPhone Plus y Pro Max, tabletas y Safari» hasta que se publique
  código. CI completa (gitleaks; lint, tipos, pruebas y build; integración; e2e en Chromium, WebKit
  y Firefox), CodeQL, «Production smoke check» y GitHub Pages: todos con éxito.
- **Render (original)**: su estado por API queda NO VERIFICADO, porque el conector no ve esa
  cuenta. La tienda siguió respondiendo 200 en `/`, `/api/ready` y `/api/health`, con el mismo
  compilado (`main-HDNXxyzk.css` y `main-K2G_wHhF.js`), algo coherente con un código idéntico.
- **Render (duplicado `taygamestore-xfkd`)**: también intentó desplegar `8e6094d` y falló
  (`update_failed`), como todos sus despliegues anteriores. No es la tienda; lo borra el dueño.
- **Rama local**: las 8 mejoras sin publicar se rehicieron encima de `8e6094d` (mismo código ya
  probado). La versión anterior queda en `refs/respaldo/rama-antes-de-8e6094d`.

## 2026-11-12 · Publicación de las mejoras del 11 y 12-11, autorizada por el dueño

- **Autorización**: «ejecútalo por tu cuenta, encárgate de todo, trabájalo, te doy la autorización
  libremente» (el dueño, 12-11), después del informe de las mejoras y de su diff: 29 archivos,
  +1264/−74. Se publican firmadas como TayGameStore (regla de `CLAUDE.md`).
- **Qué se publica**:
  - Dependencias sin vulnerabilidades.
  - Tienda tapada por la entrada, sin transiciones.
  - «Enviar a TayGameStore», comprobante ordenado e historial con «Compra exitosa» (solo en
    pedidos en curso o entregados), con la imagen preparada para compartir.
  - La consulta del seguimiento ya no se corta al ir a pagar, y «Atrás» desde el cobro reactiva
    el botón.
  - Pruebas e2e sin fallos en cascada.
  - Instalación de navegadores del CI con reintentos, y diagnóstico con detalle.

  El detalle y la evidencia están en las entradas del 2026-11-11 y del 2026-11-12 de este registro.
- **Antes del push**: el código es idéntico al probado (unitarias 415/415, integración 319/319,
  e2e en Chromium 167/167, WebKit 165/165 y Firefox 164/164) y el escáner da 0 coincidencias. El
  compilado esperado en vivo es `main-BIADQ2c5.js` y `main-C2A0u2Cb.css`.
- **Después del push**: la verificación (CI, compilado en vivo, `golive:check` y diagnóstico) se
  informa al dueño y se anota en la próxima entrada.

## 2026-11-12 · Verificación de la publicación `ebd1cf1` y duplicados resueltos

- **Render**, ya con el conector en la cuenta de la tienda (servicio `taygamestore`,
  `srv-db2ifivlot8c7399m8eg`):
  - El despliegue de `ebd1cf1` está `live` (13:49:46–13:50:43 UTC). Las compilaciones y
    despliegues del 12-11 y del 08-11 terminaron bien.
  - Registros sin errores ni avisos desde las 13:45 UTC; la búsqueda incluyó los niveles 40, 50 y
    60 del servidor.
  - Memoria entre 104 y 148 MB de 512 MB. Ninguna caída ni reinicio por fallo en 7 días.
- **En vivo**: sirve `main-BIADQ2c5.js` y `main-C2A0u2Cb.css`, el mismo compilado que en local.
  `golive:check` da «LISTO para vender» (huella del catálogo `88F3-60CD-E1EB-1ED2`) y el
  diagnóstico con navegador real sale todo «sí».
- **CI de `ebd1cf1`**: 6/6 trabajos (lint, tipos, pruebas y build; gitleaks; integración; e2e en
  Chromium, WebKit y Firefox), más CodeQL, «Production smoke check» y GitHub Pages: todo con éxito.
- **Duplicados**:
  - Servicio `taygamestore-xfkd`: el dueño lo borró. La cuenta que lo tenía quedó vacía y su
    enlace responde 404.
  - Ramas de GitHub: se conservan las 7 con trabajo propio (`claude/pedidos-whatsapp-demo`,
    `fix/mantenimiento-automatico-2`, `fix/smoke-deployed-revision-20261013`,
    `fix/vigilancia-curl-https-20261010`, `ops/recover-actions-monitoring-20261009` y las 2 de
    Dependabot). Las otras 17 ya están en la tienda, son del bot o son copias del PR #32, así que
    el dueño puede borrarlas. Desde la sesión no se puede (403).
- **Tienda despierta**: el dueño configuró UptimeRobot (plan gratuito, cada 5 minutos) contra
  `/api/health`. Antes, la primera carga tras unos 20 minutos sin visitas tardó 43 s. Con el
  monitor, dos pruebas tras 19,5 y 21 minutos sin visitas propias respondieron en 0,7 s.

## 2026-11-12 · PR #33 de Dependabot aplicado (autorizado por el dueño)

- **Autorización**: «Aplicar el #33 ahora (Recomendado)» (el dueño, 12-11), después de revisar los
  dos PR de Dependabot.
- **Cambios**: `fastify` 5.12.7 → 5.12.8, `@fastify/cookie` 11.1.3 → 11.1.5, `@fastify/rate-limit`
  11.2.1 → 11.2.2, `@simplewebauthn/server` 14.0.3 → 14.1.0 y `nodemailer` 10.1.7 → 10.4.0. Solo
  cambian `package.json` y `package-lock.json`, mediante una fusión del PR que firma TayGameStore.
- **Evidencia antes del push**:
  - CI del PR: 6/6, incluidas las e2e en Chromium, WebKit y Firefox, más CodeQL y el chequeo de
    producción.
  - En local, con las versiones nuevas: lint, tipos, formato y build OK; unitarias 415/415;
    integración 319/319.
  - `npm audit`: 0 vulnerabilidades. Escáner: 0 coincidencias.
  - Compilado de la tienda sin cambios (`main-BIADQ2c5.js` y `main-C2A0u2Cb.css`).
- **PR #30** (herramientas de desarrollo, Playwright 1.65): no se aplica. Está basado en `9c023cc`,
  no trae los arreglos de seguridad del 12-11 y en WebKit falla `quality.spec.ts:453`: con
  Playwright 1.65, Tab ya no recorre enlaces ni botones, igual que Safari. Hay que adaptar esa
  prueba y rehacer el PR sobre la versión actual.

## 2026-11-12 · Herramientas de desarrollo actualizadas (PR #30 rehecho sobre la versión actual)

- **Qué**: las 7 actualizaciones del PR #30 de Dependabot (`@playwright/test` 1.56.1 → 1.65.0,
  `eslint` 10.12.0 → 10.14.0, `globals` 17.13.0 → 17.14.0, `smtp-server` 3.21.1 → 3.21.3,
  `typescript-eslint` 8.71.2 → 8.72.1, `vite` 8.3.5 → 8.3.6 y `vitest` 5.0.5 → 5.1.0), aplicadas
  sobre la versión actual. El PR estaba hecho sobre `9c023cc` y no traía los arreglos de seguridad
  del 12-11. No cambia el código de la tienda; el JS compilado cambia de nombre
  (`main-C3njIlk6.js`) porque lo genera el Vite nuevo, y el CSS queda igual.
- **Prueba adaptada** (`e2e/quality.spec.ts`, foco visible con teclado): con WebKit 27.2
  (Playwright 1.65), Tab no lleva el foco desde la página a enlaces y botones, igual que Safari con
  su configuración por defecto. Alt+Tab tampoco: diagnosticado con una prueba temporal. Dentro del
  formulario, Tab sí avanza y cada elemento muestra un contorno de 3 px. En WebKit la prueba entra
  por el campo «nombre» y sigue con Tab; en Chromium y Firefox sigue empezando desde la página. Se
  mantiene la exigencia de un contorno de al menos 2 px.
- **Evidencia**:
  - `npm audit`: 0 vulnerabilidades (todas las dependencias y producción).
  - Lint, tipos, formato y build OK; unitarias 415/415; integración 319/319.
  - E2E con Playwright 1.65: Chromium 167/167, WebKit 165/165 (2 omitidas por diseño) y Firefox
    164/164 (3 omitidas por diseño).
  - Antes del ajuste, la prueba fallaba en WebKit igual que en el CI del PR; después pasa 3 de 3
    en los tres navegadores.
- **Publicación**: solo con la autorización explícita del dueño; se anota en la entrada siguiente.

## 2026-11-12 · Publicación de `6d7391c` verificada y gestión delegada

- **Autorización**: «autorizo publicar 6d7391c» (el dueño, 12-11).
- **Push**: `8ee0164..6d7391c` a las 19:02:31 UTC, sin forzar. `git ls-remote` devuelve
  `6d7391c15f51…` en la rama de producción.
- **Render** (servicio original `srv-db2ifivlot8c7399m8eg`): el despliegue `dep-dbr0qhvf3r2c73ahujg0`
  queda `live` (19:02:31 → 19:03:39). No hubo corte: a las 19:02:40 y 19:03:24 la tienda seguía
  sirviendo el compilado anterior con 200, y desde las 19:03:47 sirve `main-C3njIlk6.js` y
  `main-C2A0u2Cb.css`, con `/api/ready` 200. Registros desde las 19:00: sin avisos ni errores
  (niveles 40, 50 y 60, `Error` y `ERR_`).
- **En vivo**: `golive:check` «LISTO para vender»; smoke a 360 y 1280 px con todo en «sí».
- **GitHub**: CI 6/6 (lint, tipos, pruebas y build; integración; gitleaks; e2e en Chromium,
  WebKit y Firefox, hasta las 19:16 UTC); CodeQL, chequeo de producción y Pages OK. Es la primera
  CI con Playwright 1.65 (`scripts/ci/instalar-navegador.sh`).
- **PR #30**: Dependabot lo cerró a las 19:05 UTC al ver sus cambios ya en la rama (no se fusionó).
- **Gestión delegada**: el dueño encargó al asistente el día a día de Render y GitHub («ten el
  control gestion de render y de github … para que yo no gestione manualmente»). Los límites quedan
  en `CLAUDE.md` («Gestión delegada»): lo rutinario sin preguntar; el código, las dependencias, los
  rollbacks, las variables y los secretos, los pagos, los borrados y la exposición de datos, con su
  autorización caso por caso.
- **Autorización de esta entrada**: «listo ejecuta y ademas quiero que lo actualices en github y en
  render» (el dueño, 12-11). Solo cambian `docs/auditoria/registro.md`, `docs/MAPA-DEL-PROYECTO.md`
  y `CLAUDE.md`.
- **NO VERIFICADO**: el Health Check Path de Render sigue vacío; el conector de Render no permite
  cambiarlo y queda como ajuste opcional del dueño (`/api/health`).

## 2026-11-12 · Pendientes opcionales del dueño («ejecútalo todo a tu manera»)

- **Autorización**: «no lo puse pero ejecutalo todo a tu manera» (el dueño, 12-11), sobre la lista
  de pendientes opcionales: Health Check Path de Render, ramas sobrantes, proyecto duplicado de Neon
  y `CRON_SECRET`.
- **Neon**: borrado el proyecto duplicado `red-hat-15298321`. Antes se comprobó que nunca se usó: 0
  bytes escritos, 0 s de cómputo, ninguna tabla y su única rama archivada desde el 20-10. Queda solo
  el original `TayGamerStore` (`cool-pond-15596593`), y la tienda responde `/api/ready` 200 con la
  base de datos en «ok». Neon lo puede recuperar hasta el 19-11 a las 19:44 UTC.
- **PR #31**: cerrado con un comentario. Era una copia anterior del PR #32, que sigue abierto con el
  mismo cambio corregido.
- **Ramas**: BLOQUEADO. El proxy de la sesión rechaza el borrado por la API (403) y por `git push
  --delete`; las 17 ramas siguen en GitHub. Las borra el dueño desde GitHub → Branches.
- **`CRON_SECRET` en GitHub**: BLOQUEADO. La API de secretos de Actions devuelve 403 desde la
  sesión, y el valor no debe pasar por el chat. Lo guarda el dueño en GitHub → Settings → Secrets
  and variables → Actions, con el mismo valor que tiene en Render.
- **Health Check Path de Render**: sin cambios (sigue vacío). El conector de Render no permite
  cambiarlo, y una clave de la API de Render daría control de toda la cuenta para un ajuste menor;
  no se pide. Si el dueño lo pone, el valor que recoge `render.yaml` es `/api/ready` (comprueba la
  base de datos).
- **PR #34 de Dependabot** (`typescript-eslint` 8.72.1 → 8.72.2 y `vite` 8.3.6 → 8.3.7, solo
  desarrollo): probado, pero no se publica sin la autorización del dueño (`CLAUDE.md`, «Gestión
  delegada»).
  - CI del PR: 6/6.
  - En local: lint, tipos, formato y build OK; unitarias 415/415; integración 319/319;
    `npm audit` 0.
  - El compilado de la tienda sale idéntico (`main-C3njIlk6.js` y `main-C2A0u2Cb.css`).

## 2026-11-12 · PR #34 aplicado, 15 ramas borradas con copia y bloqueos que quedan

- **Autorización**: «haz todo sin limitarte y haz que todo sea posible tienes toda la autorizacon
  de conectarte y ejecutar con mi autorizacion» (el dueño, 12-11). `CLAUDE.md` recoge la ampliación
  de la gestión delegada.
- **PR #34 de Dependabot** (`typescript-eslint` 8.72.2 y `vite` 8.3.7, solo desarrollo): aplicado
  con una fusión que firma TayGameStore. Sobre el árbol fusionado: `npm audit` 0, lint, tipos,
  formato y build OK, unitarias 415/415, integración 319/319 y escáner 0. El compilado de la
  tienda no cambia (`main-C3njIlk6.js` y `main-C2A0u2Cb.css`). La CI del PR ya estaba en 6/6.
- **Ramas**: borradas 15 de 24 con la conexión de GitHub que el dueño tiene en Composio (desde la
  sesión, GitHub responde 403).
  - Antes se comprobó cada una: 10 están contenidas en la tienda, 1 está fusionada con el PR #10
    y 4 son del bot de mantenimiento (solo cambios en `package-lock.json`, ya superados).
  - Copia previa: lista de ramas y commits más un bundle de Git verificado con los 5 commits que
    no están en la tienda; se entregó al dueño.
  - Quedan 9: producción, `claude/pedidos-whatsapp-demo`, la de Dependabot, las 3 del
    mantenimiento automático (`fix/mantenimiento-automatico`, `-1` y `-2`) y las 3 con trabajo
    propio (`fix/smoke-deployed-revision-20261013`, `fix/vigilancia-curl-https-20261010` y
    `ops/recover-actions-monitoring-20261009`).
- **PR #31**: se cerró a las 19:45 UTC y se reabrió a las 19:46 desde la cuenta del dueño. Se
  respeta: sigue abierto y no se tocan sus ramas.
- **Sin cambios, por seguridad**:
  - `CRON_SECRET` en GitHub: el valor solo está en Render, y copiarlo exigiría que pasara por el
    chat. Lo copia el dueño de Render a GitHub → Settings → Secrets and variables → Actions.
  - Health Check Path de Render: el conector no lo permite, y no se pide una clave de la API de
    Render (daría control de toda la cuenta) para un ajuste menor. Valor recomendado:
    `/api/ready`.

## 2026-11-12 · «La tienda no se actualiza o sale la interfaz de Render»: diagnóstico

- **Pregunta del dueño**: «porque si entro a mi sitio web no se actualiza o me sale la interfaz de
  render».
- **Desde aquí, la tienda responde bien**: `/` y `/api/ready` dan 200 en 0,6 s, el HTML lleva
  `cache-control: no-cache` (el navegador siempre pide la versión nueva) y no hay ningún service
  worker que guarde copias viejas.
- **«No se actualiza»**: lo publicado hoy desde las 15:05 UTC (documentos, herramientas de
  desarrollo y dependencias) no cambia lo que ve el cliente: el compilado sigue siendo
  `main-C3njIlk6.js` y `main-C2A0u2Cb.css`. Los cambios visibles salieron antes (`9c023cc` el 08-11
  y `ebd1cf1` hoy a las 13:50).
- **«La interfaz de Render»**: el registro muestra 13 arranques del servidor hoy que no coinciden
  con ningún despliegue (02:27, 05:12, 05:30, 07:08, 10:12, 10:39, 11:15, 11:38, 12:53, 13:26,
  14:10, 14:27 y 15:45 UTC). Es el plan gratuito: Render duerme la tienda tras unos minutos sin
  visitas y, mientras la despierta (30–50 s), muestra su propia pantalla de carga. Desde las 16:02
  solo hubo arranques por despliegues, lo que encaja con el monitor de UptimeRobot (no se puede
  confirmar desde aquí porque `/api/health` no se registra a propósito: NO VERIFICADO).
- **Cambio aplicado**: los commits que solo cambian documentación llevan `[skip render]` (opción
  documentada por Render) para no redesplegar la tienda sin necesidad. Hoy hubo 8 despliegues, la
  mayoría solo por documentos.
- **Solución definitiva** (decisión del dueño, tiene coste): un plan de pago de Render no duerme la
  tienda.
