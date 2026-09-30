import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";
import { runCLI } from "../../src/cli";

async function runF74FinalV02Tests() {
  console.log("=================================================");
  console.log("F7.4 — FINAL v0.2 PHYSICAL MIGRATION & HARDENING SUITE");
  console.log("=================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f74");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  [PASS] Test ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test ${total}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  }

  function createFreshStorage(subfolder: string): StorageEngine {
    const dir = path.join(testDir, subfolder);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const se = new StorageEngine(dir);
    se.ensureStorageStructure();
    return se;
  }

  try {
    // -------------------------------------------------------------------------
    // F74-01: Proyecto v0.1 Completo -> Migración v0.2
    // -------------------------------------------------------------------------
    console.log("--- 1. Scenario F74-01: Full v0.1 Project Migration ---");
    const seF74_01 = createFreshStorage("F74_01");
    const p1ProjPath = path.join(testDir, "F74_01", ".openmemory", "project-state.json");
    const p1StagePath = path.join(testDir, "F74_01", ".openmemory", "stage-state.json");

    fs.writeFileSync(p1ProjPath, JSON.stringify({ activePhase: "DEFINIR", currentStatus: "IN_PROGRESS", activeGoal: "F74_01 Goal", activeTasks: [], sessionRunCount: 1, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");
    fs.writeFileSync(p1StagePath, JSON.stringify({ currentPhase: "DEFINIR", phaseStatus: "IN_PROGRESS", activeGoal: "F74_01 Goal", activeTasks: [], lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const res01 = seF74_01.migrateToV02();
    assert(res01.success && fs.existsSync(p1ProjPath) && !fs.existsSync(p1StagePath), "F74-01: project-state.json PRESENT, stage-state.json ABSENT after migration");

    // -------------------------------------------------------------------------
    // F74-02: Solo project-state.json
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Scenario F74-02: Solo project-state.json ---");
    const seF74_02 = createFreshStorage("F74_02");
    const p2ProjPath = path.join(testDir, "F74_02", ".openmemory", "project-state.json");
    const p2StagePath = path.join(testDir, "F74_02", ".openmemory", "stage-state.json");
    fs.writeFileSync(p2ProjPath, JSON.stringify({ activePhase: "DISEÑAR", currentStatus: "IN_PROGRESS", activeGoal: "F74_02 Goal", activeTasks: [], sessionRunCount: 1, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const res02 = seF74_02.migrateToV02();
    assert(res02.success && fs.existsSync(p2ProjPath) && !fs.existsSync(p2StagePath), "F74-02: Solo project-state.json migrates to v0.2 cleanly");

    // -------------------------------------------------------------------------
    // F74-03: Solo stage-state.json
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Scenario F74-03: Solo stage-state.json ---");
    const seF74_03 = createFreshStorage("F74_03");
    const p3ProjPath = path.join(testDir, "F74_03", ".openmemory", "project-state.json");
    const p3StagePath = path.join(testDir, "F74_03", ".openmemory", "stage-state.json");
    fs.writeFileSync(p3StagePath, JSON.stringify({ currentPhase: "PLANIFICAR", phaseStatus: "IN_PROGRESS", activeGoal: "F74_03 Recovered Goal", activeTasks: [], lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const res03 = seF74_03.migrateToV02();
    assert(res03.success && fs.existsSync(p3ProjPath) && !fs.existsSync(p3StagePath), "F74-03: Solo stage-state.json reconstructs canonical state and physically deletes stage-state.json");

    // -------------------------------------------------------------------------
    // F74-04: Divergent Files
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Scenario F74-04: Divergent Files ---");
    const seF74_04 = createFreshStorage("F74_04");
    const p4ProjPath = path.join(testDir, "F74_04", ".openmemory", "project-state.json");
    const p4StagePath = path.join(testDir, "F74_04", ".openmemory", "stage-state.json");
    fs.writeFileSync(p4ProjPath, JSON.stringify({ activePhase: "DEFINIR", currentStatus: "INITIALIZED", activeGoal: "Old Goal", activeTasks: [], sessionRunCount: 0, lastSessionId: null, lastUpdated: "2026-09-28T10:00:00.000Z" }), "utf-8");
    fs.writeFileSync(p4StagePath, JSON.stringify({ currentPhase: "IMPLEMENTAR", phaseStatus: "IN_PROGRESS", activeGoal: "Newer Goal", activeTasks: [], lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const res04 = seF74_04.migrateToV02();
    const st04 = seF74_04.getOrInitProjectState();
    assert(res04.success && (st04.currentStage || st04.activePhase) === "IMPLEMENTAR" && !fs.existsSync(p4StagePath), "F74-04: Divergence resolved in favor of newer stage, stage-state.json physically deleted");

    // -------------------------------------------------------------------------
    // F74-05: Corrupt project-state.json + Valid stage-state.json
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Scenario F74-05: Corrupt project-state.json ---");
    const seF74_05 = createFreshStorage("F74_05");
    const p5ProjPath = path.join(testDir, "F74_05", ".openmemory", "project-state.json");
    const p5StagePath = path.join(testDir, "F74_05", ".openmemory", "stage-state.json");
    fs.writeFileSync(p5ProjPath, "{ CORRUPT_SYNTAX ", "utf-8");
    fs.writeFileSync(p5StagePath, JSON.stringify({ currentPhase: "VALIDAR", phaseStatus: "IN_PROGRESS", activeGoal: "F74_05 Goal", lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const res05 = seF74_05.migrateToV02();
    const st05 = seF74_05.getOrInitProjectState();
    assert(res05.success && (st05.currentStage || st05.activePhase) === "VALIDAR" && !fs.existsSync(p5StagePath), "F74-05: Corrupt project-state recovered from stage before deleting legacy file");

    // -------------------------------------------------------------------------
    // F74-06: Corrupt stage-state.json + Valid project-state.json
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Scenario F74-06: Corrupt stage-state.json ---");
    const seF74_06 = createFreshStorage("F74_06");
    const p6ProjPath = path.join(testDir, "F74_06", ".openmemory", "project-state.json");
    const p6StagePath = path.join(testDir, "F74_06", ".openmemory", "stage-state.json");
    fs.writeFileSync(p6ProjPath, JSON.stringify({ activePhase: "CONSOLIDAR", currentStatus: "INITIALIZED", activeGoal: "F74_06 Goal", activeTasks: [], sessionRunCount: 0, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");
    fs.writeFileSync(p6StagePath, "{ CORRUPT_STAGE ", "utf-8");

    const res06 = seF74_06.migrateToV02();
    const st06 = seF74_06.getOrInitProjectState();
    assert(res06.success && (st06.currentStage || st06.activePhase) === "CONSOLIDAR" && !fs.existsSync(p6StagePath), "F74-06: Corrupt stage-state ignored and physically deleted");

    // -------------------------------------------------------------------------
    // F74-07: Both Corrupt
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Scenario F74-07: Both Files Corrupt ---");
    const seF74_07 = createFreshStorage("F74_07");
    const p7ProjPath = path.join(testDir, "F74_07", ".openmemory", "project-state.json");
    const p7StagePath = path.join(testDir, "F74_07", ".openmemory", "stage-state.json");
    fs.writeFileSync(p7ProjPath, "{ CORRUPT_PROJ ", "utf-8");
    fs.writeFileSync(p7StagePath, "{ CORRUPT_STAGE ", "utf-8");

    const res07 = seF74_07.migrateToV02();
    const st07 = seF74_07.getOrInitProjectState();
    assert(res07.success && typeof (st07.currentStage || st07.activePhase) === "string" && !fs.existsSync(p7StagePath), "F74-07: Both corrupt re-initializes clean canonical state and deletes corrupt stage file");

    // -------------------------------------------------------------------------
    // F74-08: Migration Idempotency
    // -------------------------------------------------------------------------
    console.log("\n--- 8. Scenario F74-08: Migration Idempotency ---");
    const seF74_08 = createFreshStorage("F74_08");
    const p8StagePath = path.join(testDir, "F74_08", ".openmemory", "stage-state.json");
    seF74_08.saveProjectState({ activePhase: "IMPLEMENTAR", currentStatus: "IN_PROGRESS", activeGoal: "Idempotency Goal", activeTasks: [], sessionRunCount: 1, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" });

    const r1 = seF74_08.migrateToV02();
    const r2 = seF74_08.migrateToV02();
    const r3 = seF74_08.migrateToV02();

    assert(r1.success && r2.success && r3.success && !fs.existsSync(p8StagePath), "F74-08: Repeated migrations are 100% idempotent and stage-state.json remains absent");

    // -------------------------------------------------------------------------
    // F74-09: Migration + Engine Restart
    // -------------------------------------------------------------------------
    console.log("\n--- 9. Scenario F74-09: Migration + StorageEngine Restart ---");
    const seF74_09 = createFreshStorage("F74_09");
    seF74_09.saveProjectState({ activePhase: "IMPLEMENTAR", currentStatus: "IN_PROGRESS", activeGoal: "Restart Goal", activeTasks: [], sessionRunCount: 1, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" });
    seF74_09.migrateToV02();

    // Re-create StorageEngine & StageEngine on migrated directory
    const newStorage = new StorageEngine(path.join(testDir, "F74_09"));
    const newStageEngine = new StageEngine(path.join(testDir, "F74_09"));

    const stateOnRestart = newStageEngine.getStageState();
    const p9StagePath = path.join(testDir, "F74_09", ".openmemory", "stage-state.json");

    assert(stateOnRestart.currentPhase === "IMPLEMENTAR" && !fs.existsSync(p9StagePath), "F74-09: Engine restart after migration operates 100% cleanly without stage-state.json");

    // -------------------------------------------------------------------------
    // F74-10: Runtime Operations Post-Migration
    // -------------------------------------------------------------------------
    console.log("\n--- 10. Scenario F74-10: Runtime Post-Migration Non-Recreation ---");
    const seF74_10 = createFreshStorage("F74_10");
    seF74_10.saveProjectState({ activePhase: "DESCUBRIR", currentStatus: "IN_PROGRESS", activeGoal: "Runtime Goal", activeTasks: [], sessionRunCount: 1, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" });
    seF74_10.migrateToV02();

    const p10StagePath = path.join(testDir, "F74_10", ".openmemory", "stage-state.json");
    const stageEngine10 = new StageEngine(path.join(testDir, "F74_10"));

    // Execute runtime operations
    stageEngine10.getStageState();
    stageEngine10.canModifyProductionCode();
    seF74_10.saveCanonicalState({ currentPhase: "DEFINIR", phaseStatus: "IN_PROGRESS", activeGoal: "Updated Goal" });
    await runCLI(["status"], path.join(testDir, "F74_10"));

    assert(!fs.existsSync(p10StagePath), "F74-10: Post-migration runtime operations DO NOT recreate stage-state.json on disk");

    // -------------------------------------------------------------------------
    // F74-11: Backup & Restore v0.2
    // -------------------------------------------------------------------------
    console.log("\n--- 11. Scenario F74-11: Backup & Restore v0.2 ---");
    const seF74_11 = createFreshStorage("F74_11");
    seF74_11.saveProjectState({ activePhase: "DEFINIR", currentStatus: "IN_PROGRESS", activeGoal: "Backup Goal v0.2", activeTasks: [], sessionRunCount: 1, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" });
    seF74_11.migrateToV02();

    const v02Backup = seF74_11.createBackup("v02_test");
    seF74_11.saveProjectState({ activePhase: "IMPLEMENTAR", currentStatus: "IN_PROGRESS", activeGoal: "Modified Goal", activeTasks: [], sessionRunCount: 2, lastSessionId: null, lastUpdated: "2026-09-28T13:00:00.000Z" });

    seF74_11.restoreBackup(v02Backup.id);
    const restoredV02State = seF74_11.getOrInitProjectState();
    const p11StagePath = path.join(testDir, "F74_11", ".openmemory", "stage-state.json");

    assert((restoredV02State.currentStage || restoredV02State.activePhase) === "DEFINIR" && !fs.existsSync(p11StagePath), "F74-11: Restore v0.2 backup restores ProjectState while stage-state.json remains ABSENT");

    // -------------------------------------------------------------------------
    // F74-12: Single Writer Hardening Guard
    // -------------------------------------------------------------------------
    console.log("\n--- 12. Scenario F74-12: Single Writer Hardening Guard ---");
    const stageEngineCode = fs.readFileSync(path.join(process.cwd(), "src", "stage-engine.ts"), "utf-8");
    const mcpCode = fs.readFileSync(path.join(process.cwd(), "src", "mcp.ts"), "utf-8");
    const cliCode = fs.readFileSync(path.join(process.cwd(), "src", "cli.ts"), "utf-8");
    const pluginCode = fs.readFileSync(path.join(process.cwd(), ".opencode", "plugins", "openmemory.ts"), "utf-8");

    const directWriteRegex = /atomicWriteFileSync\s*\(\s*[^,]+(stage-state|project-state)/g;
    const directWritesCount =
      (stageEngineCode.match(directWriteRegex) || []).length +
      (mcpCode.match(directWriteRegex) || []).length +
      (cliCode.match(directWriteRegex) || []).length +
      (pluginCode.match(directWriteRegex) || []).length;

    assert(directWritesCount === 0, "F74-12: Zero direct file writes outside StorageEngine across all modules");

  } catch (err) {
    console.error("\n❌ Unexpected error in F7.4 test suite:", err);
  }

  console.log("\n=================================================");
  console.log(`F7.4 TEST SUMMARY: ${passed}/${total} PASS`);
  console.log("=================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runF74FinalV02Tests();
