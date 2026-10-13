# Investigación de proveedores de recarga de Free Fire por ID

Consulta: 2026-10-13. Sin contactar a nadie ni crear cuentas.

## Límite de esta investigación

La política de red de este entorno **bloquea las páginas de los 14 candidatos**: la conexión a
`gamecore-api.tech`, `centraloneglobal.com`, `hdstore.eu`, `topup.dev`, `shop2topup.com` y otros
devuelve 403. Por eso:

- Lo que sigue viene del **índice del buscador**, que resume esas páginas, y de documentación
  pública indexada (API, blogs, Trustpilot).
- Nada se marca «confirmado por documentación oficial» porque no se pudo abrir la documentación.
- **Para verificarlo directamente:** habilitar esos dominios en el acceso a red del entorno
  (configuración del entorno → Network access → Allowed domains) y repetir la revisión.

Leyenda:

| Marca | Significado |
|---|---|
| ◐ | Indicado en la página comercial del proveedor, visto por el buscador y no verificado |
| ✖ | Incumple el requisito según su propia página |
| ? | No publicado o no encontrado: requiere confirmación directa |
| ⛔ | Excluido |

## Matriz de requisitos

| Proveedor | UID directo | API documentada | Estado / webhook / idempotencia | Precios publicados | Sin cuota mensual | Sin saldo prepago | Sin Telegram | Sin RUT / documentos | LATAM / Colombia |
|---|---|---|---|---|---|---|---|---|---|
| GameCore ([gamecore-api.tech](https://gamecore-api.tech/en/supply/free-fire)) | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| Central One ([resellers](https://centraloneglobal.com/resellers/), [LATAM](https://centraloneglobal.com/proveedor-free-fire-latam/)) | ? | ? | ? | ? | ? | ? | ? | ? | ? (la URL dice «LATAM») |
| HD STORE ([hdstore.eu](https://www.hdstore.eu/)) | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| RechargeGames ([rechargegame.games](https://rechargegame.games/es/reseller)) | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| Bemovil ([bemovilrecargas.com](https://bemovilrecargas.com/)) | ? (el flujo descrito usa un código) | ? | ? | ? | ? | ✖ saldo prepago (Nequi, Efecty, PSE) | ? | Pide cédula y datos personales | ✔ Colombia |
| VibolShop ([api.vibolshop.com](https://api.vibolshop.com/)) | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| SHOP2TOPUP ([resellers](https://shop2topup.com/es/resellers), [API](https://shop2topup.apidog.io/)) | ◐ | ◐ (llave Bearer desde el panel) | ◐ validación de jugador, estado por consulta o webhook, rechazo si el precio sube | ? | ? | ✖ billetera prepaga en USDT (cripto) | ? | ◐ «sin KYC»: registro por correo y doble factor | ? (se ve una categoría de Pakistán) |
| YouToGame ([cooperation](https://youtogame.com/page.php?p=cooperation)) | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| FazerCards ([reseller](https://reseller.fazercards.com/en), [docs](https://reseller.fazercards.com/en/docs)) | ◐ | ◐ REST v2 y SDK | ◐ webhooks `order.completed/failed/refunded` y cabecera `Idempotency-Key` | ◐ 110 💎 US$0,79 · 341 US$2,49 · 572 US$3,74 (región no indicada) | ✖ US$9,99 / 19,99 / 29,99 al mes | ✖ saldo en cripto o tarjeta | ? | ◐ «sin KYC», prueba de 5 días | ? |
| Topup.dev ([topup.dev](https://topup.dev/)) | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| INDGM ([api.indgm.com](https://www.api.indgm.com/)) | ◐ vende recargas directas al público | ? (no se encontró la API) | ? | ? | ? | ? | ? | ? | ? (empresa en India) |
| SabayStore ([reseller](https://www.sabaystore.com/reseller)) | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| Volsever ([pagostore-latam-automation](https://volsever.com/services/pagostore-latam-automation)) | ⛔ | — | — | — | — | — | — | — | — |
| LootBar | ⛔ | — | — | — | — | — | — | — | — |

### Otros encontrados (no estaban en la lista)

| Proveedor | Qué es | Requisitos según su página | Por qué no basta todavía |
|---|---|---|---|
| Xsolla Reseller Program ([xsolla.com/for/resellers](https://xsolla.com/for/resellers/)) | Canal oficial de editores de juegos | ◐ Pilotos regionales abiertos para LATAM; formulario y KYC básico; el editor aprueba revendedor y productos | No se encontró que Free Fire esté en el piloto. Exige KYC. Modelo de pago no publicado |
| Reloadly ([gift card API](https://www.reloadly.com/products/gift-card-api)) | Empresa de API de tarjetas regalo | ◐ Sin mínimos mensuales; billetera prepaga | Free Fire aparece como tarjeta (PIN) en otros países (p. ej. Emiratos), no como recarga por ID. Colombia no confirmada |
| WDGZone ([catálogo](https://wdgzone.tech/catalog/garena-free-fire-vouchers-official-15)) | Mayorista de vales | ◐ API y billetera de revendedor; vales de US$1 a US$20 | Vende vales, no recarga por ID. Región no indicada |
| UniPin | Distribuidor ya integrado en el código | Contrato de socio, saldo | Descartado por el dueño el 2026-10-12 |

## Detalle por requisito clave

- **Sin saldo prepago:** **ningún** candidato con información pública ofrece pago por pedido,
  facturación posterior o crédito. Todos los que lo publican exigen saldo previo: SHOP2TOPUP,
  FazerCards, Bemovil, Reloadly, WDGZone. No se declara que exista uno sin depósito.
- **Sin cuota mensual:** FazerCards la exige. Reloadly dice no tener mínimos mensuales. Del resto
  no hay dato.
- **Sin Telegram:** ninguna fuente indexada lo menciona como obligatorio; no se pudo confirmar.
- **Sin RUT:** SHOP2TOPUP y FazerCards dicen «sin KYC» (registro con correo). Bemovil pide cédula.
  Xsolla pide KYC.
- **Marca propia y dominio propio:** con cualquier API, TayGameStore conserva su tienda y su pago
  por Mercado Pago; el proveedor solo recibe la orden de recarga. Ningún candidato publicó
  restricciones de marca. Hay que confirmarlo en sus términos.

## Riesgos (aplican a cualquier proveedor no oficial)

1. **Origen de los diamantes.** Precios 25–40 % por debajo del precio público (lo que exige el
   margen, ver [FINANZAS.md](FINANZAS.md)) son una señal de alerta. Si el proveedor compra con
   tarjetas robadas o con cuentas de otra región:
   - Garena puede revertir los diamantes o sancionar la cuenta del cliente;
   - el reclamo llega a TayGameStore.

   **Inferencia, no verificada.**
2. **Saldo prepago = riesgo de contraparte.** Si el proveedor cierra, el saldo se pierde. Hay que
   empezar con el mínimo posible.
3. **Pago en cripto (USDT).** Volatilidad, comisiones de la red y tratamiento tributario incierto
   para una persona natural en Colombia. Esto choca con el requisito del dueño de evitar
   conflictos con la DIAN. Lo debe revisar un contador.
4. **Región.** Free Fire separa servidores. Una recarga de otra región no llega a una cuenta
   LATAM. El adaptador debe validar el ID y la región antes de cobrar.
5. **Automatizar PagoStore o LootBar** (Volsever y similares): va contra las reglas del dueño y
   probablemente contra los términos de Garena. Por eso queda excluido.

## Selección (fase 4)

**No se recomienda integrar ningún proveedor todavía.** Ninguno cumple a la vez lo que exige el
dueño: UID directo para LATAM, API, sin saldo previo, sin cuota mensual, sin RUT y un margen
demostrado.

Orden sugerido para pedir cotización por escrito (**solo con autorización del dueño**):

1. **Xsolla Reseller Program**, la vía más legítima: canal del editor con KYC. Preguntar si
   incluye Free Fire LATAM, el modelo de pago y el descuento.
2. **SHOP2TOPUP**, el más cercano técnicamente: API con validación, estados y webhook, sin KYC
   según su página. Pedir la lista LATAM, el depósito mínimo y si acepta fondeo sin cripto.
3. **FazerCards**: API madura con idempotencia y webhooks. Pedir precios LATAM; su cuota mensual
   incumple un requisito.

Con cada cotización se llena el archivo JSON y se corre `npm run finanzas:margenes -- --costos`.
Solo un proveedor con margen ≥ 5 % en los paquetes que se quieran automatizar pasa a la
implementación del adaptador ([PLAN-ACTIVACION.md](PLAN-ACTIVACION.md)).

## Fuentes consultadas (vía buscador, 2026-10-13)

- FazerCards:
  - [catálogo Free Fire](https://reseller.fazercards.com/en/catalog/free-fire)
  - [guía de API mayorista](https://reseller.fazercards.com/en/blog/game-top-up-api-wholesale)
  - [docs](https://reseller.fazercards.com/en/docs)
- SHOP2TOPUP:
  - [revendedores](https://shop2topup.com/en/resellers)
  - [API](https://shop2topup.com/en/reseller-api)
  - [docs apidog](https://shop2topup.apidog.io/)
- Bemovil:
  - [cómo vender Free Fire](https://bemovilcolombia.co/multiproductos/prueba-1/)
  - [distribuidor (Yo Recargo)](https://yorecargo.com.co/recargas-a-celular/bemovil-distribuidor-como-comenzar/)
- INDGM: [Trustpilot](https://es.trustpilot.com/review/indgm.com)
- Xsolla:
  - [revendedores](https://xsolla.com/for/resellers/)
  - [blog del programa](https://xsolla.com/blog/unlock-revenue-in-local-markets-with-xsolla-reseller-program)
- Reloadly: [gift card API](https://www.reloadly.com/products/gift-card-api)
- WDGZone: [catálogo Free Fire](https://wdgzone.tech/catalog/garena-free-fire-vouchers-official-15)
- Sin resultados en el buscador: GameCore, Central One, HD STORE, RechargeGames, VibolShop,
  YouToGame, Topup.dev, SabayStore y Volsever. Volsever se excluye por la descripción de su propia
  URL.
