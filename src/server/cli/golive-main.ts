import path from 'node:path';
import { checkEnvironment, checkRemote, GoLiveUsageError, report, USAGE } from './golive.js';

// Punto de entrada de `npm run golive:check`. Nunca imprime valores de variables.
const args = process.argv.slice(2);
const out = (line: string) => console.warn(line);
try {
  const urlIndex = args.indexOf('--url');
  const url = urlIndex >= 0 ? args[urlIndex + 1] : undefined;
  const environment = args.includes('--entorno');
  if (!environment && !url) throw new GoLiveUsageError(USAGE);
  let ready = true;
  if (environment) {
    const webRoot = path.resolve(process.env.WEB_DIST_DIR ?? 'src/web');
    ready = report('Variables del servidor', checkEnvironment(process.env, webRoot), out) && ready;
  }
  if (url) ready = report(`Tienda publicada (${url})`, await checkRemote(url), out) && ready;
  out(ready ? '\nLISTO para vender.' : '\nNO está lista: corrige lo marcado como FALTA.');
  process.exitCode = ready ? 0 : 1;
} catch (error) {
  console.error(error instanceof GoLiveUsageError ? error.message : error);
  process.exitCode = 1;
}
