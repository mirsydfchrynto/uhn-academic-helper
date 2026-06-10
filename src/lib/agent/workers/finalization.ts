import { SystemMessage, AIMessage } from "@langchain/core/messages";
import { FINALIZATION_PROMPT } from "../prompts/finalization";
import { AgentStateType } from "../types";
import { parseStateUpdate } from "./utils";

const MAX_CONTEXT_MESSAGES = 25;

export const finalizationNode = async (state: AgentStateType, llm: any) => {
  try {
    let promptText = FINALIZATION_PROMPT;
    if (state.internalFeedback) {
      promptText += `\n\n=== 🚨 AUDITOR FEEDBACK (WAJIB DIPERBAIKI) ===\nDraf Anda sebelumnya DITOLAK oleh Auditor dengan alasan berikut:\n${state.internalFeedback}\n\nAnda WAJIB memperbaikinya sekarang juga!`;
    }
    const systemPrompt = new SystemMessage(promptText);
    const recentMessages = state.messages.slice(-MAX_CONTEXT_MESSAGES);
    const response = await llm.invoke([systemPrompt, ...recentMessages]);

    const content = typeof response.content === "string" ? response.content : "";
    let completedSections = [...(state.completedSections || [])];

    let sources = [...(state.sources || [])];

    // Parse strictly from JSON if present
    const stateUpdate = parseStateUpdate(content);
    if (stateUpdate) {
      if (Array.isArray(stateUpdate.completed_sections)) {
        completedSections = Array.from(new Set([...completedSections, ...stateUpdate.completed_sections]));
      }
      if (Array.isArray(stateUpdate.sources)) {
        sources = stateUpdate.sources;
      }
    }

    // Fallback detection
    if (content.includes("[SISTEM: BAB 4 SELESAI]") && !completedSections.includes("BAB_IV")) {
      completedSections.push("BAB_IV");
    }
    if (content.includes("[SISTEM: DOKUMEN SELESAI]")) {
      if (!completedSections.includes("BAB_V")) completedSections.push("BAB_V");
      if (!completedSections.includes("DAFTAR_PUSTAKA")) completedSections.push("DAFTAR_PUSTAKA");
    }

    return { messages: [response], completedSections, sources };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[FINALIZATION] Error:", errMsg);
    return {
      messages: [
        new AIMessage(`⚠️ Maaf, terjadi gangguan teknis pada sesi finalisasi dokumen. Silakan coba kirim pesan Anda kembali. (Detail: ${errMsg})`)
      ],
    };
  }
};
