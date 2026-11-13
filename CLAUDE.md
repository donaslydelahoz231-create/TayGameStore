# Reglas del proyecto para asistentes de IA

- **Datos personales del propietario**: cumple los requisitos de
  [`docs/datos-del-propietario.md`](docs/datos-del-propietario.md). Nunca escribas, pidas ni
  muestres su número de identificación completo (refiérete a él solo con sus 4 últimos dígitos).
  Cualquier cambio que pueda aumentar la exposición de sus datos necesita su autorización previa.
- Ningún secreto, token o credencial en el código, el frontend, commits ni mensajes: solo en las
  variables protegidas del hosting. No pidas que se peguen en un chat.
- Nunca simules un pago aprobado en producción: Mercado Pago es la única autoridad de pago.

## Autorización explícita del propietario (requisitos 13–19 de `docs/datos-del-propietario.md`)

- **Producción**: no la modifiques sin autorización explícita. Cada push a la rama desplegada
  despliega en Render, así que también cuenta; lo mismo cambiar variables o reiniciar servicios.
- **Rollback**: no hagas ninguno sin autorización explícita.
- **Pagos**: no actives `PAYMENTS_ENABLED` ni `CHECKOUT_ENABLED` sin autorización explícita.
- **Datos personales y secretos**: no los muestres ni los vuelvas a escribir en informes, comandos,
  commits, registros ni archivos. En pruebas usa solo valores ficticios.
- **Exposición**: pide autorización antes de cualquier cambio que pueda aumentar la exposición de
  datos.
- **Evidencia**: si una comprobación no puede hacerse, márcala como NO VERIFICADO. No afirmes que
  algo fue publicado, eliminado o verificado sin evidencia técnica.

## Firma de los commits (decisión del dueño, 2026-11-12)

- Todo commit sale a nombre de **TayGameStore** (`TayGameStore <noreply@taygamestore.onrender.com>`),
  sin líneas `Co-Authored-By` ni `Claude-Session`, y los títulos y descripciones de PR van sin
  firma del asistente. Los commits ya publicados conservan su autor: cambiarlos exigiría reescribir
  el historial publicado, y eso está prohibido.

## Gestión delegada de Render y GitHub (decisión del dueño, 2026-11-12)

El dueño encargó al asistente la gestión diaria de Render y GitHub de la tienda («ten el control
gestion de render y de github … para que yo no gestione manualmente»). Sin pedir permiso cada vez,
el asistente puede:

- Vigilar la tienda, Render (despliegues, registros y métricas) y GitHub (CI, CodeQL, chequeo de
  producción y PR de Dependabot), y avisar al dueño de lo que encuentre.
- Volver a ejecutar flujos de GitHub Actions que fallen por causas pasajeras.
- Publicar cambios solo de documentación (`docs/` y `CHANGELOG.md`) que registren trabajo ya
  autorizado, siguiendo las etapas de `despliegue-seguro`. El mensaje de esos commits lleva
  `[skip render]`, para que Render no vuelva a desplegar la tienda sin necesidad.
- Volver a desplegar en Render el mismo commit que ya está publicado si un despliegue falla por una
  causa pasajera.

Ampliación del mismo día («haz todo sin limitarte … con mi autorización»): también puede, sin
preguntar,

- aplicar los PR de Dependabot cuando su CI está completa en verde y las pruebas locales pasan, y
  verificar el despliegue;
- borrar ramas ya integradas en la tienda o sustituidas, después de guardar una copia verificada y
  de comprobar que nadie las está usando (un PR abierto o reabierto se respeta).

Siguen necesitando la autorización explícita del dueño, caso por caso: publicar otros cambios de
código, hacer un rollback, cambiar variables o secretos de Render, activar los pagos, borrar
servicios o datos, cambiar los ajustes del repositorio o estas reglas, y cualquier cambio que pueda
aumentar la exposición de datos. Los secretos nunca pasan por el chat: si un paso exige ver o
escribir uno, lo hace el dueño.

Procedimientos: skill `auditoria-segura` (solo lectura) y skill `despliegue-seguro` (autorización
por etapas). La guardia `.claude/hooks/guardia-datos.sh` bloquea secretos, el documento completo y
la reescritura del historial; no la desactives ni la eludas.
