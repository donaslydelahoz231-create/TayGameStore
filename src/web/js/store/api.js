/**
 * Cliente HTTP de la API. Lanza Error con el código del backend (`error`) o `HTTP_<status>`.
 */
export async function api(path, options = {}) {
  if (location.protocol === 'file:') throw new Error('SERVER_REQUIRED');
  const r = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP_${r.status}`);
  return data;
}
