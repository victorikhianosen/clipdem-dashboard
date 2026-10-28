import { NextResponse } from "next/server";
import { backendHeaders, getBackendBaseUrl } from "@/lib/backend";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/download/[id]/status">
) {
  const { id } = await ctx.params;

  try {
    const backendResponse = await fetch(
      `${getBackendBaseUrl()}/api/download/${encodeURIComponent(id)}/status`,
      {
        headers: backendHeaders(),
        cache: "no-store",
      }
    );

    const payload = await backendResponse.json();
    return NextResponse.json(payload, { status: backendResponse.status });
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
}
