import { SystemMessage, AIMessage } from "@langchain/core/messages";
import { AUDITOR_PROMPT } from "../prompts/auditor";
import { AgentStateType } from "../types";

const MAX_AUDIT_RETRIES = 2; // worker can retry up to 2 times (total 3 attempts)

export const auditorNode = async (state: AgentStateType, llm: any) => {
  try {
    const systemPromptText = AUDITOR_PROMPT + `\n\nDAFTAR REFERENSI YANG SAH (RAG VAULT):\n${JSON.stringify(state.sources || [], null, 2)}\n\nJika draf menggunakan referensi yang TIDAK ADA di daftar ini, REJECT!`;
    const systemPrompt = new SystemMessage(systemPromptText);
    // Send the last message (which is the drafted document) for auditing
    const lastMessage = state.messages[state.messages.length - 1];
    const response = await llm.invoke([systemPrompt, lastMessage]);

    const content = typeof response.content === "string" ? response.content : "";
    
    // Parse <AUDIT_RESULT>
    const match = content.match(/<AUDIT_RESULT>([\s\S]*?)<\/AUDIT_RESULT>/);
    let status = "PASS";
    let feedback = null;

    if (match) {
      try {
        const result = JSON.parse(match[1].trim());
        status = result.status;
        feedback = result.feedback;
      } catch (e) {
        console.error("[AUDITOR] Failed to parse JSON:", e);
      }
    } else {
      // Fallback text detection
      if (content.includes("REJECT")) status = "REJECT";
    }

    const currentAuditCount = state.auditCount || 0;

    if (status === "REJECT" && currentAuditCount < MAX_AUDIT_RETRIES) {
      console.log(`[AUDITOR] Draf ditolak. Feedback: ${feedback}`);
      return {
        // Output auditor message so user sees the thinking process
        messages: [
          new AIMessage(`\n\n> 🔍 **[AUDITOR REVIEW: REVISI DIPERLUKAN]**\n${feedback}\n\n*Agen sedang memperbaiki draf secara otomatis...*\n\n`)
        ],
        internalFeedback: feedback,
        auditCount: 1 // increments by 1
      };
    }

    // PASS or Max Retries reached
    console.log(`[AUDITOR] Draf Diterima (atau Max Retries).`);
    return {
      // Clear feedback and reset count
      internalFeedback: null,
      auditCount: -currentAuditCount // resets to 0 by adding negative
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[AUDITOR] Error:", errMsg);
    return {
      internalFeedback: null,
      auditCount: 0
    };
  }
};
