/**
 * Catálogo de EJEMPLO tomado del HTML original (legacy/index-cinematic-v4.html).
 * Solo para desarrollo y pruebas: los productos y precios reales los define el propietario
 * desde el panel de administración. El script de carga se niega a ejecutarse en producción.
 */
export const EXAMPLE_FREEFIRE_PRODUCTS = [
  {
    sku: 'ff-110',
    name: '100 + 10 Diamantes',
    description: '110 diamantes totales',
    tag: '+10% Extra',
    units: 110,
    priceCop: 4000,
    promoPriceCop: 3800,
  },
  {
    sku: 'ff-341',
    name: '310 + 31 Diamantes',
    description: '341 diamantes totales',
    tag: 'Popular',
    units: 341,
    priceCop: 11000,
    promoPriceCop: 10500,
  },
  {
    sku: 'ff-572',
    name: '520 + 52 Diamantes',
    description: '572 diamantes totales',
    tag: 'Top ventas',
    units: 572,
    priceCop: 18000,
    promoPriceCop: 17000,
  },
  {
    sku: 'ff-1166',
    name: '1.060 + 106 Diamantes',
    description: '1.166 diamantes totales',
    tag: '+10% Extra',
    units: 1166,
    priceCop: 33000,
    promoPriceCop: 31000,
  },
  {
    sku: 'ff-2398',
    name: '2.180 + 218 Diamantes',
    description: '2.398 diamantes totales',
    tag: 'Ahorro',
    units: 2398,
    priceCop: 65000,
    promoPriceCop: 60000,
  },
  {
    sku: 'ff-6160',
    name: '5.600 + 560 Diamantes',
    description: '6.160 diamantes totales',
    tag: 'Elite',
    units: 6160,
    priceCop: 150000,
    promoPriceCop: 138000,
  },
].map((product, index) => ({ ...product, game: 'freefire', sortOrder: index + 1 }));
