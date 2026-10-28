const DEFAULT_BASE_URL = "http://localhost:8080";

/**
 * Server-only config for talking to the Java backend. Never import this from a Client Component --
 * BACKEND_API_KEY must stay out of the browser bundle.
 */
export function getBackendBaseUrl(): string {
  return process.env.BACKEND_API_URL?.replace(/\/+$/, "") || DEFAULT_BASE_URL;
}

export function getBackendApiKey(): string {
  const key = process.env.BACKEND_API_KEY;
  if (!key) {
    throw new Error(
      "BACKEND_API_KEY is not set. Add it to .env.local (see .env.local.example)."
    );
  }
  return key;
}

export function backendHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    "X-API-Key": getBackendApiKey(),
    ...extra,
  };
}
