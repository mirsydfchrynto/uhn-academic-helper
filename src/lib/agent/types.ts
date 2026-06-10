import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

/**
 * Phase enum constants for type safety
 */
export const PHASES = {
  IDEATION: "IDEATION",
  OUTLINING: "OUTLINING",
  DRAFTING: "DRAFTING",
  FINALIZATION: "FINALIZATION",
} as const;

export type Phase = (typeof PHASES)[keyof typeof PHASES];

/**
 * AgentState — the LangGraph state annotation for the academic helper.
 * All state fields are defined here as the single source of truth.
 */
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  currentPhase: Annotation<Phase>({
    reducer: (_x, y) => y ?? _x,
    default: () => PHASES.IDEATION as Phase,
  }),
  approvedTitle: Annotation<string | null>({
    reducer: (_x, y) => y ?? _x,
    default: () => null,
  }),
  /** Tracks which BABs have been completed */
  completedSections: Annotation<string[]>({
    reducer: (x, y) => {
      const merged = new Set([...x, ...y]);
      return Array.from(merged);
    },
    default: () => [],
  }),
  /** Tracks feedback from Auditor Agent */
  internalFeedback: Annotation<string | null>({
    reducer: (_x, y) => y, // Always take the latest feedback (or null to clear it)
    default: () => null,
  }),
  /** Prevents infinite loops between Worker and Auditor */
  auditCount: Annotation<number>({
    reducer: (x, y) => (y === 0 ? 0 : x + y), // Pass 0 to reset, or 1 to increment
    default: () => 0,
  }),
  /** Reference Vault: strictly validated references */
  sources: Annotation<any[]>({
    reducer: (x, y) => {
      // Merge by URL/DOI to prevent duplicates
      const map = new Map();
      x.forEach(src => src.url && map.set(src.url, src));
      y.forEach(src => src.url && map.set(src.url, src));
      return Array.from(map.values());
    },
    default: () => [],
  }),
});

/** Convenience type for the state shape */
export type AgentStateType = typeof AgentState.State;
