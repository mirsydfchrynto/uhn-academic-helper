export const maxDuration = 60; // Paksa batas maksimal waktu eksekusi Vercel Serverless

import { NextRequest, NextResponse } from "next/server";
import { academicAgent, setupCheckpointer } from "@/lib/agent/state";
import { HumanMessage } from "@langchain/core/messages";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    // === AUTHENTICATION GUARD ===
    // Use server-only env var (no NEXT_PUBLIC_ prefix) to prevent client-side test bypass
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

    // === RATE LIMITING ===
    const { success, limit, remaining, reset } = await checkRateLimit(user.email || "anonymous");
    if (!success) {
      return NextResponse.json(
        { error: "Batas harian konsultasi (20 pesan/hari) telah habis. Silakan coba lagi besok." },
        { 
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          }
        }
      );
    }
    // =====================
    // Ensure checkpointer is initialized
    await setupCheckpointer();

    const { messages, sessionId } = await req.json();
    const lastMessage = messages[messages.length - 1];

    // Thread isolation: combine user email + session ID to prevent state corruption
    // across concurrent sessions from the same user
    const userEmail = user.email || "anonymous";
    const threadId = sessionId ? `${userEmail}::${sessionId}` : userEmail;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const events = await academicAgent.streamEvents(
            { messages: [new HumanMessage(lastMessage.content)] },
            { configurable: { thread_id: threadId }, version: "v2" }
          );

          let modelRunCount = 0;
          let toolExecuted = false;

          for await (const event of events) {
            // Detect fallback model starts
            if (event.event === "on_chat_model_start") {
              modelRunCount++;
              // If we see another model start without any tool execution, it's a fallback run
              if (modelRunCount > 1 && !toolExecuted) {
                controller.enqueue(encoder.encode("[SISTEM: RESET_STREAM]"));
              }
              toolExecuted = false;
            }
            // Capture stream content chunks
            else if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
              if (typeof event.data.chunk.content === "string") {
                controller.enqueue(encoder.encode(event.data.chunk.content));
              }
            } 
            // UX Enhancement: Beri tahu UI secara dinamis alat apa yang sedang digunakan
            else if (event.event === "on_tool_start") {
               toolExecuted = true;
               const toolName = event.name;
               let statusText = "Menjalankan alat komputasi...";
               
               if (toolName === "verify_academic_source") {
                 statusText = `Mencari Jurnal CrossRef: "${event.data?.input?.query || '...'}"`;
               } else if (toolName === "fetch_journal_abstract") {
                 statusText = `Mengekstrak Abstrak (DOI: ${event.data?.input?.doi || '...'})`;
               } else if (toolName === "check_uhn_guidelines") {
                 statusText = `Memverifikasi Aturan Kampus UHN: "${event.data?.input?.section || '...'}"`;
               } else if (toolName === "fetch_github_content") {
                 statusText = `Membaca Repositori GitHub: "${event.data?.input?.path || 'root'}"`;
               }
               
               if (toolName) {
                 controller.enqueue(encoder.encode(`\n\n> ⚙️ **[MCP EXECUTING: ${statusText}]**\n\n`));
               }
            }
          }
          controller.close();
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(`\n\n[CRITICAL ERROR: ${errMsg}]`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
