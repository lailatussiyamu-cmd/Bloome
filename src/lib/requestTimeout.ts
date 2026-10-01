export async function withDeadline<T>(request: Promise<T>, ms = 25000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('request_timeout')), ms);
    })]);
  } finally { clearTimeout(timer); }
}

/** Abort stalled network requests; preserve cancellation from the caller. */
export const timedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const source = init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
  const abort = () => controller.abort();
  if (source?.aborted) abort();
  else source?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); source?.removeEventListener('abort', abort); }
};
