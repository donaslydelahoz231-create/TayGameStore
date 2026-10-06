# Proveedor de diamantes y validación de ID (camino legítimo)

> Estado (2026-10-06): **entrega manual** por el dueño y **verificación manual** del ID.
> La automatización estilo LootBar está lista en el código (puerto `PlayerVerifier` y flujo de
> entrega), pero **bloqueada** hasta tener un contrato con un proveedor autorizado y su
> documentación oficial. No se usan páginas que extraen datos del juego sin autorización
> (por ejemplo, buscadores de "perfil por ID"): no son una fuente oficial, pueden cambiar o
> cerrar sin aviso y exponen a la tienda a reclamos.

## Cómo funciona una tienda como LootBar

1. El cliente escribe su **ID de jugador**.
2. La tienda consulta a su **proveedor** (con contrato y API) y muestra el nickname y la región:
   así el cliente confirma que es su cuenta.
3. El cliente paga.
4. La tienda compra la recarga al proveedor por API y los **diamantes llegan al ID**. Nunca se
   pide la contraseña del juego.

La validación del ID y la entrega salen del **mismo proveedor**: es él quien tiene acceso
autorizado a los sistemas de Garena.

## Cadena de suministro en Colombia (hallazgos verificables)

- Los pines de **Garena Free Fire** se distribuyen oficialmente en Colombia a través de
  **InComm Colombia S.A.S.** (certificación POSA), en redes de recargas como **MOViiRED,
  Practisistemas, Refácil, RedCo, PTM, Full Carga y Multipagas**
  ([POSA Colombia · Garena](https://posa.com.co/productos/garena)).
- **Codashop** vende recargas de Free Fire por ID en Colombia
  ([codashop.com/es-co/free-fire](https://www.codashop.com/es-co/free-fire)).
- Existen plataformas B2B para revendedores que anuncian recarga por ID con API (p. ej.
  FazerCards, MooGold). **Sin verificar**: su relación con Garena, condiciones, cobertura del
  servidor latinoamericano y documentación deben comprobarse antes de firmar.

## Plan recomendado

### Fase 1 — ahora (sin contrato)

- **Verificación**: el dueño comprueba el ID en un canal oficial de recarga (si al escribir el
  ID muestra el nickname, lo compara) y lo registra en el panel con nickname y región. El
  cliente confirma "Sí, es mi cuenta" antes de pagar.
- **Entrega**: tras el pago confirmado por Mercado Pago, el dueño recarga al ID confirmado por un
  canal oficial y registra la evidencia en el panel. n8n le avisa por Gmail en cada paso.

### Fase 2 — automatizar (con contrato)

1. Registrarse como revendedor en una red autorizada (las de la lista de arriba o un mayorista
   B2B verificado) y pedir **acceso a su API**: validación de ID (nickname/región) y compra de
   recarga por ID, con entorno de pruebas.
2. Entregar a desarrollo la **documentación oficial** y credenciales de prueba (por variables de
   entorno, nunca en el chat ni en Git).
3. Desarrollo implementa el adaptador en `src/server/integrations/player/` (validación) y el de
   entrega, con pruebas contra el sandbox del proveedor. La tienda ya tiene: consulta
   `POST /api/player/lookup` con límite anti-enumeración, confirmación del cliente, compra
   idempotente y paso automático a manual si el proveedor falla.

### Preguntas para el proveedor

- ¿Son distribuidor autorizado de Garena para Colombia? ¿Documento que lo acredite?
- ¿Su API valida el ID y devuelve nickname y región antes de comprar?
- ¿Cubre el servidor de Latinoamérica? ¿Qué paquetes y a qué costo mayorista?
- ¿Entrega por API con confirmación síncrona o por notificación? ¿Idempotencia por referencia?
- ¿Entorno de pruebas, límites de uso, soporte y condiciones de reembolso si una recarga falla?
