import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { verifyAcademicSourceTool, fetchJournalAbstractTool, checkUHNGuidelinesTool, fetchGitHubContentTool } from '../src/lib/agent/tools';

async function testTools() {
  console.log("=== STARTING AGENT TOOLS TEST ===");

  // 1. Test UHN Guidelines
  console.log("\n[1] Testing checkUHNGuidelinesTool...");
  const guidelinesResult = await checkUHNGuidelinesTool.invoke({ docType: "proposal", section: "bab1" });
  console.log("Guidelines Result (first 200 chars):\n", typeof guidelinesResult === 'string' ? guidelinesResult.substring(0, 200) + "..." : JSON.stringify(guidelinesResult).substring(0, 200));

  // 2. Test Academic Source verification
  console.log("\n[2] Testing verifyAcademicSourceTool...");
  const crossrefResult = await verifyAcademicSourceTool.invoke({ query: "Smart Queue System QR Code" });
  console.log("CrossRef Result:\n", crossrefResult);

  // 3. Test Journal Abstract extraction
  console.log("\n[3] Testing fetchJournalAbstractTool...");
  const abstractResult = await fetchJournalAbstractTool.invoke({ doi: "10.1109/CVPR.2016.90" });
  console.log("Abstract Result (first 200 chars):\n", typeof abstractResult === 'string' ? abstractResult.substring(0, 200) + "..." : JSON.stringify(abstractResult).substring(0, 200));

  // 4. Test GitHub Content fetcher
  console.log("\n[4] Testing fetchGitHubContentTool...");
  const githubResult = await fetchGitHubContentTool.invoke({ repoUrl: "https://github.com/octocat/Spoon-Knife", path: "README.md" });
  console.log("GitHub Result (first 200 chars):\n", typeof githubResult === 'string' ? githubResult.substring(0, 200) + "..." : JSON.stringify(githubResult).substring(0, 200));

  console.log("\n=== ALL TOOLS TEST COMPLETED SUCCESSFULLY ===");
}

testTools().catch(err => {
  console.error("Test failed:", err);
});
