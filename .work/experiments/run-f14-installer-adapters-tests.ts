import * as fs from "fs";
import * as path from "path";
import {
  installOpenMemory,
  uninstallOpenMemory,
  setupOpenCodePlugin,
  setupMCPServer,
  SHIM_HEADER_MARKER,
  runInteractiveInitWizard,
} from "../../src/installer";
import { StorageEngine } from "../../src/storage";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

async function runInstallerAdaptersTests() {
  console.log("=================================================");
  console.log("   OpenMemory F14: Installer Adapters Test Suite");
  console.log("=================================================\n");

  const scratchDir = path.join(process.cwd(), ".work", "scratch", "f14-installer-test");
  if (fs.existsSync(scratchDir)) {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
  fs.mkdirSync(scratchDir, { recursive: true });

  // -------------------------------------------------------------------------
  // TEST 1: Clean Installation (Core + AGENTS.md + Plugin Shim + MCP Config)
  // -------------------------------------------------------------------------
  console.log("Running TEST 1: Clean Installation with Adapters...");
  const res1 = installOpenMemory({ targetDir: scratchDir });
  assert(res1.success === true, "Installation reported success");
  assert(res1.storageInitialized === true, "Storage initialized");
  assert(res1.agentsMdUpdated === true, "AGENTS.md updated");
  assert(res1.pluginShimCreated === true, "Plugin shim created");
  assert(res1.mcpConfigured === true, "MCP configured");

  const agentsMdContent = fs.readFileSync(path.join(scratchDir, "AGENTS.md"), "utf-8");
  assert(agentsMdContent.includes("<!-- OPENMEMORY:START -->"), "AGENTS.md has OpenMemory block");

  const shimPath = path.join(scratchDir, ".opencode", "plugins", "openmemory.ts");
  assert(fs.existsSync(shimPath), "Plugin shim file created");
  const shimContent = fs.readFileSync(shimPath, "utf-8");
  assert(shimContent.includes(SHIM_HEADER_MARKER), "Shim contains header marker");
  assert(shimContent.includes('import { OpenMemoryPlugin } from "openmemory/plugin";'), "Shim imports openmemory/plugin");

  const mcpConfigPath = path.join(scratchDir, "opencode.json");
  assert(fs.existsSync(mcpConfigPath), "opencode.json created");
  const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
  assert(mcpConfig.mcpServers?.openmemory?.command === "node", "MCP command is node");
  assert(mcpConfig.mcpServers?.openmemory?.args[0] === "node_modules/openmemory/dist/mcp.js", "MCP args points to dist/mcp.js");

  console.log("[PASSED] TEST 1: Clean Installation with Adapters\n");

  // -------------------------------------------------------------------------
  // TEST 2: Idempotent Installation (No Duplicates)
  // -------------------------------------------------------------------------
  console.log("Running TEST 2: Idempotent Re-Installation...");
  const res2 = installOpenMemory({ targetDir: scratchDir });
  assert(res2.success === true, "Second installation succeeded");
  assert(res2.pluginShimCreated === false, "Shim was not recreated needlessly");

  const mcpConfig2 = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
  assert(Object.keys(mcpConfig2.mcpServers).length === 1, "mcpServers has exactly 1 entry");
  console.log("[PASSED] TEST 2: Idempotent Re-Installation\n");

  // -------------------------------------------------------------------------
  // TEST 3: Preservation of User Custom Plugin & Third-Party MCP Config
  // -------------------------------------------------------------------------
  console.log("Running TEST 3: Preservation of User Custom Plugin & MCP Servers...");
  const customScratch = path.join(process.cwd(), ".work", "scratch", "f14-custom-test");
  if (fs.existsSync(customScratch)) {
    fs.rmSync(customScratch, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(customScratch, ".opencode", "plugins"), { recursive: true });

  // Custom plugin without SHIM_HEADER_MARKER
  const customPluginPath = path.join(customScratch, ".opencode", "plugins", "openmemory.ts");
  const customPluginContent = "// User custom plugin code";
  fs.writeFileSync(customPluginPath, customPluginContent, "utf-8");

  // Pre-existing opencode.json with third party MCP
  const preMcpConfig = {
    mcpServers: {
      github: { command: "npx", args: ["github-mcp"] }
    }
  };
  fs.writeFileSync(path.join(customScratch, "opencode.json"), JSON.stringify(preMcpConfig, null, 2), "utf-8");

  const res3 = installOpenMemory({ targetDir: customScratch });
  assert(res3.pluginShimCreated === false, "Custom plugin was preserved and not overwritten");
  assert(fs.readFileSync(customPluginPath, "utf-8") === customPluginContent, "Custom plugin content unchanged");

  const mergedMcp = JSON.parse(fs.readFileSync(path.join(customScratch, "opencode.json"), "utf-8"));
  assert(mergedMcp.mcpServers.github !== undefined, "Pre-existing github MCP preserved");
  assert(mergedMcp.mcpServers.openmemory !== undefined, "openmemory MCP added alongside github");
  console.log("[PASSED] TEST 3: Preservation of User Custom Plugin & MCP Servers\n");

  // -------------------------------------------------------------------------
  // TEST 4: Interactive Wizard Bug Fix (activePhaseId vs currentStage)
  // -------------------------------------------------------------------------
  console.log("Running TEST 4: Wizard Bug Fix (Phase ID vs Stage Name)...");
  const wizardScratch = path.join(process.cwd(), ".work", "scratch", "f14-wizard-test");
  if (fs.existsSync(wizardScratch)) {
    fs.rmSync(wizardScratch, { recursive: true, force: true });
  }
  fs.mkdirSync(wizardScratch, { recursive: true });

  const wizRes = await runInteractiveInitWizard({
    targetDir: wizardScratch,
    answersProvider: async () => "DESCUBRIR",
    confirmProvider: async () => true,
  });
  assert(wizRes.userConfirmed === true, "Wizard confirmed");

  const storage = new StorageEngine(wizardScratch);
  const state = storage.getOrInitProjectState();
  assert(state.currentStage === "DESCUBRIR", "currentStage is DESCUBRIR");
  assert(state.roadmap.activePhaseId === "PHASE-1", "activePhaseId is PHASE-1 (NOT DESCUBRIR)");

  const handoff = storage.getOrInitHandoff();
  if (handoff.includes("undefined")) {
    console.error("DEBUG handoff content:\n", handoff);
  }
  assert(!handoff.includes("undefined"), "handoff.md does NOT contain 'undefined'");
  assert(handoff.includes("Fase 1: ") || handoff.includes("PHASE-1") || handoff.includes("Fase activa:"), "handoff.md renders active phase");
  console.log("[PASSED] TEST 4: Wizard Bug Fix Verified\n");

  // -------------------------------------------------------------------------
  // TEST 5: Reversible Integration Uninstallation (preserve .openmemory/)
  // -------------------------------------------------------------------------
  console.log("Running TEST 5: Integration Uninstallation (Preserving .openmemory/)...");
  const unres = uninstallOpenMemory({ targetDir: scratchDir });
  assert(unres.success === true, "Uninstall succeeded");
  assert(unres.agentsMdCleaned === true, "AGENTS.md block cleaned");
  assert(unres.pluginShimRemoved === true, "Plugin shim removed");
  assert(unres.mcpConfigRemoved === true, "MCP config removed");
  assert(unres.storagePreserved === true, "Storage (.openmemory/) preserved");

  assert(!fs.existsSync(path.join(scratchDir, ".opencode", "plugins", "openmemory.ts")), "Shim deleted");
  assert(fs.existsSync(path.join(scratchDir, ".openmemory")), ".openmemory/ directory STILL EXISTS");
  assert(fs.existsSync(path.join(scratchDir, ".openmemory", "project-state.json")), "State file STILL EXISTS");
  console.log("[PASSED] TEST 5: Integration Uninstallation\n");

  console.log("=================================================");
  console.log("   All F14 Installer & Adapters Tests PASSED!   ");
  console.log("=================================================\n");
}

runInstallerAdaptersTests().catch((err) => {
  console.error("F14 Installer Adapters Test Failed:", err);
  process.exit(1);
});
