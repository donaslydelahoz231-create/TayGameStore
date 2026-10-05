export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operación excedió ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/** Rechaza si `promise` no termina en `ms` milisegundos. Limpia el temporizador en ambos casos. */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
