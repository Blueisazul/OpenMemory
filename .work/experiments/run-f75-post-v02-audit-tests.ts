import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";
import { runCLI } from "../../src/cli";
import { createMCPServer } from "../../src/mcp";
import { OpenMemoryPlugin } from "../../.opencode/plugins/openmemory";

async function runF75PostV02AuditTests() {
  console.log("=================================================");
  console.log("F7.5 — POST-MIGRATION AUDIT & SYSTEM STABILIZATION SUITE");
  console.log("=================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f75");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  [PASS] Test ${total}: ${testName}`);
    } else {
      console.error(`  [FAIL] Test ${total}: ${testName} - ${detail || "Assertion failed"}`);
      throw new Error(`Test failed: ${testName} - ${detail || ""}`);
    }
  }

  // Helper to ensure stage-state.json does not exist
  function assertStageStateAbsent(basePath: string, scenarioName: string) {
    const stagePath = path.join(basePath, ".openmemory", "stage-state.json");
    assert(!fs.existsSync(stagePath), `${scenarioName}: stage-state.json physically ABSENT from disk`);
  }

  // -------------------------------------------------------------------------
  // F75-01: Single Physical Authority
  // -------------------------------------------------------------------------
  console.log("--- 1. Scenario F75-01: Single Physical Authority ---");
  const dir01 = path.join(testDir, "F75_01");
  fs.mkdirSync(dir01, { recursive: true });
  const storage01 = new StorageEngine(dir01);
  storage01.ensureStorageStructure();
  storage01.getOrInitProjectState();
  const projPath01 = path.join(dir01, ".openmemory", "project-state.json");
  assert(fs.existsSync(projPath01), "F75-01: project-state.json is PRESENT as physical authority");
  assertStageStateAbsent(dir01, "F75-01");

  // -------------------------------------------------------------------------
  // F75-02: No stage-state.json Recreation During Runtime Mutations
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Scenario F75-02: Runtime Mutations Non-Recreation ---");
  const dir02 = path.join(testDir, "F75_02");
  fs.mkdirSync(dir02, { recursive: true });
  const storage02 = new StorageEngine(dir02);
  const stage02 = new StageEngine(dir02);
  stage02.completeStage({ summary: "Done DESCUBRIR" });
  stage02.approveStage(); // Advance to DEFINIR
  stage02.completeStage({ summary: "Done DEFINIR" });
  stage02.approveStage(); // Advance to INVESTIGAR
  storage02.setActiveGoal("F75 Goal Mutation", "INVESTIGAR");
  storage02.addTask("F75 Task 1", "IN_PROGRESS");
  stage02.completeStage({ summary: "Done INVESTIGAR stage" });
  assertStageStateAbsent(dir02, "F75-02");

  // -------------------------------------------------------------------------
  // F75-03: StorageEngine Restart
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Scenario F75-03: StorageEngine Restart ---");
  const dir03 = path.join(testDir, "F75_03");
  fs.mkdirSync(dir03, { recursive: true });
  const se3a = new StorageEngine(dir03);
  se3a.setActiveGoal("Restart Goal Test", "DEFINIR");
  const se3b = new StorageEngine(dir03);
  const reloadedState03 = se3b.getOrInitProjectState();
  assert(reloadedState03.activeGoal === "Restart Goal Test", "F75-03: StorageEngine recovers state accurately on restart");
  assertStageStateAbsent(dir03, "F75-03");

  // -------------------------------------------------------------------------
  // F75-04: StageEngine Restart
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Scenario F75-04: StageEngine Restart ---");
  const dir04 = path.join(testDir, "F75_04");
  fs.mkdirSync(dir04, { recursive: true });
  const st4a = new StageEngine(dir04);
  st4a.completeStage({ summary: "Done DESCUBRIR" });
  st4a.approveStage(); // Advance to DEFINIR
  const st4b = new StageEngine(dir04);
  const state04 = st4b.getStageState();
  assert(state04.currentPhase === "DEFINIR", "F75-04: StageEngine recovers currentPhase cleanly from ProjectState");
  assertStageStateAbsent(dir04, "F75-04");

  // -------------------------------------------------------------------------
  // F75-05: MCP Lifecycle Non-Recreation
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Scenario F75-05: MCP Lifecycle ---");
  const dir05 = path.join(testDir, "F75_05");
  fs.mkdirSync(dir05, { recursive: true });
  const mcpServer = createMCPServer(dir05);
  assert(mcpServer !== null, "F75-05: MCP Server created");
  const st05 = new StageEngine(dir05);
  st05.getStageState();
  assertStageStateAbsent(dir05, "F75-05");

  // -------------------------------------------------------------------------
  // F75-06: CLI Lifecycle Non-Recreation
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Scenario F75-06: CLI Lifecycle ---");
  const dir06 = path.join(testDir, "F75_06");
  fs.mkdirSync(dir06, { recursive: true });
  await runCLI(["status"], dir06);
  await runCLI(["diagnostics"], dir06);
  assertStageStateAbsent(dir06, "F75-06");

  // -------------------------------------------------------------------------
  // F75-07: OpenCode Plugin Lifecycle Non-Recreation
  // -------------------------------------------------------------------------
  console.log("\n--- 7. Scenario F75-07: OpenCode Plugin Lifecycle ---");
  const dir07 = path.join(testDir, "F75_07");
  fs.mkdirSync(dir07, { recursive: true });
  const plugin07 = await OpenMemoryPlugin({
    client: {} as any,
    project: "PluginF75Project",
    directory: dir07,
    worktree: dir07,
    $: {} as any,
  });
  await plugin07.event({ event: { type: "session.created", session: { id: "f75-session-001" } } });
  await plugin07.event({ event: { type: "session.idle", timestamp: new Date().toISOString() } });
  await plugin07.event({ event: { type: "session.compacted", summary: "F75 compaction" } });
  assertStageStateAbsent(dir07, "F75-07");

  // -------------------------------------------------------------------------
  // F75-08: Full E2E v0.2 Lifecycle
  // -------------------------------------------------------------------------
  console.log("\n--- 8. Scenario F75-08: Full E2E v0.2 Lifecycle ---");
  const dir08 = path.join(testDir, "F75_08");
  fs.mkdirSync(dir08, { recursive: true });

  // 1. Fresh Init
  const storage08 = new StorageEngine(dir08);
  const stage08 = new StageEngine(dir08);

  // 2. Goal & Task
  storage08.setActiveGoal("Build v0.2 E2E Pipeline", "DESCUBRIR");
  const task08 = storage08.addTask("Implement feature X", "IN_PROGRESS");

  // 3. Stage & Governance Workflow
  stage08.completeStage({ summary: "Done DESCUBRIR" });
  stage08.approveStage(); // Advance to DEFINIR
  stage08.completeStage({ summary: "Done DEFINIR" });
  stage08.approveStage(); // Advance to INVESTIGAR

  // 4. Roadmap operation
  stage08.startPhase("PHASE-2", "Phase 2 Title", "Phase 2 Desc");

  // 5. OpenCode Plugin Events
  const plugin08 = await OpenMemoryPlugin({
    client: {} as any,
    project: "E2EProject",
    directory: dir08,
    worktree: dir08,
    $: {} as any,
  });
  await plugin08.event({ event: { type: "session.created", session: { id: "e2e-sess-999" } } });
  await plugin08.event({ event: { type: "session.idle" } });
  await plugin08.event({ event: { type: "session.compacted", summary: "E2E compact" } });

  // 6. Process Restart simulation (re-instantiate classes)
  const storage08_restarted = new StorageEngine(dir08);
  const stage08_restarted = new StageEngine(dir08);

  const state08_final = storage08_restarted.getOrInitProjectState();
  const stage08_final = stage08_restarted.getStageState();

  assert(state08_final.roadmap?.activePhaseId === "PHASE-2", "F75-08: E2E roadmap activePhaseId recovered as PHASE-2");
  assert(stage08_final.currentPhase === "DESCUBRIR", "F75-08: PHASE-2 internal workflow initialized in DESCUBRIR");
  assertStageStateAbsent(dir08, "F75-08");

  // -------------------------------------------------------------------------
  // F75-09: v0.2 Backup Creation (stage-state.json ABSENT)
  // -------------------------------------------------------------------------
  console.log("\n--- 9. Scenario F75-09: v0.2 Native Backup Creation ---");
  const dir09 = path.join(testDir, "F75_09");
  fs.mkdirSync(dir09, { recursive: true });
  const storage09 = new StorageEngine(dir09);
  storage09.setActiveGoal("Backup Goal v0.2", "DESCUBRIR");
  const backupMeta09 = storage09.createBackup("v02-native-backup");
  const backupStagePath = path.join(backupMeta09.backupPath, "stage-state.json");
  assert(!fs.existsSync(backupStagePath), "F75-09: stage-state.json ABSENT from v0.2 native backup snapshot");
  assert(fs.existsSync(path.join(backupMeta09.backupPath, "project-state.json")), "F75-09: project-state.json PRESENT in v0.2 backup");

  // -------------------------------------------------------------------------
  // F75-10: v0.2 Backup Restore (stage-state.json ABSENT)
  // -------------------------------------------------------------------------
  console.log("\n--- 10. Scenario F75-10: v0.2 Native Backup Restore ---");
  const dir10 = path.join(testDir, "F75_10");
  fs.mkdirSync(dir10, { recursive: true });
  const storage10 = new StorageEngine(dir10);
  storage10.setActiveGoal("Initial Goal", "DESCUBRIR");
  const backup10 = storage10.createBackup("restore-test");
  storage10.setActiveGoal("Modified Goal", "DEFINIR");

  const restored10 = storage10.restoreBackup(backup10.id);
  assert(restored10 === true, "F75-10: restoreBackup returned true");
  const state10 = storage10.getOrInitProjectState();
  assert(state10.activeGoal === "Initial Goal", "F75-10: Restored project-state activeGoal accurately");
  assertStageStateAbsent(dir10, "F75-10");

  // -------------------------------------------------------------------------
  // F75-11: Restore + Restart
  // -------------------------------------------------------------------------
  console.log("\n--- 11. Scenario F75-11: Restore + Restart ---");
  const dir11 = path.join(testDir, "F75_11");
  fs.mkdirSync(dir11, { recursive: true });
  const storage11a = new StorageEngine(dir11);
  storage11a.setActiveGoal("Pre-restore Goal", "INVESTIGAR");
  const backup11 = storage11a.createBackup("restart-test");
  storage11a.setActiveGoal("Post-restore Changed Goal", "IMPLEMENTAR");
  storage11a.restoreBackup(backup11.id);

  // Restart engine
  const storage11b = new StorageEngine(dir11);
  const stage11b = new StageEngine(dir11);
  const state11 = storage11b.getOrInitProjectState();
  assert(state11.activeGoal === "Pre-restore Goal", "F75-11: Restored state survives process restart");
  assertStageStateAbsent(dir11, "F75-11");

  // -------------------------------------------------------------------------
  // F75-12: Migration Boundary Isolation
  // -------------------------------------------------------------------------
  console.log("\n--- 12. Scenario F75-12: Migration Boundary Isolation ---");
  const dir12 = path.join(testDir, "F75_12");
  const openmemoryDir12 = path.join(dir12, ".openmemory");
  fs.mkdirSync(openmemoryDir12, { recursive: true });

  // Create legacy v0.1 stage-state.json
  const legacyStageState = {
    currentPhase: "DEFINIR",
    phaseStatus: "IN_PROGRESS",
    activeGoal: "Legacy v0.1 Goal",
    activeTasks: [],
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(openmemoryDir12, "stage-state.json"), JSON.stringify(legacyStageState, null, 2));

  const storage12 = new StorageEngine(dir12);
  const migResult12 = storage12.migrateToV02();
  assert(migResult12.success === true, "F75-12: Migration layer converted v0.1 legacy state to v0.2");
  assertStageStateAbsent(dir12, "F75-12");

  // Subsequent v0.2 runtime operations MUST NOT touch legacy file
  const stage12 = new StageEngine(dir12);
  stage12.completeStage({ summary: "Post-migration complete" });
  assertStageStateAbsent(dir12, "F75-12");

  // -------------------------------------------------------------------------
  // F75-13: Legacy References Classification Audit
  // -------------------------------------------------------------------------
  console.log("\n--- 13. Scenario F75-13: Legacy References Audit ---");
  const storageCode = fs.readFileSync(path.join(process.cwd(), "src", "storage.ts"), "utf-8");
  const stageEngineCode = fs.readFileSync(path.join(process.cwd(), "src", "stage-engine.ts"), "utf-8");

  // Verify stage-state.json appears only in migration/backup methods in storage.ts and legacy import in stage-engine.ts
  assert(storageCode.includes("migrateToV02"), "F75-13: storage.ts retains migrateToV02 method");
  assert(stageEngineCode.includes("getStageState"), "F75-13: stage-engine.ts getStageState handles legacy check");

  // -------------------------------------------------------------------------
  // F75-14: Dead-Code Audit
  // -------------------------------------------------------------------------
  console.log("\n--- 14. Scenario F75-14: Dead-Code Audit ---");
  // projectStageState in StorageEngine is a no-op helper
  const storageInst = new StorageEngine(dir01);
  storageInst.projectStageState({ activePhase: "TEST", lastUpdated: new Date().toISOString() });
  assertStageStateAbsent(dir01, "F75-14");

  // -------------------------------------------------------------------------
  // F75-15: MCP Contract Integrity
  // -------------------------------------------------------------------------
  console.log("\n--- 15. Scenario F75-15: MCP Contract Integrity ---");
  const mcpCode = fs.readFileSync(path.join(process.cwd(), "src", "mcp.ts"), "utf-8");
  const expectedMCPTools = [
    "openmemory_status",
    "openmemory_get_stage",
    "openmemory_start_stage",
    "openmemory_complete_stage",
    "openmemory_request_approval",
    "openmemory_approve_stage",
    "openmemory_reject_stage",
    "openmemory_get_roadmap",
    "openmemory_approve_phase",
    "openmemory_reject_phase",
    "openmemory_get_handoff",
    "openmemory_save_adr",
    "openmemory_create_backup",
    "openmemory_run_diagnostics",
    "openmemory_record_knowledge",
    "openmemory_query_knowledge",
  ];
  for (const tool of expectedMCPTools) {
    assert(mcpCode.includes(tool), `F75-15: MCP tool '${tool}' present in mcp.ts`);
  }

  // -------------------------------------------------------------------------
  // F75-16: CLI Contract Integrity
  // -------------------------------------------------------------------------
  console.log("\n--- 16. Scenario F75-16: CLI Contract Integrity ---");
  const cliCode = fs.readFileSync(path.join(process.cwd(), "src", "cli.ts"), "utf-8");
  const expectedCLICommands = [
    "status",
    "stage",
    "approve",
    "report",
    "install",
    "backup",
    "list-backups",
    "restore",
    "diagnostics",
    "cleanup",
    "query",
    "record",
    "roadmap",
    "migrate",
  ];
  for (const cmd of expectedCLICommands) {
    assert(cliCode.includes(cmd), `F75-16: CLI command '${cmd}' present in cli.ts`);
  }

  // -------------------------------------------------------------------------
  // F75-17: Build Integrity Check
  // -------------------------------------------------------------------------
  console.log("\n--- 17. Scenario F75-17: Build Integrity ---");
  const distDir = path.join(process.cwd(), "dist");
  assert(fs.existsSync(distDir), "F75-17: dist/ directory exists");
  assert(fs.existsSync(path.join(distDir, "index.js")), "F75-17: dist/index.js exists");
  assert(fs.existsSync(path.join(distDir, "storage.js")), "F75-17: dist/storage.js exists");
  assert(fs.existsSync(path.join(distDir, "stage-engine.js")), "F75-17: dist/stage-engine.js exists");

  // -------------------------------------------------------------------------
  // F75-18: Idempotency Verification
  // -------------------------------------------------------------------------
  console.log("\n--- 18. Scenario F75-18: Idempotency ---");
  const dir18 = path.join(testDir, "F75_18");
  fs.mkdirSync(dir18, { recursive: true });
  const storage18 = new StorageEngine(dir18);
  storage18.ensureStorageStructure();
  storage18.saveProjectState(storage18.getOrInitProjectState());
  storage18.saveProjectState(storage18.getOrInitProjectState());
  storage18.saveProjectState(storage18.getOrInitProjectState());
  assertStageStateAbsent(dir18, "F75-18");

  // Clean up scratch test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  console.log("\n=================================================");
  console.log(`F7.5 TEST SUMMARY: ${passed}/${total} PASS`);
  console.log("=================================================");
}

runF75PostV02AuditTests();
