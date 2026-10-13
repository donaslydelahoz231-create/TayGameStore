# Informe financiero: los 6 paquetes en precio normal y TAY RADAR

Fecha: 2026-10-13. Moneda: pesos colombianos (COP). Tablas generadas con
`npm run finanzas:margenes`. Los cálculos están en `src/server/domain/profitability.ts`, con
pruebas en `tests/unit/profitability.test.ts`. Para regenerarlas:

```bash
npm run -s finanzas:margenes > informe.md                       # costos máximos
npm run -s finanzas:margenes -- --costos cotizacion.json        # con una cotización real
npm run -s finanzas:margenes -- --otros 150 --escenario mp-instante
```

## Qué está comprobado y qué no

| Dato | Valor usado | Estado |
|---|---|---|
| Precios de venta (normal y TAY RADAR) | Tabla oficial del dueño | **Comprobado** en la base de producción (solo lectura, 13-oct): los 6 coinciden |
| Comisión de Mercado Pago Checkout Pro | 3,29 % + $800 + IVA (dinero al instante); 2,79 % + $800 + IVA (a 14 días) | **Página oficial** [mercadopago.com.co](https://www.mercadopago.com.co/herramientas-para-vender/check-out), vista por el buscador porque la red de este entorno no la abre. Hay que confirmarla en el panel de la cuenta. Terceros publican cifras distintas |
| IVA sobre la comisión | 19 % | Tarifa general de IVA en Colombia; la página de Mercado Pago dice «+ IVA» |
| Retenciones (ReteFuente, ReteIVA, ReteICA) | No incluidas | **No determinable** sin la situación fiscal del vendedor; no se inventa |
| Costo del proveedor | No hay cotización confirmada | **Pendiente.** Solo se calculan costos máximos admisibles |
| Tasa de cambio (si el proveedor cobra en dólares) | TRM $3.218,75 (9-oct-2026) | Prensa ([Portafolio](https://www.portafolio.co/economia/finanzas/dolar-hoy-en-colombia-se-desploma-mas-de-20-asi-inicia-la-cotizacion-oficial-este-9-de-octubre-504160)); el cambio real depende del medio de pago al proveedor |
| Otros costos (reintentos, soporte, conversión) | 0 por defecto | Configurable con `--otros` |

## Definiciones

- P = precio cobrado, C = costo total del proveedor, F = comisión del pago, O = otros costos.
- **Beneficio** = P − C − F − O. **Margen** = Beneficio ÷ P × 100.
- **C máximo para un margen r** = P × (1 − r) − F − O.
- **«Bruto»** = antes de la comisión y de otros costos (F = O = 0). **«Neto»** = después de F y O
  identificados. Ninguno descuenta impuestos de renta ni retenciones: no es «ganancia neta»
  contable.

### Margen bruto antes de comisiones (C máximo = P × (1 − r))

No descuenta la comisión del pago ni otros costos: sirve solo como techo.

| Paquete | Precio | Tarifa | C máx. 5 % | C máx. 10 % | C máx. 15 % |
|---|---|---|---:|---:|---:|
| 110 💎 | $4.000 | Normal | $3.800 | $3.600 | $3.400 |
| 110 💎 | $3.800 | TAY RADAR | $3.610 | $3.420 | $3.230 |
| 341 💎 | $11.000 | Normal | $10.450 | $9.900 | $9.350 |
| 341 💎 | $10.500 | TAY RADAR | $9.975 | $9.450 | $8.925 |
| 572 💎 | $18.000 | Normal | $17.100 | $16.200 | $15.300 |
| 572 💎 | $17.000 | TAY RADAR | $16.150 | $15.300 | $14.450 |
| 1.166 💎 | $33.000 | Normal | $31.350 | $29.700 | $28.050 |
| 1.166 💎 | $31.000 | TAY RADAR | $29.450 | $27.900 | $26.350 |
| 2.398 💎 | $65.000 | Normal | $61.750 | $58.500 | $55.250 |
| 2.398 💎 | $60.000 | TAY RADAR | $57.000 | $54.000 | $51.000 |
| 6.160 💎 | $150.000 | Normal | $142.500 | $135.000 | $127.500 |
| 6.160 💎 | $138.000 | TAY RADAR | $131.100 | $124.200 | $117.300 |

### Margen neto: Mercado Pago al instante: 3,29 % + $800 + IVA 19 %

C máximo = P × (1 − r) − F − O. Un valor negativo significa que ese margen es imposible.

| Paquete | Tarifa | Precio | Comisión F | Neto P − F − O | C máx. 5 % | C máx. 10 % | C máx. 15 % |
|---|---|---:|---:|---:|---:|---:|---:|
| 110 💎 | Normal | $4.000 | $1.109 (27,73 %) | $2.891 | $2.691 | $2.491 | $2.291 |
| 110 💎 | TAY RADAR | $3.800 | $1.101 (28,97 %) | $2.699 | $2.509 | $2.319 | $2.129 |
| 341 💎 | Normal | $11.000 | $1.383 (12,57 %) | $9.617 | $9.067 | $8.517 | $7.967 |
| 341 💎 | TAY RADAR | $10.500 | $1.364 (12,99 %) | $9.136 | $8.611 | $8.086 | $7.561 |
| 572 💎 | Normal | $18.000 | $1.657 (9,21 %) | $16.343 | $15.443 | $14.543 | $13.643 |
| 572 💎 | TAY RADAR | $17.000 | $1.618 (9,52 %) | $15.382 | $14.532 | $13.682 | $12.832 |
| 1.166 💎 | Normal | $33.000 | $2.244 (6,8 %) | $30.756 | $29.106 | $27.456 | $25.806 |
| 1.166 💎 | TAY RADAR | $31.000 | $2.166 (6,99 %) | $28.834 | $27.284 | $25.734 | $24.184 |
| 2.398 💎 | Normal | $65.000 | $3.497 (5,38 %) | $61.503 | $58.253 | $55.003 | $51.753 |
| 2.398 💎 | TAY RADAR | $60.000 | $3.302 (5,5 %) | $56.698 | $53.698 | $50.698 | $47.698 |
| 6.160 💎 | Normal | $150.000 | $6.825 (4,55 %) | $143.175 | $135.675 | $128.175 | $120.675 |
| 6.160 💎 | TAY RADAR | $138.000 | $6.355 (4,61 %) | $131.645 | $124.745 | $117.845 | $110.945 |

### Margen neto: Mercado Pago a 14 días: 2,79 % + $800 + IVA 19 %

C máximo = P × (1 − r) − F − O. Un valor negativo significa que ese margen es imposible.

| Paquete | Tarifa | Precio | Comisión F | Neto P − F − O | C máx. 5 % | C máx. 10 % | C máx. 15 % |
|---|---|---:|---:|---:|---:|---:|---:|
| 110 💎 | Normal | $4.000 | $1.085 (27,13 %) | $2.915 | $2.715 | $2.515 | $2.315 |
| 110 💎 | TAY RADAR | $3.800 | $1.079 (28,39 %) | $2.721 | $2.531 | $2.341 | $2.151 |
| 341 💎 | Normal | $11.000 | $1.318 (11,98 %) | $9.682 | $9.132 | $8.582 | $8.032 |
| 341 💎 | TAY RADAR | $10.500 | $1.301 (12,39 %) | $9.199 | $8.674 | $8.149 | $7.624 |
| 572 💎 | Normal | $18.000 | $1.550 (8,61 %) | $16.450 | $15.550 | $14.650 | $13.750 |
| 572 💎 | TAY RADAR | $17.000 | $1.517 (8,92 %) | $15.483 | $14.633 | $13.783 | $12.933 |
| 1.166 💎 | Normal | $33.000 | $2.048 (6,21 %) | $30.952 | $29.302 | $27.652 | $26.002 |
| 1.166 💎 | TAY RADAR | $31.000 | $1.982 (6,39 %) | $29.018 | $27.468 | $25.918 | $24.368 |
| 2.398 💎 | Normal | $65.000 | $3.111 (4,79 %) | $61.889 | $58.639 | $55.389 | $52.139 |
| 2.398 💎 | TAY RADAR | $60.000 | $2.945 (4,91 %) | $57.055 | $54.055 | $51.055 | $48.055 |
| 6.160 💎 | Normal | $150.000 | $5.933 (3,96 %) | $144.067 | $136.567 | $129.067 | $121.567 |
| 6.160 💎 | TAY RADAR | $138.000 | $5.534 (4,01 %) | $132.466 | $125.566 | $118.666 | $111.766 |

### Margen neto: Supuesto anterior del código: 4 % sin cargo fijo

C máximo = P × (1 − r) − F − O. Un valor negativo significa que ese margen es imposible.

| Paquete | Tarifa | Precio | Comisión F | Neto P − F − O | C máx. 5 % | C máx. 10 % | C máx. 15 % |
|---|---|---:|---:|---:|---:|---:|---:|
| 110 💎 | Normal | $4.000 | $160 (4 %) | $3.840 | $3.640 | $3.440 | $3.240 |
| 110 💎 | TAY RADAR | $3.800 | $152 (4 %) | $3.648 | $3.458 | $3.268 | $3.078 |
| 341 💎 | Normal | $11.000 | $440 (4 %) | $10.560 | $10.010 | $9.460 | $8.910 |
| 341 💎 | TAY RADAR | $10.500 | $420 (4 %) | $10.080 | $9.555 | $9.030 | $8.505 |
| 572 💎 | Normal | $18.000 | $720 (4 %) | $17.280 | $16.380 | $15.480 | $14.580 |
| 572 💎 | TAY RADAR | $17.000 | $680 (4 %) | $16.320 | $15.470 | $14.620 | $13.770 |
| 1.166 💎 | Normal | $33.000 | $1.320 (4 %) | $31.680 | $30.030 | $28.380 | $26.730 |
| 1.166 💎 | TAY RADAR | $31.000 | $1.240 (4 %) | $29.760 | $28.210 | $26.660 | $25.110 |
| 2.398 💎 | Normal | $65.000 | $2.600 (4 %) | $62.400 | $59.150 | $55.900 | $52.650 |
| 2.398 💎 | TAY RADAR | $60.000 | $2.400 (4 %) | $57.600 | $54.600 | $51.600 | $48.600 |
| 6.160 💎 | Normal | $150.000 | $6.000 (4 %) | $144.000 | $136.500 | $129.000 | $121.500 |
| 6.160 💎 | TAY RADAR | $138.000 | $5.520 (4 %) | $132.480 | $125.580 | $118.680 | $111.780 |

Recargo del proveedor: si cobra un % sobre su tarifa base, la tarifa base máxima es
C máximo ÷ (1 + recargo). Ejemplo: 110 💎 en TAY RADAR al 15 % bruto → C máx. $3.230; con recargo de 5 % → base máx. $3.076.

## Lo que dicen las cifras

1. **El cargo fijo de $800 + IVA ($952) domina en los paquetes pequeños.**
   - 110 💎 en TAY RADAR: la comisión se lleva $1.101, el **29 % del precio**.
   - 6.160 💎: se lleva el 4,6 %.
   - El código suponía un 4 % plano (el último escenario), que subestimaba la comisión del paquete
     de 110 💎 en unos $950.
2. **Costo máximo frente al precio público.** Para un margen neto del 5 % con el dinero al
   instante, el proveedor tendría que venderte por debajo del precio de Codashop Colombia
   ([COMPETENCIA.md](COMPETENCIA.md)) en estos porcentajes:

   | Paquete | Tienda vs. Codashop (normal / TAY RADAR) | Descuento mínimo del proveedor (normal / TAY RADAR) |
   |---|---|---|
   | 110 💎 | −4,8 % / −9,5 % | 35,9 % / 40,3 % |
   | 341 💎 | −8,3 % / −12,5 % | 24,4 % / 28,2 % |
   | 572 💎 | −8,2 % / −13,3 % | 21,2 % / 25,9 % |
   | 1.166 💎 | −14,5 % / −19,7 % | 24,6 % / 29,3 % |
   | 2.398 💎 | −15,4 % / −21,9 % | 24,1 % / 30,1 % |
   | 6.160 💎 | −17,8 % / −24,3 % | 25,6 % / 31,6 % |

   **Inferencia, no verificada:** un distribuidor autorizado rara vez da 25–40 % por debajo del
   precio público. Con un descuento pequeño, TayGameStore perdería dinero en todos los paquetes.
   Un proveedor que ofrezca esos descuentos merece más verificación de origen, no menos
   ([PROVEEDORES.md](PROVEEDORES.md), riesgos).
3. **Sensibilidad con precios indicativos.** La tabla mayorista pública de FazerCards, vista por el
   buscador y sin confirmar (región no indicada; exige cuota mensual y saldo prepago, así que
   incumple dos requisitos):

#### Con costos de FazerCards (tabla mayorista pública) (INDICATIVOS, sin confirmar)

Fuente: reseller.fazercards.com/en/catalog/free-fire vista por el buscador el 13-oct-2026; región no indicada (puede no ser LATAM); requiere suscripción mensual y saldo prepago; TRM del 9-oct-2026 según Portafolio.
Conversión: TRM $3.218,75 por dólar + 0 % de sobrecosto; recargo del proveedor 0 %.

**Mercado Pago al instante: 3,29 % + $800 + IVA 19 %**

| Paquete | Tarifa | Precio | Costo C | Comisión F | Beneficio | Margen | Equilibrio | ¿Rentable al 5 %? |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 110 💎 | Normal | $4.000 | $2.543 | $1.109 | $348 | 8,7 % | $3.638 | Sí |
| 110 💎 | TAY RADAR | $3.800 | $2.543 | $1.101 | $156 | 4,11 % | $3.638 | NO |
| 341 💎 | Normal | $11.000 | $8.015 | $1.383 | $1.602 | 14,56 % | $9.333 | Sí |
| 341 💎 | TAY RADAR | $10.500 | $8.015 | $1.364 | $1.121 | 10,68 % | $9.333 | Sí |
| 572 💎 | Normal | $18.000 | $12.039 | $1.657 | $4.304 | 23,91 % | $13.521 | Sí |
| 572 💎 | TAY RADAR | $17.000 | $12.039 | $1.618 | $3.343 | 19,66 % | $13.521 | Sí |
| 1.166 💎 | Normal | $33.000 | sin cotización | — | — | — | — | — |
| 1.166 💎 | TAY RADAR | $31.000 | sin cotización | — | — | — | — | — |
| 2.398 💎 | Normal | $65.000 | sin cotización | — | — | — | — | — |
| 2.398 💎 | TAY RADAR | $60.000 | sin cotización | — | — | — | — | — |
| 6.160 💎 | Normal | $150.000 | sin cotización | — | — | — | — | — |
| 6.160 💎 | TAY RADAR | $138.000 | sin cotización | — | — | — | — | — |


   Aun con esos precios:
   - 110 💎 en TAY RADAR deja 4,1 %, por debajo del 5 %.
   - La cuota mensual del plan más barato (US$9,99, unos $32.000) se come el beneficio de unas
     200 ventas de 110 💎 en TAY RADAR.
   - 1.166, 2.398 y 6.160 💎 no tienen precio publicado en ese extracto.

## Paquetes rentables y no rentables

**No se puede afirmar todavía**: no hay ninguna cotización confirmada. Con los costos máximos de
arriba:

- **En riesgo:** 110 💎 (normal y TAY RADAR). Exigen el mayor descuento y el cargo fijo consume
  casi un tercio del precio. Con la regla de piso del código, un paquete que no cubre su costo no
  se envía al proveedor:
  - queda para entrega con PIN o manual;
  - sale «Agotado» si `SELL_ONLY_WITH_STOCK=true`.

  El dueño lo ve en Panel → Rentabilidad.
- **Viables si el proveedor da unos 25–32 % sobre el precio público:** 341 a 6.160 💎.

## Variables pendientes de cotización

Para cada proveedor:
- costo de los 6 paquetes en la región LATAM y moneda de cobro;
- recargo o comisión por operación;
- cuota mensual o de alta;
- depósito mínimo;
- costo de cargar saldo (tarjeta, transferencia internacional o cripto);
- política de reembolso de recargas fallidas.

Con eso se llena un archivo como `cotizacion-indicativa-fazercards.json`, con
`"confirmed": true` solo si llegó por escrito, y se ejecuta el comando.

**Política de ganancia en producción:** cuando haya proveedor, configurar
`PAYMENT_FEE_PCT=3.29`, `PAYMENT_FEE_FIXED_COP=800` y `PAYMENT_FEE_TAX_PCT=19` (o los valores que
muestre el panel de Mercado Pago). Así el piso de cada paquete incluye el cargo fijo. Es un cambio
en Render: requiere autorización ([PLAN-ACTIVACION.md](PLAN-ACTIVACION.md)).
