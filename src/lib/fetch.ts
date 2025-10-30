import type { FetchLike } from "../types";

/**
 * Resolve the fetch implementation to use for HTTP requests.
 *
 * Returns the custom fetch from options if provided, otherwise falls back
 * to the global fetch function. This centralized helper ensures consistent
 * fetch resolution across all RDAP HTTP operations.
 *
 * Used internally by:
 * - Bootstrap registry fetching (`src/rdap/bootstrap.ts`)
 * - RDAP domain lookups (`src/rdap/client.ts`)
 * - RDAP related/entity link requests (`src/rdap/merge.ts`)
 *
 * @param options - Any object that may contain a custom fetch implementation
 * @returns The fetch function to use for HTTP requests
 *
 * @example
 * ```ts
 * import { resolveFetch } from './lib/fetch';
 *
 * const fetchFn = resolveFetch(options);
 * const response = await fetchFn('https://example.com/api', { method: 'GET' });
 * ```
 */
export function resolveFetch(options?: { customFetch?: FetchLike }): FetchLike {
  return options?.customFetch ?? fetch;
}
