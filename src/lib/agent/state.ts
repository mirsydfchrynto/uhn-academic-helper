import { StateGraph, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";

import { AgentState, AgentStateType } from "./types";
import { initializeLLM, toolNode } from "./llm";
import { ideationNode } from "./workers/ideation";
import { outliningNode } from "./workers/research";
import { draftingNode } from "./workers/drafting";
import { finalizationNode } from "./workers/finalization";
import { auditorNode } from "./workers/auditor";
import {
  supervisorNode,
  routeFromSupervisor,
  routeAfterWorker,
  routeAfterAuditor,
} from "./orchestrator";

// Re-export types for backward compatibility
export { AgentState } from "./types";
export type { AgentStateType } from "./types";

// ==========================================
// 1. Initialize LLM with fallback chain
// ==========================================
const llm = initializeLLM();

// ==========================================
// 2. Worker Node Wrappers (inject LLM)
// ==========================================
const ideationNodeWrapper = (state: AgentStateType) =>
  ideationNode(state, llm);
const outliningNodeWrapper = (state: AgentStateType) =>
  outliningNode(state, llm);
const draftingNodeWrapper = (state: AgentStateType) =>
  draftingNode(state, llm);
const finalizationNodeWrapper = (state: AgentStateType) =>
  finalizationNode(state, llm);
const auditorNodeWrapper = (state: AgentStateType) =>
  auditorNode(state, llm);

// ==========================================
// 3. Assemble the Master LangGraph
// ==========================================
const builder = new StateGraph(AgentState)
  .addNode("supervisor", supervisorNode)
  .addNode("ideation", ideationNodeWrapper)
  .addNode("outlining", outliningNodeWrapper)
  .addNode("drafting", draftingNodeWrapper)
  .addNode("finalization", finalizationNodeWrapper)
  .addNode("auditor", auditorNodeWrapper)
  .addNode("tools", toolNode)
  .addEdge("__start__", "supervisor")
  .addConditionalEdges("supervisor", routeFromSupervisor)
  .addConditionalEdges("ideation", routeAfterWorker)
  .addConditionalEdges("outlining", routeAfterWorker)
  .addConditionalEdges("drafting", routeAfterWorker)
  .addConditionalEdges("finalization", routeAfterWorker)
  .addConditionalEdges("auditor", routeAfterAuditor)
  .addEdge("tools", "supervisor");

// ==========================================
// 4. Database Checkpointer (Lazy Init)
// ==========================================
let _pool: Pool | null = null;
let _agent: ReturnType<typeof builder.compile> | null = null;
let _isInitialized = false;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return _pool;
}

/**
 * Returns the compiled academic agent graph.
 * Uses lazy initialization to avoid DB connections at import time.
 */
export async function getAcademicAgent() {
  if (_agent && _isInitialized) return _agent;

  const pool = getPool();
  const checkpointer = new PostgresSaver(pool);

  if (!_isInitialized) {
    console.log("[CHECKPOINTER] Initializing Postgres checkpointer tables...");
    await checkpointer.setup();
    _isInitialized = true;
    console.log("[CHECKPOINTER] Checkpointer tables ready.");
  }

  _agent = builder.compile({ checkpointer });
  return _agent;
}

/**
 * @deprecated Use getAcademicAgent() instead. Kept for backward compatibility.
 * This eager export will still work but triggers DB connection at import time.
 */
const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
const checkpointer = new PostgresSaver(pool);
export const academicAgent = builder.compile({ checkpointer });

let isInitialized = false;
export const setupCheckpointer = async () => {
  if (isInitialized) return;
  console.log("[CHECKPOINTER] Initializing Postgres checkpointer tables...");
  await checkpointer.setup();
  isInitialized = true;
  console.log("[CHECKPOINTER] Checkpointer tables ready.");
};

// Initialize checkpointer tables asynchronously in background on module load
setupCheckpointer().catch((err) => {
  console.error(
    "[CHECKPOINTER] Error setting up database checkpointer in background:",
    err
  );
});

/**
 * Gracefully close the database pool on shutdown.
 */
export async function shutdown() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _agent = null;
    _isInitialized = false;
  }
}
