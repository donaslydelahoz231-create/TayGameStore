# Simulación de clientes y ataques

`tools/load/simulate.mjs` simula clientes reales comprando y, a la vez, atacantes, contra el
servidor de pruebas (PostgreSQL real, Mercado Pago sustituido por su doble). Sirve para
comprobar antes de cada cambio grande que la tienda no se cae ni abre una puerta.

**Solo contra sistemas propios.** El script rechaza cualquier destino que no sea `localhost`
salvo con `--i-own-this-target`. No lo uses contra producción sin avisar: los límites por IP y
el escudo bloquearán tu IP, que es justo lo que deben hacer.

## Cómo ejecutarla

```bash
# Terminal 1: servidor de pruebas (borra y recrea la base *_test indicada)
E2E_DATABASE_URL=postgres://usuario:clave@127.0.0.1:5432/taygamestore_e2e_test npm run load:server
# Terminal 2: simulación (pico de 300 clientes simultáneos; --pid mide la memoria del servidor)
npm run load:sim -- --peak 300 --pid <pid del servidor>
```

Termina con `RESULTADO: OK` (código 0) o `HAY PROBLEMAS` (código 1) y una tabla por ruta con
estados y latencias p50/p95/p99.

## Qué hace

| Fase | Detalle |
|---|---|
| Clientes | Cada uno con su IP y sus cookies: página, configuración, catálogo, consulta de ID, pedido con el precio del catálogo, pago, y la mitad paga en el doble de Mercado Pago y comprueba que el servidor confirma `PAID` |
| Carga | 10 → 100 → 300 recorridos de compra simultáneos (5 + 15 + 20 s) |
| Ataques (con 100 clientes comprando a la vez) | Inundación del catálogo, sondeo de `.env`/`wp-admin`, spam de pedidos, enumeración de IDs, cuerpo de 200 KB, JSON roto, escritura sin CSRF, 30 webhooks falsos, 10 envíos simultáneos del mismo pedido |

## Resultados (servidor único, base local, pool de 5 conexiones)

| Medida | Resultado |
|---|---|
| Peticiones por ronda | ≈ 26.500 en 57 s (≈ 75 compras completas por segundo) |
| Errores del servidor (5xx o conexión) | **0** en 9 rondas (≈ 210.000 peticiones) |
| Clientes que fallaron | **0** |
| Latencia con 300 simultáneos | página p95 ≈ 260 ms; crear pedido p95 ≈ 1,4 s; pago p95 ≈ 1,3 s |
| Memoria | Estable: con el heap limitado a 160 MB, 4 rondas seguidas en 277–280 MB, sin caída |
| Defensas | Las 9 se activaron en todas las rondas |

Las defensas observadas: 120 peticiones de catálogo por minuto y luego 429 y bloqueo (403);
dos sondeos de rutas bastan para bloquear la IP; 10 pedidos por IP cada 10 min; 20 consultas
de ID cada 10 min; 413 para cuerpos de más de 64 KB; 401 para todo webhook con firma falsa;
un único pedido para 10 envíos simultáneos con la misma clave (los demás, 409).

## Hallazgos

- **Corregido en el doble de pruebas** (`e2e/support/server.ts`): el id de pago se generaba con
  `Date.now()` y dos pagos en el mismo milisegundo compartían id. El servidor hizo lo correcto
  (no marcó como pagado un pedido con el pago de otro), pero el doble ocultaba la prueba.
- **Para tener en cuenta (decisión del dueño):** los límites son por IP. Muchos operadores
  móviles comparten una IP entre muchos clientes (CGNAT). Con mucho tráfico real desde la misma
  red, clientes legítimos podrían ver "Demasiadas solicitudes" al crear pedidos (10 por IP cada
  10 minutos) o quedar bloqueados 15 minutos si alguien en su misma IP escanea rutas. Si ocurre
  (se ve en el panel de seguridad), la opción recomendada es subir el límite por IP de pedidos y
  añadir uno por navegador, no quitar los límites.
- Las latencias crecen con la concurrencia porque todo pasa por una sola instancia y 5
  conexiones a la base; en producción `DATABASE_POOL_MAX` y más instancias las reducen.
