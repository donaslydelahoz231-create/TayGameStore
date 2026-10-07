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
