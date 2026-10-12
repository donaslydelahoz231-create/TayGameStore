# Estrategia de promociones con ganancia garantizada

Objetivo: vender más con promociones **sin vender nunca a pérdida**, con tus precios actuales y
con UniPin como proveedor (no Pagostore).

## 1. La regla que la tienda aplica sola

**Ninguna venta baja del piso:**

> piso = costo de UniPin × (1 + ganancia mínima) ÷ (1 − comisión de Mercado Pago)

redondeado hacia arriba a $100. Valores por defecto (en Render):

- `PAYMENT_FEE_PCT=4`: comisión de Mercado Pago. Verifica la tuya en tu panel de Mercado Pago.
- `MIN_MARGIN_PCT=5`: ganancia mínima sobre el costo.

Con el costo de cada paquete en `UNIPIN_CATALOG`:

| Situación | Qué hace la tienda |
|---|---|
| La promo deja ganancia | Se cobra la promo. |
| La promo baja del piso | Se cobra el piso, que sigue siendo más barato que el precio normal. |
| El piso alcanza el precio normal | Ese paquete no tiene promo. |
| El precio normal no llega al piso | Ese paquete **no se vende por UniPin** (sale «Agotado» o queda para PIN o entrega manual). |

El catálogo, el checkout y la entrega usan el mismo cálculo: lo que ve el cliente es lo que paga, y
UniPin solo recibe pedidos con ganancia.

**Panel → Catálogo → Rentabilidad** muestra por paquete:

- el precio y la promo;
- el **costo máximo** que puedes pagarle a UniPin, con precio normal y con promo;
- el costo real de UniPin, si ya está cargado;
- la ganancia por venta;
- el estado: deja ganancia · promo subida al piso · no deja ganancia · falta el costo.

## 2. El plan de promociones

### Base: promo de fin de semana (ya activa, automática)

Sábado y domingo, hora de Colombia, con descuento escalonado por tamaño:

| Paquete | Precio | Promo | Descuento | Para qué |
|---|---|---|---|---|
| 110 💎 | $4.000 | $3.800 | 5 % | Gancho de entrada: el primer pedido barato genera confianza. |
| 341 💎 | $11.000 | $10.500 | 4,5 % | El más pedido: descuento corto, volumen alto. |
| 572 💎 | $18.000 | $17.000 | 5,6 % | Escalón hacia el pase y la skin del evento. |
| 1.166 💎 | $33.000 | $31.000 | 6,1 % | El mejor valor por diamante: el que más conviene empujar. |
| 2.398 💎 | $65.000 | $60.000 | 7,7 % | Ticket alto: un ahorro visible en pesos ($5.000). |
| 6.160 💎 | $150.000 | $138.000 | 8 % | El mayor ahorro en pesos ($12.000) para el cliente frecuente. |

No hay que cambiar nada: cuando cargues los costos de UniPin, cualquier promo que no deje ganancia
se sube sola al piso.

### Momentos de mayor compra (recomendado; los activas tú)

1. **Quincena (días 15 y 30):** muchos clientes cobran ese día. Anuncia la promo del fin de semana
   siguiente por WhatsApp el día de pago.
2. **Eventos de Free Fire** (pase élite nuevo, aniversario, skins de temporada): la demanda sube
   sola. **No hace falta descuento**; basta anunciar «recarga al instante por ID».
3. **Diciembre y Black Friday:** promo más larga. Para que corra toda la semana:
   1. Desbloquea el catálogo (`CATALOG_LOCKED=false`).
   2. Pon una fecha de fin en la promo de cada paquete.
   3. Pon `PROMO_SCHEDULE=always` en Render.
   4. Vuelve a bloquear el catálogo.

   El piso de ganancia sigue protegiendo cada venta.

### Comunicación

- El **«Radar promo»** de la tienda ya muestra el horario y el ahorro de cada paquete.
- Estado de WhatsApp el viernes en la noche: «Mañana arranca la promo de fin de semana:
  hasta $12.000 menos».
- Nunca prometas un precio que no esté en la tienda: el servidor cobra lo que muestra el catálogo.

### Cómo medir

- Compara los pedidos pagados del fin de semana con los de la semana (Panel → Pedidos).
- Si un paquete casi no se vende ni en promo, no lo bajes más: revisa la tabla Rentabilidad. Si su
  costo máximo está por debajo de lo que cobra UniPin, ese paquete no da ganancia y es mejor no
  empujarlo.

## 3. Cuando UniPin te dé su lista de precios de socio

1. Agrega el costo de cada paquete a `UNIPIN_CATALOG`, por ejemplo
   `"ff-110":{"denomination":"<id>","costCop":3500}`. No es un secreto; puedes pasármelo y lo cargo.
2. Abre **Panel → Catálogo → Rentabilidad** y revisa cada estado.
3. Si algún paquete sale «no deja ganancia», hay dos caminos:
   - pedir a UniPin un mejor precio;
   - subir ese precio (con tu autorización).
