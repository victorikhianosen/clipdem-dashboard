import { NextResponse } from "next/server";
import { backendHeaders, getBackendBaseUrl } from "@/lib/backend";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/download/[id]/file">
) {
  const { id } = await ctx.params;

  let backendResponse: Response;
  try {
    backendResponse = await fetch(
      `${getBackendBaseUrl()}/api/download/${encodeURIComponent(id)}/file`,
      {
        headers: backendHeaders(),
        cache: "no-store",
      }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Could not reach the download service. Please try again shortly.",
        data: null,
      },
      { status: 502 }
    );
  }

  if (!backendResponse.ok || !backendResponse.body) {
    // Backend returns JSON ApiResponse envelopes for errors (404 not ready, etc).
    const payload = await backendResponse.json().catch(() => null);
    return NextResponse.json(
      payload ?? { success: false, message: "File is not available", data: null },
      { status: backendResponse.status || 502 }
    );
  }

  // Stream the file straight through so the client gets a real Content-Length to track
  // download progress against, instead of buffering the whole file in this route.
  const headers = new Headers();
  const contentType = backendResponse.headers.get("Content-Type");
  const contentLength = backendResponse.headers.get("Content-Length");
  const contentDisposition = backendResponse.headers.get("Content-Disposition");
  if (contentType) headers.set("Content-Type", contentType);
  if (contentLength) headers.set("Content-Length", contentLength);
  if (contentDisposition) headers.set("Content-Disposition", contentDisposition);

  return new NextResponse(backendResponse.body, {
    status: 200,
    headers,
  });
}
