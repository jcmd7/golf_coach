import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "AI explanations are optional. Add OPENAI_API_KEY to .env.local and restart the server to enable them." }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("metrics" in body) || typeof body.metrics !== "object" || !body.metrics) return NextResponse.json({ error: "Missing metrics" }, { status: 400 });
  const metrics = body.metrics as Record<string, unknown>;
  const allowed = ["headSway", "hipSway", "spineChange", "shoulderTilt", "kneeFlex", "tracking"];
  const sanitized: Record<string, number | null> = {};
  for (const key of allowed) {
    const item = metrics[key];
    const value = item && typeof item === "object" && "value" in item ? (item as {value: unknown}).value : null;
    sanitized[key] = typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1000 ? value : null;
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      store: false,
      instructions: "You are a careful golf swing coach. You receive ONLY coarse 2D monocular pose measurements, not video. Do not pretend to see the swing, the club, impact, ball flight, hand path, or 3D rotation. Values headSway and hipSway are maximum horizontal movement as percentage of address shoulder width; spineChange/shoulderTilt/kneeFlex are 2D projected angle estimates; tracking is percent pose coverage. Give 2 concise evidence-based observations, mention uncertainty/camera calibration, and prescribe one safe practical drill. Avoid inventing precise norms or diagnosing injury. No markdown table.",
      input: `Please interpret the following browser-estimated face-on swing measurements: ${JSON.stringify(sanitized)}. State when the evidence is too weak.`,
      max_output_tokens: 450,
    });
    return NextResponse.json({ explanation: result.output_text || "No explanation was generated." });
  } catch {
    return NextResponse.json({ error: "AI coaching is temporarily unavailable. Your local measurements and drills remain available." }, { status: 502 });
  }
}
