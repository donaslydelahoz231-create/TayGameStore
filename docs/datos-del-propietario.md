# Datos personales del propietario — requisitos de seguridad

Instrucción expresa del propietario (7 de octubre de 2026). Son **requisitos del proyecto**:
cualquier cambio que pueda aumentar la exposición de estos datos necesita su autorización previa.
Este documento no contiene ningún dato personal.

## Requisitos

1. El número completo de identificación nunca aparece en frontend, HTML, JavaScript, código,
   Git, documentación, registros, mensajes de error ni respuestas de API.
2. En público solo se muestra lo estrictamente necesario para identificar legalmente al
   vendedor; nunca el número completo.
3. El número completo no se guarda en el servidor. Si una norma exigiera conservarlo, iría solo a
   almacenamiento privado, con acceso restringido y sin llegar al navegador.
4. Ningún uso distinto del legal y administrativo de la tienda: ni comercial, ni publicitario, ni
   perfiles, ni entrenamiento, evaluación o mejora de modelos de IA.
5. Nadie copia el número completo en archivos, documentación, código, commits, variables
   públicas, ejemplos, capturas, registros o mensajes. Para referirse a él: los 4 últimos dígitos.
6. Minimización: solo se conservan los datos realmente necesarios.
7. Copias de seguridad, snapshots, registros, historial de despliegues y cachés se revisan y se
   depuran cuando sea legal y técnicamente posible.
8. Ningún secreto, token, contraseña o credencial de pago en el código o el frontend: solo en
   variables protegidas del hosting.
9. No se afirma que un dato fue eliminado de un sistema si no se verificó técnicamente.
10. Antes de activar los pagos: revisión de qué datos existen, dónde, quién accede y qué ve un
    visitante.
11. Solo se publica lo que exige la norma; nada adicional por iniciativa propia.
12. No se vuelve a pedir ni a mostrar el número completo.

## Cómo se cumple (controles técnicos)

| Dato      | Dónde vive                                   | Qué ve un visitante                          |
| --------- | -------------------------------------------- | -------------------------------------------- |
| Nombre    | Render, variable `LEGAL_NAME`                 | Términos y privacidad (`noindex`)            |
| Documento | Render, `LEGAL_ID`: **solo 4 dígitos**         | «documento terminado en XXXX»                |
| Ciudad    | Render, `LEGAL_ADDRESS`                       | Términos y privacidad (`noindex`)            |

- `LEGAL_ID` solo acepta exactamente 4 dígitos: un número completo hace fallar el arranque y el
  error no repite el valor (`src/server/config/env.ts`, prueba en
  `tests/unit/legal-pages.test.ts`).
- La base de datos no tiene ningún campo de documento de identidad.
- Comprobantes, correos, panel y API no incluyen nombre ni documento del propietario.
- Términos y privacidad envían `noindex, noarchive, nosnippet` (meta y cabecera `X-Robots-Tag`).
- Los valores se escapan al ponerlos en la página: no se puede inyectar HTML.

## Cómo verificar que el número no está (sin escribirlo)

Buscar cualquier secuencia larga de dígitos que termine en los 4 últimos del documento
(`XXXX`), en el repositorio, su historial y los registros:

```bash
P='[0-9]([0-9. -]?[0-9]){5,}XXXX'
grep -rlE "$P" . --exclude-dir=node_modules --exclude-dir=.git   # archivos
git log --all -p | grep -cE "$P"                                  # historial (debe ser 0)
```

En Render: Logs → buscar `XXXX` (debe salir vacío).

## Eliminación

Borrar las variables `LEGAL_*` en Render (Environment). Sin ellas la tienda no puede activar
pagos reales: la ley exige identificar al vendedor.
