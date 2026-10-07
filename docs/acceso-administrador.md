# Acceso del administrador (dueño)

El panel **no es público**: solo existe en la dirección secreta `ADMIN_PATH`; `/admin.html` y
cualquier otra dirección responden «no existe», y para quien no es administrador todas las
rutas `/api/admin/*` también. La cuenta del dueño es el primer correo de `ADMIN_EMAILS`
(`taygamerstore@gmail.com`).

## Formas de entrar

| Método | Pasos | Nivel |
|---|---|---|
| **Correo + contraseña** | Contraseña creada por el dueño → código de 6 dígitos de su app autenticadora (Google Authenticator, Authy…) | Dos pasos |
| **Huella o llave de acceso** | El dispositivo pide huella, rostro o PIN | Dos pasos (dispositivo + biometría/PIN) |
| Google | Solo si se configuran `GOOGLE_CLIENT_ID/SECRET` → código de la app autenticadora | Dos pasos |

Los clientes **no** ven nada de esto: compran como invitados o con Google, Facebook o Discord
(los botones de redes se muestran siempre; cada red funciona cuando su credencial está en el
servidor).

## Primera vez (una sola vez)

1. En **Render → Environment** deben estar `ADMIN_EMAILS`, `ADMIN_PATH` y `ADMIN_SETUP_CODE`
   (frase de activación, mínimo 20 caracteres).
2. Abre `https://taygamestore.onrender.com` + `ADMIN_PATH` → «Primera vez»:
   - escribe la frase y **tu** contraseña (mínimo 12 caracteres) → «Crear contraseña»;
   - el panel te pide configurar la app autenticadora: «Mostrar mi clave» → escanea el **código
     QR** (o, en el celular, «Abrir en mi app autenticadora», o escribe la clave) → escribe el
     código de 6 dígitos (con o sin espacio) → guarda los códigos de recuperación. La clave es la
     misma aunque pulses el botón otra vez; si la app tiene varias entradas «TayGameStore»,
     borra las viejas;
   - opcional: «Activar huella» con la misma frase en tu celular o computador.
3. La frase deja de servir para la contraseña cuando ya existe una, y para la huella cuando ya
   hay una registrada. Puedes borrarla de Render cuando termines.

Después: «Seguridad de mi acceso» → cambiar contraseña; «Añadir huella de este equipo» para
otro dispositivo.

## Si el código no funciona

- Usa la entrada «TayGameStore» añadida con la clave que muestra **ahora** el panel.
- La hora del celular debe ser automática (los códigos dependen de la hora; se aceptan ±30 s).
- Tras varios códigos erróneos el escudo anti-abuso bloquea tu IP unos minutos y la cuenta 15
  minutos: espera y vuelve a intentar con calma (o entra con la huella, si ya la activaste).

## Seguridad

- Contraseña con **scrypt** (sal aleatoria, N=2¹⁶, r=8, p=2; OWASP), nunca en claro ni en
  registros. El mensaje de error no revela si el correo existe.
- 5 contraseñas o códigos equivocados en 15 minutos bloquean la cuenta (desde cualquier IP),
  además del límite por IP; queda alerta en la auditoría (que no se puede modificar).
- Huella: estándar WebAuthn con [SimpleWebAuthn](https://simplewebauthn.dev); solo se guarda la
  clave pública; retos de un solo uso (5 min), origen exacto, verificación del usuario
  obligatoria y contador anti-clonado.
- Quitar el correo de `ADMIN_EMAILS` revoca el acceso en la siguiente petición, con cualquier
  método.

Pruebas: `tests/integration/admin-access.test.ts` (frase, contraseña, bloqueo, huella,
repetición, firma alterada, otro dominio, llave clonada, cambio de contraseña) y
`e2e/behavior.spec.ts` (panel: contraseña → código; huella en Chromium con autenticador virtual).
