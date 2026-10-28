import type { ApiEnvelope } from "./types";

/**
 * Calls one of this app's own /api/* route handlers (never the Java backend directly --
 * that's the server-only proxy's job, so the backend API key never reaches the browser).
 */
export async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<ApiEnvelope<T>> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    const envelope = (await response.json()) as ApiEnvelope<T>;
    return envelope;
  } catch {
    return {
      success: false,
      message: "Network error. Check your connection and try again.",
      data: null,
    };
  }
}

/**
 * Streams a file response and reports real byte progress against the Content-Length header.
 * When the server doesn't send Content-Length, `total` is null for every call -- the caller
 * should show an indeterminate indicator rather than a fabricated percentage in that case.
 */
export async function requestFile(
  path: string,
  onProgress?: (loaded: number, total: number | null) => void
): Promise<{ blob: Blob; contentType: string | null }> {
  const response = await fetch(path);

  if (!response.ok || !response.body) {
    let message = "Download failed.";
    try {
      const envelope = (await response.json()) as ApiEnvelope<unknown>;
      message = envelope.message || message;
    } catch {
      // response wasn't JSON (e.g. a network/proxy error page) -- keep the generic message
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type");
  const contentLengthHeader = response.headers.get("Content-Length");
  const total = contentLengthHeader ? Number(contentLengthHeader) : null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total && Number.isFinite(total) ? total : null);
    }
  }

  const blob = new Blob(chunks as BlobPart[], contentType ? { type: contentType } : undefined);
  return { blob, contentType };
}
