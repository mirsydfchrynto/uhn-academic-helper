import { ChatVertexAI } from "@langchain/google-vertexai";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  verifyAcademicSourceTool,
  fetchJournalAbstractTool,
  checkUHNGuidelinesTool,
  fetchGitHubContentTool,
} from "./tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";

/** All registered tools for the agent */
export const tools = [
  verifyAcademicSourceTool,
  fetchJournalAbstractTool,
  checkUHNGuidelinesTool,
  fetchGitHubContentTool,
];

/** Pre-built ToolNode for the LangGraph */
export const toolNode = new ToolNode(tools);

/**
 * Creates an OpenAI-compatible model instance bound to tools.
 */
function createRouterModel(modelName: string): BaseChatModel {
  return new ChatOpenAI({
    modelName,
    apiKey: process.env.ROUTER_API_KEY || "9router",
    configuration: {
      baseURL: process.env.ROUTER_BASE_URL || "http://localhost:20128/v1",
    },
    temperature: 0.7,
  }).bindTools(tools) as unknown as BaseChatModel;
}

/**
 * Initializes the primary LLM with fallback chain.
 * Supports two modes:
 * 1. 9Router (local/free OpenAI-compatible proxy)
 * 2. GCP Vertex AI (production)
 */
export function initializeLLM() {
  if (process.env.USE_9ROUTER === "true") {
    console.log(
      "[LLM] Initializing with 9router (OpenAI-compatible) provider."
    );

    const primary = createRouterModel(
      process.env.ROUTER_PRIMARY_MODEL || "cx/gpt-5.5"
    );

    const fallbacks = [
      "vx/gemini-3-flash-preview",
      "vx/gemini-3.1-pro-preview",
      "vx/gemini-3.1-flash-lite-preview",
      "openrouter/anthropic/claude-sonnet-4.5",
      "openrouter/google/gemma-4-31b-it:free",
      "kr/claude-sonnet-4.5",
      "kr/claude-haiku-4.5",
      "kr/deepseek-3.2",
    ].map(createRouterModel);

    return (primary as any).withFallbacks({ fallbacks });
  }

  // Production: GCP Vertex AI
  if (!process.env.GCP_PROJECT_ID) {
    throw new Error(
      "CRITICAL: GCP_PROJECT_ID is missing. Set USE_9ROUTER=true for local development."
    );
  }

  console.log("[LLM] Initializing with GCP Vertex AI provider.");

  const primary = new ChatVertexAI({
    model: "gemini-2.5-pro",
    project: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_REGION || "us-central1",
    streaming: true,
  } as any).bindTools(tools);

  const fallback = new ChatVertexAI({
    model: "gemini-2.5-flash",
    project: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_REGION || "us-central1",
    streaming: true,
  } as any).bindTools(tools);

  return (primary as any).withFallbacks({ fallbacks: [fallback] });
}
