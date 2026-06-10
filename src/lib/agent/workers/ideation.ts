import { SystemMessage, AIMessage } from "@langchain/core/messages";
import { IDEATION_PROMPT } from "../prompts/ideation";
import { AgentStateType } from "../types";
import { parseStateUpdate } from "./utils";

const MAX_CONTEXT_MESSAGES = 20;

export const ideationNode = async (state: AgentStateType, llm: any) => {
  try {
    const systemPrompt = new SystemMessage(IDEATION_PROMPT);
    const recentMessages = state.messages.slice(-MAX_CONTEXT_MESSAGES);
    const response = await llm.invoke([systemPrompt, ...recentMessages]);

    let newTitle = state.approvedTitle;
    const content = typeof response.content === "string" ? response.content : "";

    // Parse strictly from JSON if present
    const stateUpdate = parseStateUpdate(content);
    if (stateUpdate && stateUpdate.locked_title) {
      newTitle = stateUpdate.locked_title;
    } 
    // Fallback detection
    else if (content.includes("[SISTEM: JUDUL DISETUJUI]")) {
      const titleMatch = content.match(/"locked_title":\s*"([^"]+)"/) || content.match(/Judul:\s*(.+)/i);
      newTitle = titleMatch ? titleMatch[1].trim() : "Terkunci";
    }

    return { messages: [response], approvedTitle: newTitle };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[IDEATION] Error:", errMsg);
    return {
      messages: [
        new AIMessage(`⚠️ Maaf, terjadi gangguan teknis pada sesi konsultasi. Silakan coba kirim pesan Anda kembali. (Detail: ${errMsg})`)
      ],
    };
  }
};
