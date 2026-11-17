/**
 * SafePath — High-Performance API Cache & Request Deduplicator
 *
 * 1. Request Deduplication: If an identical GET request is in-flight,
 *    subsequent callers receive the same underlying fetch instead of firing duplicate HTTP requests.
 * 2. In-Memory Response Caching: Completed responses are cached in memory with a configurable TTL,
 *    eliminating duplicate network requests across React re-renders and StrictMode mounts.
 * 3. Isolated AbortSignal support: An individual caller aborting their signal does NOT cancel
 *    the request for other concurrent callers.
 */

const responseCache = new Map();
const inflightRequests = new Map();

/**
 * Fetch with request deduplication and in-memory caching.
 * @param {string} url - Request URL
 * @param {object} options - Fetch options (e.g. signal, headers)
 * @param {number} ttlMs - Cache Time-To-Live in milliseconds (default: 2 minutes)
 * @returns {Promise<any>} Parsed JSON response
 */
export async function cachedFetch(url, options = {}, ttlMs = 120000) {
  const method = (options.method || "GET").toUpperCase();

  // Non-GET requests bypass caching
  if (method !== "GET") {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }

  const cacheKey = url;
  const now = Date.now();

  // 1. Check valid cache entry
  const cached = responseCache.get(cacheKey);
  if (cached && now - cached.timestamp < (cached.ttl || ttlMs)) {
    return cached.data;
  }

  // If caller already aborted, reject immediately
  if (options.signal?.aborted) {
    throw new DOMException("The user aborted a request.", "AbortError");
  }

  // 2. Obtain or create the deduplicated underlying request
  let requestPromise = inflightRequests.get(cacheKey);
  if (!requestPromise) {
    requestPromise = (async () => {
      try {
        // Strip signal from underlying network fetch so one caller's unmount/abort
        // does not kill the network request for other concurrent callers
        const fetchOptions = { ...options };
        delete fetchOptions.signal;

        const res = await fetch(url, fetchOptions);
        const contentType = res.headers?.get("content-type") || "";

        if (!res.ok) {
          let errDetail = `HTTP ${res.status}: ${res.statusText}`;
          try {
            if (contentType.includes("json")) {
              const errJson = await res.json();
              errDetail = errJson.detail || errJson.message || errDetail;
            } else {
              const errTxt = await res.text();
              if (errTxt && !errTxt.trim().startsWith("<")) {
                errDetail = `${errDetail} — ${errTxt.slice(0, 120)}`;
              }
            }
          } catch (_) {}
          throw new Error(errDetail);
        }

        // Prevent HTML responses (e.g. SPA index.html fallback) from being parsed as JSON
        if (contentType.includes("text/html") || contentType.includes("html")) {
          const rawText = await res.text();
          if (rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html") || rawText.trim().startsWith("<")) {
            throw new Error(
              `SafePath backend at ${url} returned HTML instead of JSON. Ensure the server is running and reachable.`
            );
          }
          try {
            const parsed = JSON.parse(rawText);
            responseCache.set(cacheKey, { data: parsed, timestamp: Date.now(), ttl: ttlMs });
            return parsed;
          } catch (_) {
            throw new Error(`Invalid response format from ${url}: expected JSON, received HTML document.`);
          }
        }

        const rawText = await res.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (jsonErr) {
          if (rawText.trim().startsWith("<")) {
            throw new Error(`Received HTML response from ${url} instead of JSON.`);
          }
          throw new Error(`Malformed JSON response from ${url}: ${jsonErr.message}`);
        }

        responseCache.set(cacheKey, { data, timestamp: Date.now(), ttl: ttlMs });
        return data;
      } finally {
        inflightRequests.delete(cacheKey);
      }
    })();
    inflightRequests.set(cacheKey, requestPromise);
  }

  // 3. Attach caller's specific abort signal if present
  if (options.signal) {
    return new Promise((resolve, reject) => {
      const signal = options.signal;
      if (signal.aborted) {
        return reject(new DOMException("The user aborted a request.", "AbortError"));
      }

      const onAbort = () => {
        reject(new DOMException("The user aborted a request.", "AbortError"));
      };

      signal.addEventListener("abort", onAbort, { once: true });

      requestPromise
        .then((val) => {
          signal.removeEventListener("abort", onAbort);
          resolve(val);
        })
        .catch((err) => {
          signal.removeEventListener("abort", onAbort);
          reject(err);
        });
    });
  }

  return requestPromise;
}

/**
 * Clear cached entries (or specific key if provided)
 */
export function clearApiCache(url = null) {
  if (url) {
    responseCache.delete(url);
    inflightRequests.delete(url);
  } else {
    responseCache.clear();
    inflightRequests.clear();
  }
}

export default {
  cachedFetch,
  clearApiCache,
};
