# Solicitud de cotización a proveedores (lista para enviar)

Preparado el 2026-10-13 con la autorización del dueño. **No se envió.** Esta sesión no tiene un
canal permitido:

- el Gmail del dueño quedó excluido;
- no se usa Telegram;
- la red del entorno bloquea las páginas de los proveedores.

Lo envía el dueño desde el formulario o el correo de cada proveedor. Los datos entre corchetes los
llena él. No incluyas tu cédula, tu RUT ni claves en el primer mensaje.

## A quién, en este orden

Orden y motivos en [PROVEEDORES.md](PROVEEDORES.md), sección «Selección».

| Proveedor | Dónde | Idioma |
|---|---|---|
| Xsolla Reseller Program | Formulario en [xsolla.com/for/resellers](https://xsolla.com/for/resellers/) | Inglés |
| SHOP2TOPUP | Página de revendedores: [shop2topup.com/es/resellers](https://shop2topup.com/es/resellers) | Español o inglés |
| FazerCards | Página de revendedores: [reseller.fazercards.com](https://reseller.fazercards.com/en) | Inglés |

## Mensaje en español

> Hola. Soy [nombre], de TayGameStore, una tienda en línea de Colombia que vende recargas de
> diamantes de Free Fire por ID de jugador (servidor Latinoamérica), con cobro en pesos por
> Mercado Pago.
>
> Quiero recibir por escrito su cotización como revendedor:
>
> 1. Costo por paquete para Free Fire LATAM por ID: 100+10, 310+31, 520+52, 1060+106,
>    2180+218 y 5600+560 diamantes. Indiquen la moneda y cualquier recargo o comisión.
> 2. ¿Hay cuota mensual, de alta o depósito mínimo? ¿Cómo se fondea el saldo (tarjeta,
>    transferencia, PSE)? ¿Aceptan pago por pedido?
> 3. ¿La recarga es directa al ID? ¿Validan el ID y la región antes de cobrar?
> 4. API: documentación, entorno de pruebas (sandbox), consulta de estado, webhooks firmados y
>    referencia única por pedido (idempotencia).
> 5. ¿Qué pasa con una recarga fallida? ¿Reembolso al saldo y en qué plazo?
> 6. ¿Permiten vender con mi propia marca y dominio? ¿Qué documentos piden para abrir la cuenta?
> 7. ¿Los diamantes vienen de un canal autorizado por Garena?
>
> Gracias. [nombre] · [correo de la tienda]

## Message in English

> Hello. I'm [name] from TayGameStore, an online store in Colombia selling Free Fire diamond
> top-ups by player ID (Latin America server), charged in Colombian pesos through Mercado Pago.
>
> I'd like a written reseller quote:
>
> 1. Cost per package for Free Fire LATAM by ID: 100+10, 310+31, 520+52, 1060+106, 2180+218 and
>    5600+560 diamonds. Please state the currency and any surcharge or fee.
> 2. Is there a monthly, setup or minimum deposit fee? How is the balance funded? Do you accept
>    pay-per-order?
> 3. Is the top-up sent directly to the player ID? Do you validate the ID and region before
>    charging?
> 4. API: documentation, sandbox, order status, signed webhooks and a unique reference per order
>    (idempotency).
> 5. What happens with a failed top-up? Refund to balance, and how fast?
> 6. May I sell under my own brand and domain? What documents are required to open an account?
> 7. Are the diamonds sourced through a channel authorized by Garena?
>
> Thank you. [name] · [store email]

## Al recibir respuesta

1. Pasa los costos a un archivo como `cotizacion-indicativa-fazercards.json`.
2. Corre `npm run finanzas:margenes -- --costos <archivo>.json`.
3. Solo sigue el [plan de activación](PLAN-ACTIVACION.md) con el proveedor que deje 5 % o más
   en los paquetes a automatizar.
