# Contacto con redes autorizadas de recargas (listo para enviar)

> El dueño pidió no usar su Gmail ni sus cuentas personales desde la automatización: estos
> mensajes los envía él, desde el canal que elija (formulario web, WhatsApp o correo de la
> tienda). La automatización no se registra ni firma contratos en su nombre: una cuenta de
> revendedor exige la identidad y el RUT de quien vende.

## A quién escribir

Redes que distribuyen pines de **Garena Free Fire** en Colombia a través de InComm Colombia
(certificación POSA): **MOViiRED, Practisistemas (Practi), Refácil, RedCo, PTM, Full Carga y
Multipagas** ([POSA Colombia · Garena](https://posa.com.co/productos/garena)).

| Red | Dato verificable | Fuente |
|---|---|---|
| MOViiRED S.A.S. | NIT 900.392.611-6 · Carrera 21 No. 169-45, Bogotá | [Colombia Compra Eficiente](https://operaciones.colombiacompra.gov.co/sites/cce_public/files/documentos_adicionales_oc/documentos_moviired.pdf) |
| Practisistemas S.A.S. (Practi) | Chía, Cundinamarca (km 1,5 vía Chía-Cajicá, edificio OXXUS) | [einforma](https://directorio-empresas.einforma.co/informacion-empresa/practisistemas-ltda) · [La Nota Económica](https://lanotaeconomica.com.co/?p=18207) |
| Refácil, RedCo, PTM, Full Carga, Multipagas | Listadas como redes de pines Garena | [POSA Colombia · Garena](https://posa.com.co/productos/garena) |

Teléfonos, correos y formularios: tómalos **del sitio oficial de cada red** el día que escribas
(cambian, y no se copian de directorios de terceros). No envíes dinero a nadie que te contacte
primero ofreciendo "diamantes al por mayor": los distribuidores reales no lo hacen así.

## Lo que suelen pedir (confírmalo con cada red)

- RUT y, si eres empresa, certificado de Cámara de Comercio.
- Cédula del titular o representante legal.
- Cuenta bancaria a nombre del negocio para recargar saldo o liquidar.
- Datos del punto de venta (en este caso, la tienda en línea y su dirección web).

## Mensaje 1 · Primer contacto (formulario web o correo)

> **Asunto:** Solicitud de afiliación como comercio para venta de pines/recargas Garena Free Fire
>
> Hola. Soy el titular de **TayGameStore** (https://taygamestore.onrender.com), una tienda en
> línea de recargas de Free Fire en Colombia. Los pagos los procesa Mercado Pago y cada pedido
> se identifica con el ID de jugador del cliente; nunca pedimos contraseñas.
>
> Queremos vender sus productos de **Garena Free Fire** de forma autorizada y nos interesa:
>
> 1. Afiliarnos como comercio o revendedor y conocer requisitos, costos y comisiones.
> 2. Saber si ofrecen **API** para (a) validar un ID de jugador (nickname y región) y (b) hacer
>    la recarga por ID, con ambiente de pruebas y documentación técnica.
> 3. Si no hay API, cómo se compran y entregan los pines (portal, saldo prepagado) y qué
>    denominaciones manejan para Colombia (servidor de Latinoamérica).
>
> Quedo atento a los requisitos para iniciar. Gracias.

## Mensaje 2 · WhatsApp (corto)

> Hola, soy de TayGameStore, tienda en línea de recargas de Free Fire en Colombia. Queremos
> afiliarnos para vender pines/recargas de Garena de forma autorizada. ¿Qué requisitos piden y
> tienen API para recarga por ID de jugador? Gracias.

## Preguntas que hay que tener respondidas antes de firmar

- ¿Son distribuidor autorizado de Garena en Colombia? ¿Documento que lo acredite?
- ¿La API valida el ID antes de cobrar y devuelve nickname/región?
- ¿La recarga confirma en el momento o por notificación? ¿Se puede repetir con la misma
  referencia sin cobrar dos veces (idempotencia)?
- ¿Qué pasa si una recarga falla: reembolso del saldo, en qué plazo?
- Denominaciones, costo mayorista y forma de pago del saldo.

Con la documentación oficial y credenciales de **prueba** (siempre en variables de Render, nunca
en un chat), la tienda conecta la validación y la entrega automática
(`docs/specs/proveedores-recargas.md`, fase 2).
