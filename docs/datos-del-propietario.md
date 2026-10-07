# Datos personales del propietario

Instrucción expresa del propietario (7 de octubre de 2026). Este documento no contiene ningún
dato personal: solo las reglas para tratarlos.

## Finalidad única

El nombre y el documento del propietario se usan solo para identificar al vendedor como exige
la ley de comercio electrónico (Ley 1480 de 2011, art. 50) en términos y privacidad. Ningún otro
uso: ni comercial, ni publicitario, ni perfiles, ni entrenamiento de IA, ni venta o cesión, salvo
obligación legal.

## Minimización

| Dato           | Dónde vive                            | Qué se publica                         |
| -------------- | ------------------------------------- | -------------------------------------- |
| Nombre         | Render, variable `LEGAL_NAME`         | Términos y privacidad (sin indexar)    |
| Documento      | Render, `LEGAL_ID`: **solo 4 dígitos** | «documento terminado en XXXX»          |
| Ciudad         | Render, `LEGAL_ADDRESS`               | Términos y privacidad (sin indexar)    |

- El número de documento completo **no se guarda** en el servidor, la base de datos, el
  repositorio ni los registros. Lo conserva solo el propietario y lo entrega él mismo ante un
  reclamo formal o a una autoridad.
- Comprobantes, correos, panel y API no incluyen nombre ni documento del propietario.
- Términos y privacidad envían `noindex, noarchive, nosnippet` (meta y cabecera `X-Robots-Tag`).

## Reglas para quien mantenga la tienda

- No escribir estos datos en código, pruebas, commits, issues, chats ni registros.
- No pedir datos adicionales sin indicar antes: qué dato, para qué, quién accede, dónde y cuánto
  tiempo se guarda, si se comparte, si se usa para IA, cómo se protege y cómo eliminarlo.
- Acceso: solo la cuenta de Render del propietario (con verificación en dos pasos).
- Eliminación: borrar las variables `LEGAL_*` en Render. Sin ellas la tienda no puede vender con
  pagos reales (la ley exige identificar al vendedor).
