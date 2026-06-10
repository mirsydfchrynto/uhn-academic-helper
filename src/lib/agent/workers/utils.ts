/**
 * Helper utility to parse <STATE_UPDATE> JSON blocks from agent responses.
 */
export function parseStateUpdate(content: string): any {
  if (!content) return null;
  const match = content.match(/<STATE_UPDATE>([\s\S]*?)<\/STATE_UPDATE>/);
  if (!match) return null;
  
  try {
    return JSON.parse(match[1].trim());
  } catch (error) {
    console.error("[STATE_UPDATE_PARSER] Failed to parse JSON:", error);
    return null;
  }
}
