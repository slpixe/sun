export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export function parseCorsAllowedOrigins(
  value: string | undefined,
  options: { required: boolean },
): string[] | undefined {
  if (value === undefined) {
    if (options.required) {
      throw new Error("CORS_ALLOWED_ORIGINS is required in production");
    }
    return undefined;
  }

  const origins = [...new Set(value.split(",").map((origin) => origin.trim()))];
  if (origins.length === 0 || origins.some((origin) => origin.length === 0)) {
    throw new Error("CORS_ALLOWED_ORIGINS must contain one or more origins");
  }

  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.origin !== origin
    ) {
      throw new Error(`CORS origin must be an exact HTTP(S) origin: ${origin}`);
    }
  }

  return origins;
}

export function createTimeoutFetch(
  timeoutMs: number,
  fetchImplementation: FetchLike = globalThis.fetch,
): FetchLike {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Upstream request timeout must be a positive integer");
  }

  return (input, init = {}) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal =
      init.signal == null
        ? timeoutSignal
        : AbortSignal.any([init.signal, timeoutSignal]);
    return fetchImplementation(input, { ...init, signal });
  };
}
