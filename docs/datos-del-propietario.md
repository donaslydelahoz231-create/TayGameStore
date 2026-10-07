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

### Autorización explícita del propietario

13. No se modifica producción sin su autorización explícita. Cuentan: un push a la rama
    desplegada (Render despliega cada commit), cambiar variables y reiniciar servicios.
14. No se hace ningún rollback sin su autorización explícita.
15. No se activan los pagos (`PAYMENTS_ENABLED`, `CHECKOUT_ENABLED`) sin su autorización explícita.
16. No se muestran ni se vuelven a escribir datos personales o secretos en informes, comandos,
    commits, registros ni archivos. Las pruebas usan solo valores ficticios.
17. Si una comprobación no puede hacerse, se marca como **NO VERIFICADO**.
18. No se afirma que algo fue publicado, eliminado o verificado sin evidencia técnica.
19. Se pide su autorización antes de cualquier cambio que pueda aumentar la exposición de datos.

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

El escáner busca cualquier secuencia de 7 o más dígitos que termine en los 4 últimos del
documento (`XXXX`), **con o sin separadores también dentro de esos 4 dígitos** (el formato
«x.xxx.xxx.xxx» los separa con un punto), en el árbol, `dist/`, los archivos ignorados y todo el
historial; además, secretos y `LEGAL_ID` con más de 4 dígitos. Solo imprime conteos:

```bash
TGS_SUFIJO_DOC=XXXX bash scripts/auditoria/escanear.sh   # debe terminar en «0 coincidencias»
```

En Render: Logs → buscar `XXXX`, `X.XXX` y `X XXX` (las tres deben salir vacías).

## Guardia automática y procedimientos

- `.claude/hooks/guardia-datos.sh` (activado en `.claude/settings.json`) bloquea antes de
  ejecutarse cualquier herramienta con secretos, el documento completo, `LEGAL_ID` largo, push
  forzado o reescritura del historial, y pide autorización para push, Render, GitHub, rutinas y
  n8n. Sus pruebas: `bash scripts/auditoria/probar-guardia.sh`. Para la regla del documento, el
  sufijo va en la variable de entorno `TGS_SUFIJO_DOC` del entorno de Claude o en
  `.claude/guardia.local` (no versionado). Las solicitudes de autorización solo llegan al dueño si
  la sesión está en modo de permisos «Ask/Default»; en modo `auto` las resuelve el clasificador.
- Skills: `.claude/skills/auditoria-segura` (solo lectura, informe en 6 secciones) y
  `.claude/skills/despliegue-seguro` (autorización por etapas).
- Registro de cambios autorizados: `docs/auditoria/registro.md`.

## Eliminación

Borrar las variables `LEGAL_*` en Render (Environment). Sin ellas la tienda no puede activar
pagos reales: la ley exige identificar al vendedor.
