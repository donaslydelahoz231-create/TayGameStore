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
