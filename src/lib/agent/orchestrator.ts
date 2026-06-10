import { END } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { AgentStateType, PHASES } from "./types";
import { parseStateUpdate } from "./workers/utils";

/**
 * Supervisor/Orchestrator Node
 * Detects intent, manages progress tracking (State Tracker), and handles phase transitions.
 */
export const supervisorNode = async (state: AgentStateType) => {
  const messages = state.messages;
  if (!messages || messages.length === 0) {
    return { currentPhase: state.currentPhase, approvedTitle: state.approvedTitle };
  }

  const lastMessage = messages[messages.length - 1];
  let nextPhase = state.currentPhase;
  let newTitle = state.approvedTitle;

  // --- Scan recent messages (last 10) for title and link signals ---
  let hasTitle = false;
  let detectedTitle = "";
  let hasSourceLink = false;

  const recentMessages = messages.slice(-10);
  for (const msg of recentMessages) {
    const content = typeof msg.content === "string" ? msg.content : "";

    // Check for Title (Judul) in <informasi_mahasiswa>
    const titleMatch = content.match(/Judul:\s*(.+)/i);
    if (titleMatch) {
      const titleVal = titleMatch[1].trim();
      if (
        titleVal &&
        titleVal !== "Belum diisi" &&
        titleVal !== "undefined" &&
        titleVal !== "null" &&
        titleVal.length > 5
      ) {
        hasTitle = true;
        detectedTitle = titleVal;
      }
    }

    // Check for links/attachments
    if (
      content.includes("<lampiran_url") ||
      content.includes("<lampiran_dokumen") ||
      content.includes("GitHub Repo:") ||
      /https?:\/\/[^\s]+/.test(content)
    ) {
      hasSourceLink = true;
    }
  }

  // --- Process last message for phase transition signals ---
  if (lastMessage && typeof lastMessage.content === "string") {
    const content = lastMessage.content;
    const stateUpdate = parseStateUpdate(content);

    // If worker returned a strict JSON phase update, respect it
    if (stateUpdate && stateUpdate.current_phase) {
      const updatedPhase = stateUpdate.current_phase.toUpperCase();
      if (Object.values(PHASES).includes(updatedPhase as any)) {
        nextPhase = updatedPhase as any;
        console.log(`[ORCHESTRATOR] JSON Phase transition: ${state.currentPhase} -> ${nextPhase}`);
      }
    } 
    // Fallback detection using legacy tags
    else {
      // IDEATION -> OUTLINING
      if (state.currentPhase === PHASES.IDEATION) {
        if (content.includes("[SISTEM: JUDUL DISETUJUI]") && hasTitle && hasSourceLink) {
          nextPhase = PHASES.OUTLINING;
          newTitle = detectedTitle || "Terkunci";
          console.log(`[ORCHESTRATOR] Legacy Phase transition: IDEATION -> OUTLINING. Title: ${newTitle}`);
        } else if (hasTitle && hasSourceLink && !state.approvedTitle) {
          // Auto-transition if both conditions met even without explicit signal
          nextPhase = PHASES.OUTLINING;
          newTitle = detectedTitle || "Terkunci";
          console.log(`[ORCHESTRATOR] Auto-transition: IDEATION -> OUTLINING. Title: ${newTitle}`);
        }
      }
      // OUTLINING -> DRAFTING
      else if (state.currentPhase === PHASES.OUTLINING && content.includes("[SISTEM: BAB 1 SELESAI]")) {
        nextPhase = PHASES.DRAFTING;
        console.log("[ORCHESTRATOR] Legacy Phase transition: OUTLINING -> DRAFTING");
      }
      // DRAFTING -> FINALIZATION
      else if (state.currentPhase === PHASES.DRAFTING && content.includes("[SISTEM: BAB 3 SELESAI]")) {
        nextPhase = PHASES.FINALIZATION;
        console.log("[ORCHESTRATOR] Legacy Phase transition: DRAFTING -> FINALIZATION");
      }
    }
  }

  return { currentPhase: nextPhase, approvedTitle: newTitle };
};

/**
 * Routes from supervisor to the appropriate worker based on current phase.
 */
export const routeFromSupervisor = (state: AgentStateType): string => {
  switch (state.currentPhase) {
    case PHASES.FINALIZATION:
      return "finalization";
    case PHASES.DRAFTING:
      return "drafting";
    case PHASES.OUTLINING:
      return "outlining";
    case PHASES.IDEATION:
    default:
      return "ideation";
  }
};

/**
 * Determines whether a worker's response requires a tool call, auditing, or should end the turn.
 */
export const routeAfterWorker = (state: AgentStateType): string => {
  const messages = state.messages;
  if (!messages || messages.length === 0) return END;

  const lastMessage = messages[messages.length - 1];

  // Tool calls check
  if (lastMessage instanceof AIMessage) {
    const toolCalls = lastMessage.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      return "tools";
    }
  }
  const additionalKwargs = (lastMessage as any)?.additional_kwargs;
  if (additionalKwargs?.tool_calls?.length) {
    return "tools";
  }

  // If no tools called, Ideation goes to END. Others go to Auditor for strict review.
  if (state.currentPhase === PHASES.IDEATION) {
    return END;
  }
  return "auditor";
};

/**
 * Routes from Auditor back to Worker if REJECTED, or to END if PASSED.
 */
export const routeAfterAuditor = (state: AgentStateType): string => {
  if (state.internalFeedback) {
    return routeFromSupervisor(state); // Go back to the active worker for revision
  }
  return END;
};
