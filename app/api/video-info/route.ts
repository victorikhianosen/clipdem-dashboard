import { NextRequest, NextResponse } from "next/server";
import { backendHeaders, getBackendBaseUrl } from "@/lib/backend";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON", data: null },
      { status: 400 }
    );
  }

  try {
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/get-video`, {
      method: "POST",
      headers: backendHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = await backendResponse.json();
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Could not reach the video processing service. Please try again shortly.",
        data: null,
      },
      { status: 502 }
    );
  }
}
