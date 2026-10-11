import { ConfigError, loadConfig } from '../config/env.js';
import { UniPinTopupProvider } from '../integrations/topup/unipin.js';
import { CheckUsageError, runUnipinCheck } from './unipin-check.js';

// Punto de entrada de `npm run unipin:check`. Los errores muestran el motivo, nunca credenciales.
try {
  const ok = await runUnipinCheck(
    process.argv.slice(2),
    loadConfig(),
    (topup) => new UniPinTopupProvider(topup),
    { out: (line) => console.warn(line) },
  );
  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error(
    error instanceof ConfigError || error instanceof CheckUsageError ? error.message : error,
  );
  process.exitCode = 1;
}
