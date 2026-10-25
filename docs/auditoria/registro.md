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

### 2026-10-25 · Identidad visual «Facetas» (pedido del dueño)

- **Pedido:** «Puedes mejorar visualmente con css para que no se visualice tan genérico».
- **Diagnóstico (capturas de escritorio 1280 px y celular táctil 360 px):** lo genérico era la
  forma, no el color: casi todo era la misma tarjeta azul redondeada con borde de 1 px, los
  paquetes solo se distinguían por cuántos diamantes dibujaban y el precio (lo que se compara)
  tenía el mismo tamaño que el resto. Lo propio de la tienda ya existía: la mascota Tay es un
  diamante.
- **Cambios (`styles/layers/41-identidad-facetas.css`; en `catalog.js`, `data-tier` por
  paquete):** dos esquinas talladas (arriba a la izquierda y abajo a la derecha) en las tarjetas
  de paquete, el botón principal, las etiquetas doradas y el panel «LIVE STORE»; «rareza» por
  tamaño del paquete en el filo y el piso de la tarjeta (cian, azul, violeta, dorado; solo
  decoración); precio en Oxanium a 0,95 rem; un diamante en los rótulos de sección; la etiqueta
  dorada como placa (en celular, con la estrella de 44 px al lado, ocupa a veces dos líneas y
  la píldora se deformaba).
- **Fallo corregido:** con «reducir movimiento», `26-hardening.css` quita el desenfoque de la
  cabecera, pero su fondo al 87 % dejaba leer el texto que pasa por debajo (visible en las
  capturas). Ahora es opaca en ese caso.
- **Compatibilidad:** las esquinas talladas usan `corner-shape` dentro de `@supports`
  (Chromium 141 de las pruebas lo soporta). Safari y Firefox conservan las esquinas
  redondeadas; NO VERIFICADO en esos navegadores aquí (no están instalados en este entorno; la
  CI los corre).
- **Acceso intacto:** todo vive dentro de `#app`; las capturas 01 «entrada» y 02 «acceso»
  pasan sin regenerarse en los 3 tamaños; `features/account.js`, `15-modals.css` y
  `21-auth.css` sin cambios.
- **Pruebas:** lint, formato y tipos OK; unitarias y API 385/385; e2e 75/75 (incluye axe sin
  violaciones graves, sin desbordes de 360 a 1920 px y botones de cantidad completos); visuales
  3/3 (03 regenerada en los 3 tamaños tras revisarla); escáner 0.
- **Sin publicar:** commit local. El push despliega en Render; espera la autorización del dueño.

### 2026-10-25 · Emil Kowalski, Impeccable y Taste skill (pedido del dueño)

- **Pedido:** aplicar las animaciones de interfaz de Emil Kowalski, la limpieza de diseño de
  Impeccable (`pbakaus/impeccable`) y las referencias de Taste skill (`Leonxlnx/taste-skill`).
- **Qué se usó y qué no:** los tres repositorios se descargaron en una carpeta temporal y se
  leyeron sus guías (`emilkowalski/skills` › improve-animations y AUDIT.md; Impeccable ›
  SKILL.md, craft-floor.md y layout.md; Taste › SKILL.md). No se instalaron en el proyecto ni
  se ejecutaron sus scripts: Impeccable descarga y corre un binario, agrega hooks en
  `.claude/settings.local.json` y envía telemetría; Taste corre scripts de Node con Chrome.
  Instalarlos queda a decisión del dueño.
- **Emil (auditoría de movimiento, confirmada en el código):** `transition: 0.18s` sin propiedad
  en `.btn` (04-hero) y `.game-tab` (06-sections-catalog) animaba todo; la tarjeta respondía
  al cursor en 0,5 s (28-cinematic-v4); en pantallas táctiles el `:hover` pegado dejaba la
  tarjeta levantada e inclinada, y `pointermove` inclinaba la tarjeta con el dedo
  (`effects/cinematic.js`); el carrito usaba `ease` genérico. Corregido en
  `42-movimiento-y-limpieza.css` y en `cinematic.js` (sin inclinación con `pointerType`
  táctil). Excluidos con criterio: la onda del clic y las partículas usan `scale(0)` como
  efecto, no como elemento que aparece. Se respetó la decisión del dueño de conservar las
  animaciones de ambiente (aura del botón, anillos y barrido de las tarjetas).
- **Impeccable:** la franja de confianza (4 cajas iguales de ícono + título + texto) pasa a
  una banda con divisores; selección de texto, cursor y barra de desplazamiento con la marca.
  No se quitaron los rótulos sobre los títulos ni la numeración de las secciones, aunque
  Impeccable los prohíbe: describen el orden real de la compra y el dueño pidió no quitar
  contenido. Queda como decisión del dueño.
- **Taste:** su regla central, que la idea salga del propio producto, ya está aplicada con
  «Facetas» (el diamante de Tay). No se agregaron adornos nuevos.
- **Comprobado en local:** con el dedo la tarjeta tocada queda con `transform: none`; con
  ratón se eleva en 280 ms; `.btn` anima solo transform, border-color, background-color,
  color y box-shadow.
- **Pruebas:** lint, formato y tipos OK; unitarias y API 385/385; e2e 75/75; visuales 3/3 (03
  regenerada en los 3 tamaños; 01 «entrada» y 02 «acceso» sin cambios); escáner 0.
- **Sin publicar:** commit local; el push despliega en Render y espera la autorización del dueño.
