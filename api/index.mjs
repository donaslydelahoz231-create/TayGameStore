// Función única de Vercel: toda la tienda (API, páginas y estáticos) la sirve Fastify.
// El código compilado sale de `npm run build` (dist/server); ver vercel.json.
export { default } from '../dist/server/serverless.js';
