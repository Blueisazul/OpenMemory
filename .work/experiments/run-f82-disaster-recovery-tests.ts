import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";
import { runCLI } from "../../src/cli";
import { createMCPServer } from "../../src/mcp";
import { OpenMemoryPlugin } from "../../.opencode/plugins/openmemory";

async function runF82DisasterRecoveryTests() {
  console.log("=================================================");
  console.log("F8.2 — MULTI-SESSION DISASTER RECOVERY & BACKUP SYNCHRONIZATION SUITE");
  console.log("=================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f82");
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
      console.log(`  ✓ [PASS] ${testName}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // F82-01: Native v0.2 Backup Creation & Snapshot Integrity
    // -------------------------------------------------------------
    console.log("Scenario F82-01: Native v0.2 Backup Creation & Snapshot Integrity");
    const storage1 = new StorageEngine(testDir);
    storage1.ensureStorageStructure();
    
    // Simulate initial state
    const projState1 = storage1.getOrInitProjectState();
    projState1.sessionRunCount = 5;
    projState1.currentStatus = "IN_PROGRESS";
    projState1.activeGoal = "Test Disaster Recovery Engine";
    storage1.saveProjectState(projState1);

    // Add developer notes to handoff.md
    const handoffPath = path.join(testDir, ".openmemory", "handoff.md");
    const customHandoffContent = `# OPENMEMORY HANDOFF & CONTINUITY SNAPSHOT

## Executive Summary
Session active and operational.

## Key Architectural Decisions
- Decision ADR-010: Physical single-file authority in project-state.json.

## Developer Notes
- Custom developer notes preserved verbatim during disaster recovery test.
`;
    fs.writeFileSync(handoffPath, customHandoffContent, "utf-8");

    // Create native v0.2 backup
    const backupObj = storage1.createBackup("F8.2 Disaster Recovery Backup Test");
    const backupId = backupObj.id;
    assert(typeof backupId === "string" && backupId.length > 0, "F82-01a: Backup ID generated successfully");

    const backups = storage1.listBackups();
    assert(backups.length === 1 && backups[0].id === backupId, "F82-01b: Backup registered in manifests list");

    const backupDir = path.join(testDir, ".openmemory", "backups", backupId);
    assert(fs.existsSync(backupDir), "F82-01c: Backup directory exists on disk");
    assert(fs.existsSync(path.join(backupDir, "project-state.json")), "F82-01d: project-state.json present in backup");
    assert(!fs.existsSync(path.join(backupDir, "stage-state.json")), "F82-01e: stage-state.json ABSENT from backup snapshot");

    // -------------------------------------------------------------
    // F82-02: Atomic Restore of Native v0.2 Backup & State Integrity
    // -------------------------------------------------------------
    console.log("\nScenario F82-02: Atomic Restore of Native v0.2 Backup");
    
    // Mutate state to simulate drift/changes post-backup
    projState1.sessionRunCount = 99;
    projState1.activeGoal = "Mutated Goal Post Backup";
    storage1.saveProjectState(projState1);

    // Restore backup
    const restoreResult = storage1.restoreBackup(backupId);
    assert(restoreResult === true, "F82-02a: Backup restore operation returned boolean true");

    const restoredState = storage1.getOrInitProjectState();
    assert(restoredState.sessionRunCount === 5, "F82-02b: sessionRunCount accurately restored to 5");
    assert(restoredState.activeGoal === "Test Disaster Recovery Engine", "F82-02c: activeGoal accurately restored");

    const legacyStagePath = path.join(testDir, ".openmemory", "stage-state.json");
    assert(!fs.existsSync(legacyStagePath), "F82-02d: stage-state.json remains ABSENT post-restore");

    // -------------------------------------------------------------
    // F82-03: Preservation of Developer Notes & Handoff Ceiling Post-Restore
    // -------------------------------------------------------------
    console.log("\nScenario F82-03: Handoff Notes Preservation Post-Restore");
    const restoredHandoff = fs.readFileSync(handoffPath, "utf-8");
    assert(restoredHandoff.includes("## Key Architectural Decisions"), "F82-03a: Key Architectural Decisions preserved post-restore");
    assert(restoredHandoff.includes("## Developer Notes"), "F82-03b: Developer Notes preserved post-restore");
    assert(restoredHandoff.includes("Custom developer notes preserved verbatim"), "F82-03c: Developer text verbatim post-restore");

    // -------------------------------------------------------------
    // F82-04: Disaster Recovery from Corruption / Missing project-state.json
    // -------------------------------------------------------------
    console.log("\nScenario F82-04: Recovery from Corrupted / Missing State File");
    const projStatePath = path.join(testDir, ".openmemory", "project-state.json");
    
    // Corrupt project-state.json intentionally
    fs.writeFileSync(projStatePath, "{ INVALID JSON DATA ... Corrupt", "utf-8");

    // Re-initialize StorageEngine and verify recovery gracefully
    const storageCorrupt = new StorageEngine(testDir);
    const recoveredState = storageCorrupt.getOrInitProjectState();
    assert(recoveredState !== null, "F82-04a: StorageEngine recovered gracefully from corrupted file");
    assert(recoveredState.currentStatus !== undefined, "F82-04b: Recovered state has valid schema");
    assert(!fs.existsSync(legacyStagePath), "F82-04c: stage-state.json NOT created during corruption recovery");

    // -------------------------------------------------------------
    // F82-05: Structured Event Log Accumulation Across Backup & Restore
    // -------------------------------------------------------------
    console.log("\nScenario F82-05: Structured Event Log Accumulation");
    const pluginInstance = await OpenMemoryPlugin({
      directory: testDir,
      worktree: testDir,
      client: {} as any,
      project: "F82DisasterProject",
      $: {} as any,
    });
    
    await pluginInstance.event({ event: { type: "session.created", properties: { info: { id: "session-f82-1" } } } });
    await pluginInstance.event({ event: { type: "session.idle", properties: { sessionID: "session-f82-1" } } });

    const logPath = path.join(testDir, ".openmemory", "logs", "events.jsonl");
    assert(fs.existsSync(logPath), "F82-05a: Events log file exists");
    
    const logContent = fs.readFileSync(logPath, "utf-8");
    const logLines = logContent.trim().split("\n").filter((l) => l.trim().length > 0);
    assert(logLines.length >= 2, "F82-05b: Event lines accumulated in events.jsonl");
    assert(logContent.includes("session.created") && logContent.includes("session.idle"), "F82-05c: Event types logged correctly");

    // -------------------------------------------------------------
    // F82-06: Legacy v0.1 Workspace Migration & Import
    // -------------------------------------------------------------
    console.log("\nScenario F82-06: Legacy v0.1 Workspace Migration & Import");
    const legacyWorkspaceDir = path.join(testDir, "legacy_ws");
    const legacyOpenMemoryDir = path.join(legacyWorkspaceDir, ".openmemory");
    fs.mkdirSync(legacyOpenMemoryDir, { recursive: true });

    // Populate legacy workspace with v0.1 stage-state.json & manifest
    fs.writeFileSync(path.join(legacyOpenMemoryDir, "openmemory.json"), JSON.stringify({ name: "legacy", version: "0.1.0" }), "utf-8");
    fs.writeFileSync(path.join(legacyOpenMemoryDir, "stage-state.json"), JSON.stringify({
      projectName: "Legacy Project",
      currentPhase: "IMPLEMENTAR",
      phaseStatus: "IN_PROGRESS",
      activeGoal: "Legacy v0.1 Goal",
      activeTasks: [{ id: "LEG-1", description: "Legacy Task", status: "COMPLETED" }],
      definitionOfDone: [],
      phaseReport: null,
      approvalRequired: false,
      approvalReceived: true,
      nextPhase: "VALIDAR",
      lastSessionId: "leg-sess",
      lastUpdated: new Date().toISOString(),
    }), "utf-8");

    const storageLegacy = new StorageEngine(legacyWorkspaceDir);
    const migrationResult = storageLegacy.migrateToV02();
    assert(migrationResult.success, "F82-06a: Migration layer processed legacy workspace gracefully");
    assert(!fs.existsSync(path.join(legacyOpenMemoryDir, "stage-state.json")), "F82-06b: stage-state.json removed from active workspace post-migration");
    assert(fs.existsSync(path.join(legacyOpenMemoryDir, "project-state.json")), "F82-06c: project-state.json created as canonical authority");

    // -------------------------------------------------------------
    // F82-07: CLI Backup & Restore Verification
    // -------------------------------------------------------------
    console.log("\nScenario F82-07: CLI Contract Backup & Restore Commands");
    const backupCliOutput = await runCLI(["backup"], testDir);
    assert(backupCliOutput.includes("Backup created successfully"), "F82-07a: CLI openmemory backup output contains success message");

    const listCliOutput = await runCLI(["list-backups"], testDir);
    assert(listCliOutput.includes("Available Backups") || listCliOutput.includes("backup-"), "F82-07b: CLI list-backups formatted list");

    // -------------------------------------------------------------
    // F82-08: Zero-Write Regression Guard
    // -------------------------------------------------------------
    console.log("\nScenario F82-08: Zero-Write Regression Guard (Single Writer Invariant)");
    const storageCode = fs.readFileSync(path.join(process.cwd(), "src", "storage.ts"), "utf-8");
    const stageEngineCode = fs.readFileSync(path.join(process.cwd(), "src", "stage-engine.ts"), "utf-8");

    // Ensure StageEngine does not invoke fs.writeFileSync on stage-state.json
    const directStageWrites = (stageEngineCode.match(/writeFileSync\([^)]*stage-state\.json/g) || []).length;
    assert(directStageWrites === 0, "F82-08a: StageEngine has ZERO direct writes to stage-state.json");

    assert(!fs.existsSync(legacyStagePath), "F82-08b: Active workspace has ZERO stage-state.json file");

    console.log("\n=================================================");
    console.log(`F8.2 TEST SUMMARY: ${passed}/${total} ASSERTIONS PASSED`);
    console.log("=================================================\n");

    if (passed !== total) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("F8.2 Test Suite Execution Error:", err);
    process.exit(1);
  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

runF82DisasterRecoveryTests();
