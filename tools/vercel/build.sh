#!/usr/bin/env sh
# Build en Vercel (vercel.json → buildCommand). Toda la tienda la sirve la función api/index.mjs.
set -eu
npm run build
# Migraciones solo aditivas, antes de publicar la versión nueva (como el pre-deploy de Render).
if [ -n "${DATABASE_URL:-}" ]; then
  npm run db:migrate:prod
else
  echo "DATABASE_URL no configurada: se omiten las migraciones (la tienda responderá 503)."
fi
# Vercel exige un directorio de salida; los estáticos reales los entrega Fastify con sus cabeceras.
mkdir -p .vercel-static
printf 'User-agent: *\nAllow: /\n' > .vercel-static/robots.txt
