import { SystemMessage, AIMessage } from "@langchain/core/messages";
import { RESEARCH_PROMPT } from "../prompts/research";
import { AgentStateType } from "../types";
import { parseStateUpdate } from "./utils";

const MAX_CONTEXT_MESSAGES = 20;

export const outliningNode = async (state: AgentStateType, llm: any) => {
  try {
    let promptText = RESEARCH_PROMPT;
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
    if (content.includes("[SISTEM: BAB 1 SELESAI]") && !completedSections.includes("BAB_I")) {
      completedSections.push("BAB_I");
    }

    return { messages: [response], completedSections, sources };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[RESEARCH] Error:", errMsg);
    return {
      messages: [
        new AIMessage(`⚠️ Maaf, terjadi gangguan teknis pada sesi penyusunan BAB I. Silakan coba kirim pesan Anda kembali. (Detail: ${errMsg})`)
      ],
    };
  }
};
