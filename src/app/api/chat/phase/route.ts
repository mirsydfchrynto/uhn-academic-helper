import { NextRequest, NextResponse } from "next/server";
import { academicAgent } from "@/lib/agent/state";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // === AUTHENTICATION GUARD ===
    const isTest = process.env.APP_ENV === 'test';
    let user = null;
    if (isTest) {
      user = { email: "test@example.com" };
    } else {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      user = data?.user;
      if (!user) {
        return NextResponse.json({ error: "Unauthorized / Wajib Login" }, { status: 401 });
      }
    }
    // ============================

    const { phase } = await req.json();
    const threadId = user.email || "default-thread";

    // Valid phases according to state.ts AgentState definitions
    const validPhases = ["IDEATION", "OUTLINING", "DRAFTING", "FINALIZATION"];
    if (!validPhases.includes(phase)) {
      return NextResponse.json({ error: "Fase tidak valid." }, { status: 400 });
    }

    // Update LangGraph state for this thread
    await academicAgent.updateState(
      { configurable: { thread_id: threadId } },
      { currentPhase: phase }
    );

    console.log(`[AGENT PHASE] Thread ${threadId} phase updated to ${phase}`);

    return NextResponse.json({ success: true, phase });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Error updating agent phase:", error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
