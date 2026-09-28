import type { NextRequest } from "next/server";
import { getUsage, getVisitor } from "@/lib/limits";

/** Tells the page the limits and how many uses this visitor has left today. */
export async function GET(req: NextRequest) {
  const visitor = await getVisitor(req);
  return Response.json(getUsage(visitor), { headers: { "Cache-Control": "no-store" } });
}
