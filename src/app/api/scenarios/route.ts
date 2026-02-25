import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFallbackScenarios } from "@/lib/static-scenarios";

export async function GET() {
  try {
    const scenarios = await prisma.scenario.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(scenarios);
  } catch (err) {
    console.error("GET /api/scenarios error:", err);
    // When DB/Accelerate is unreachable, return built-in scenarios so the app still works
    const fallback = getFallbackScenarios();
    return NextResponse.json(fallback);
  }
}
