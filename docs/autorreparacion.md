# Autorreparación y mantenimiento automático (GitHub Actions)

GitHub Actions aporta vigilancia y mantenimiento; las tareas de pedidos y conciliación las gestiona principalmente el programador interno del servidor. El workflow `.github/workflows/tareas.yml` queda en espera intencional para limitar el consumo de Neon Free. No lo reactives hasta validar `CRON_SECRET`, idempotencia y presupuesto de cómputo.

## Vigilancia (`.github/workflows/vigilancia.yml`)

Cada 30 minutos consulta `/api/ready` (comprueba servidor y base de datos). Usa por defecto `https://taygamestore.onrender.com`; si el dominio cambia, define la variable opcional `PRODUCTION_URL` en GitHub Actions.

| Situación | Qué hace |
|---|---|
| Responde | Nada. Si había un incidente abierto, lo cierra con la hora de recuperación |
| No responde (3 intentos) | Reinicia **una vez** con el deploy hook de Render y espera hasta 12 min |
| Vuelve tras el reinicio | Registra un issue `incidente` ya cerrado ("reparada automáticamente") |
| Sigue caída | Abre un issue `incidente` y el workflow queda en rojo; no reintenta en bucle |

Reiniciar es seguro: vuelve a desplegar el último commit y el servidor es idempotente (un pago
o una entrega nunca se repiten por un reinicio). Revisa después las alertas del panel.

### Configurarla (una vez)

1. **Render** → tu servicio web → **Settings** → **Deploy Hook** → copia la URL.
2. **GitHub** → repositorio → **Settings** → **Secrets and variables** → **Actions**:
   - pestaña **Secrets** → *New repository secret* → `RENDER_DEPLOY_HOOK_URL` = la URL del paso 1
     (es secreta: quien la tenga puede redesplegar tu servicio);
   - pestaña **Variables** → *New repository variable* → `PRODUCTION_URL` =
     `https://tu-dominio` (sin barra final), solo si el dominio difiere del predeterminado.
3. **Actions** → *Vigilancia y autorreparación* → **Run workflow** para probarla.

Si no defines `PRODUCTION_URL`, se usa la URL pública predeterminada de TayGameStore. Sin el secreto del deploy hook, la vigilancia registra el incidente y avisa, sin reiniciar. El secreto habilita un redespliegue automático único si la comprobación falla. Eso puede activar un nuevo despliegue de producción; mantenlo sin configurar hasta decidir expresamente que quieres esa recuperación automática.

## Mantenimiento (`.github/workflows/mantenimiento.yml`)

Cada lunes aplica `npm audit fix` (sin `--force`), `eslint --fix` y `prettier`. Si algo cambia y
lint, tipos, pruebas unitarias y build pasan, abre un pull request `mantenimiento/auto-AAAAMMDD`
para que lo revises. Nunca hace push a la rama principal. Las actualizaciones de versiones las
propone Dependabot (`.github/dependabot.yml`).

Los pull requests creados por GitHub Actions no disparan la CI automáticamente (límite de
GitHub): la CI corre en cuanto haces cualquier push a esa rama o la fusionas.

## Requisito

GitHub Actions debe estar ejecutándose en el repositorio. Si los trabajos se quedan en cola y se
cancelan sin empezar, revisa **Settings → Actions** y la facturación de la organización
(issue #8).
