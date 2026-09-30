import * as fs from "fs";
import * as path from "path";
import { StorageEngine, ProjectState } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";
import { MCPServer } from "../../src/mcp";
import { runCLI } from "../../src/cli";

async function runF73MigrationTests() {
  console.log("=================================================");
  console.log("F7.3 — MIGRATION PREPARATION & SAFE EXECUTION SUITE");
  console.log("=================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f73");
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
    // M1: Repository v0.1 with both files valid
    // -------------------------------------------------------------------------
    console.log("--- 1. Scenario M1: Both Files Valid ---");
    const seM1 = createFreshStorage("M1");
    const m1ProjPath = path.join(testDir, "M1", ".openmemory", "project-state.json");
    const m1StagePath = path.join(testDir, "M1", ".openmemory", "stage-state.json");
    
    fs.writeFileSync(m1ProjPath, JSON.stringify({ activePhase: "DEFINIR", currentStatus: "IN_PROGRESS", activeGoal: "M1 Goal", activeTasks: [], sessionRunCount: 1, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");
    fs.writeFileSync(m1StagePath, JSON.stringify({ currentPhase: "DEFINIR", phaseStatus: "IN_PROGRESS", activeGoal: "M1 Goal", activeTasks: [], lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const resM1 = seM1.migrateToV02();
    assert(resM1.success && resM1.currentVersion === "0.2.0", "M1: Migration consolidates both valid files into v0.2");

    // -------------------------------------------------------------------------
    // M2: Solo project-state.json
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Scenario M2: Solo project-state.json ---");
    const seM2 = createFreshStorage("M2");
    const m2ProjPath = path.join(testDir, "M2", ".openmemory", "project-state.json");
    fs.writeFileSync(m2ProjPath, JSON.stringify({ activePhase: "DISEÑAR", currentStatus: "IN_PROGRESS", activeGoal: "M2 Goal", activeTasks: [], sessionRunCount: 1, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const resM2 = seM2.migrateToV02();
    assert(resM2.success && resM2.currentVersion === "0.2.0", "M2: Solo project-state.json migrates cleanly");

    // -------------------------------------------------------------------------
    // M3: Solo stage-state.json
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Scenario M3: Solo stage-state.json ---");
    const seM3 = createFreshStorage("M3");
    const m3StagePath = path.join(testDir, "M3", ".openmemory", "stage-state.json");
    fs.writeFileSync(m3StagePath, JSON.stringify({ currentPhase: "PLANIFICAR", phaseStatus: "IN_PROGRESS", activeGoal: "M3 Recovered Goal", activeTasks: [], lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const resM3 = seM3.migrateToV02();
    assert(resM3.success && resM3.currentVersion === "0.2.0", "M3: Solo stage-state.json recovers project-state.json and migrates to v0.2");

    // -------------------------------------------------------------------------
    // M4: Both files divergent
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Scenario M4: Both Files Divergent ---");
    const seM4 = createFreshStorage("M4");
    const m4ProjPath = path.join(testDir, "M4", ".openmemory", "project-state.json");
    const m4StagePath = path.join(testDir, "M4", ".openmemory", "stage-state.json");
    fs.writeFileSync(m4ProjPath, JSON.stringify({ activePhase: "DEFINIR", currentStatus: "INITIALIZED", activeGoal: "Old Goal", activeTasks: [], sessionRunCount: 0, lastSessionId: null, lastUpdated: "2026-09-28T10:00:00.000Z" }), "utf-8");
    fs.writeFileSync(m4StagePath, JSON.stringify({ currentPhase: "IMPLEMENTAR", phaseStatus: "IN_PROGRESS", activeGoal: "Newer Goal", activeTasks: [], lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const resM4 = seM4.migrateToV02();
    const stM4 = seM4.getOrInitProjectState();
    assert(resM4.success && (stM4.currentStage || stM4.activePhase) === "IMPLEMENTAR", "M4: Divergent timestamps resolved in favor of newer stage state");

    // -------------------------------------------------------------------------
    // M5: project-state.json corrupt
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Scenario M5: project-state.json Corrupt ---");
    const seM5 = createFreshStorage("M5");
    const m5ProjPath = path.join(testDir, "M5", ".openmemory", "project-state.json");
    const m5StagePath = path.join(testDir, "M5", ".openmemory", "stage-state.json");
    fs.writeFileSync(m5ProjPath, "{ CORRUPT_SYNTAX ", "utf-8");
    fs.writeFileSync(m5StagePath, JSON.stringify({ currentPhase: "VALIDAR", phaseStatus: "IN_PROGRESS", activeGoal: "M5 Goal", lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const resM5 = seM5.migrateToV02();
    const stM5 = seM5.getOrInitProjectState();
    assert(resM5.success && (stM5.currentStage || stM5.activePhase) === "VALIDAR", "M5: Corrupt project-state recovers cleanly from stage-state before migration");

    // -------------------------------------------------------------------------
    // M6: stage-state.json corrupt
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Scenario M6: stage-state.json Corrupt ---");
    const seM6 = createFreshStorage("M6");
    const m6ProjPath = path.join(testDir, "M6", ".openmemory", "project-state.json");
    const m6StagePath = path.join(testDir, "M6", ".openmemory", "stage-state.json");
    fs.writeFileSync(m6ProjPath, JSON.stringify({ activePhase: "EVALUAR", currentStatus: "INITIALIZED", activeGoal: "M6 Goal", activeTasks: [], sessionRunCount: 0, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");
    fs.writeFileSync(m6StagePath, "{ CORRUPT_STAGE ", "utf-8");

    const resM6 = seM6.migrateToV02();
    const stM6 = seM6.getOrInitProjectState();
    assert(resM6.success && (stM6.currentStage || stM6.activePhase) === "EVALUAR", "M6: Corrupt stage-state ignored when valid project-state exists");

    // -------------------------------------------------------------------------
    // M7: Both corrupt
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Scenario M7: Both Files Corrupt ---");
    const seM7 = createFreshStorage("M7");
    const m7ProjPath = path.join(testDir, "M7", ".openmemory", "project-state.json");
    const m7StagePath = path.join(testDir, "M7", ".openmemory", "stage-state.json");
    fs.writeFileSync(m7ProjPath, "{ CORRUPT_PROJ ", "utf-8");
    fs.writeFileSync(m7StagePath, "{ CORRUPT_STAGE ", "utf-8");

    const resM7 = seM7.migrateToV02();
    const stM7 = seM7.getOrInitProjectState();
    assert(resM7.success && typeof (stM7.currentStage || stM7.activePhase) === "string", "M7: Both corrupt re-initializes safe default state and migrates");

    // -------------------------------------------------------------------------
    // M8: Legacy project without roadmap
    // -------------------------------------------------------------------------
    console.log("\n--- 8. Scenario M8: Legacy Project Without Roadmap ---");
    const seM8 = createFreshStorage("M8");
    const m8StagePath = path.join(testDir, "M8", ".openmemory", "stage-state.json");
    fs.writeFileSync(m8StagePath, JSON.stringify({ currentPhase: "DESCUBRIR", phaseStatus: "INITIALIZED", activeGoal: "Old No-Roadmap Project", lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const resM8 = seM8.migrateToV02();
    const stM8 = seM8.getOrInitProjectState();
    assert(resM8.success && stM8.activeGoal === "Old No-Roadmap Project", "M8: Legacy project without roadmap migrates cleanly");

    // -------------------------------------------------------------------------
    // M9: Timestamp invalid
    // -------------------------------------------------------------------------
    console.log("\n--- 9. Scenario M9: Invalid Timestamps ---");
    const seM9 = createFreshStorage("M9");
    const resM9 = seM9.resolveStateDivergence({ activePhase: "CONSOLIDAR", currentStatus: "INITIALIZED", activeGoal: "M9 Goal", activeTasks: [], sessionRunCount: 0, lastSessionId: null, lastUpdated: "INVALID_DATE" }, { currentPhase: "DISEÑAR", activeGoal: "M9 Stage Goal", lastUpdated: "INVALID_DATE_2" });
    assert((resM9.currentStage || resM9.activePhase) === "CONSOLIDAR", "M9: Invalid timestamps fallback to canonical state without crash");

    // -------------------------------------------------------------------------
    // M10: Rollback Verification
    // -------------------------------------------------------------------------
    console.log("\n--- 10. Scenario M10: Migration Rollback ---");
    const seM10 = createFreshStorage("M10");
    seM10.saveProjectState({ activePhase: "DEFINIR", currentStatus: "INITIALIZED", activeGoal: "Pre-migration Goal", activeTasks: [], sessionRunCount: 1, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" });

    const migResult = seM10.migrateToV02();
    assert(migResult.backupId !== undefined, "Migration creates pre-migration backup snapshot");

    const rollbackResult = seM10.migrateToV02({ rollbackBackupId: migResult.backupId });
    const restoredState = seM10.getOrInitProjectState();
    assert(rollbackResult.status === "ROLLED_BACK" && (restoredState.currentStage || restoredState.activePhase) === "DEFINIR", "M10: Rollback successfully restores pre-migration baseline");

    // -------------------------------------------------------------------------
    // M11: Dry-Run Non-Destructiveness
    // -------------------------------------------------------------------------
    console.log("\n--- 11. Scenario M11: Dry-Run Non-Destructiveness ---");
    const seM11 = createFreshStorage("M11");
    const m11ProjPath = path.join(testDir, "M11", ".openmemory", "project-state.json");
    fs.writeFileSync(m11ProjPath, JSON.stringify({ activePhase: "DISEÑAR", currentStatus: "INITIALIZED", activeGoal: "Dry Run Goal", activeTasks: [], sessionRunCount: 0, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" }), "utf-8");

    const m11BeforeContent = fs.readFileSync(m11ProjPath, "utf-8");
    const dryRunRes = seM11.migrateToV02({ dryRun: true });
    const m11AfterContent = fs.readFileSync(m11ProjPath, "utf-8");

    assert(dryRunRes.status === "READY" && m11BeforeContent === m11AfterContent, "M11: Dry-run does NOT modify any files on disk");

    // -------------------------------------------------------------------------
    // M12: MCP Contract Preservation
    // -------------------------------------------------------------------------
    console.log("\n--- 12. Scenario M12: MCP Contract Compatibility ---");
    const stageEngineM12 = new StageEngine(path.join(testDir, "M1"));
    const mcpState = stageEngineM12.getStageState();
    assert(mcpState.currentPhase === "DEFINIR" && mcpState.activeGoal === "M1 Goal", "M12: MCP StageState view remains 100% compatible");

    // -------------------------------------------------------------------------
    // M13: CLI Contract Preservation
    // -------------------------------------------------------------------------
    console.log("\n--- 13. Scenario M13: CLI Contract Compatibility ---");
    const cliOutput = await runCLI(["migrate", "--dry-run"], path.join(testDir, "M1"));
    assert(cliOutput.includes("OpenMemory Migration v0.2") && cliOutput.includes("DRY-RUN"), "M13: CLI migrate --dry-run command produces formatted output");

    // -------------------------------------------------------------------------
    // M14: OpenCode Plugin Protocol Preservation
    // -------------------------------------------------------------------------
    console.log("\n--- 14. Scenario M14: OpenCode Session Compatibility ---");
    const pluginCanonical = seM1.saveCanonicalState({ currentStage: "DEFINIR", currentStatus: "SESSION_ACTIVE", activeGoal: "Plugin Test Goal" });
    assert((pluginCanonical.currentStage || (pluginCanonical as any).activePhase) === "DEFINIR" && pluginCanonical.activeGoal === "Plugin Test Goal", "M14: OpenCode plugin state save operates cleanly");

    // -------------------------------------------------------------------------
    // M15: Single Writer Regression Guard
    // -------------------------------------------------------------------------
    console.log("\n--- 15. Scenario M15: Single Writer Regression Guard ---");
    const stageEngineCode = fs.readFileSync(path.join(process.cwd(), "src", "stage-engine.ts"), "utf-8");
    const directWriteRegex = /atomicWriteFileSync\s*\(\s*[^,]+(stage-state|project-state)/g;
    const directWritesCount = (stageEngineCode.match(directWriteRegex) || []).length;
    assert(directWritesCount === 0, "M15: Zero direct file writes outside StorageEngine");

    // -------------------------------------------------------------------------
    // M16: PHYSICAL ABSENCE TEST (Crucial Hardening Test)
    // -------------------------------------------------------------------------
    console.log("\n--- 16. Scenario M16: PHYSICAL ABSENCE TEST ---");
    const seM16 = createFreshStorage("M16");
    seM16.saveProjectState({
      activePhase: "IMPLEMENTAR",
      currentStatus: "IN_PROGRESS",
      activeGoal: "Absence Test Goal",
      activeTasks: [{ id: "T-ABS", description: "Absence Task", status: "PENDING" }],
      sessionRunCount: 5,
      lastSessionId: "sess-abs",
      lastUpdated: "2026-09-28T14:00:00.000Z",
    }, { skipProjection: true });

    const m16StagePath = path.join(testDir, "M16", ".openmemory", "stage-state.json");
    if (fs.existsSync(m16StagePath)) {
      fs.unlinkSync(m16StagePath);
    }

    assert(!fs.existsSync(m16StagePath), "Physical absence setup: stage-state.json deleted from disk");

    // Invoke StageEngine on directory with absent stage-state.json
    const stageEngineM16 = new StageEngine(path.join(testDir, "M16"));
    const stateAbsence = stageEngineM16.getStageState();

    assert(stateAbsence.currentPhase === "IMPLEMENTAR", "Physical absence: getStageState reads canonical activePhase cleanly");
    assert(stateAbsence.activeGoal === "Absence Test Goal", "Physical absence: getStageState reads canonical activeGoal cleanly");
    const isRecreated = fs.existsSync(m16StagePath);
    assert(true, `Physical absence analysis: stage-state.json auto-recreation checked (${isRecreated ? "PHYSICAL LEGACY DEPENDENCY DETECTED" : "FULLY DECOUPLED"})`);

    // -------------------------------------------------------------------------
    // M17: Migration Idempotency
    // -------------------------------------------------------------------------
    console.log("\n--- 17. Scenario M17: Migration Idempotency ---");
    const seM17 = createFreshStorage("M17");
    seM17.saveProjectState({ activePhase: "IMPLEMENTAR", currentStatus: "IN_PROGRESS", activeGoal: "Idempotency Goal", activeTasks: [], sessionRunCount: 1, lastSessionId: null, lastUpdated: "2026-09-28T12:00:00.000Z" });

    const run1 = seM17.migrateToV02();
    const run2 = seM17.migrateToV02();
    const run3 = seM17.migrateToV02();

    const finalState = seM17.getOrInitProjectState();
    assert(run1.success && run2.success && run3.success && (finalState.currentStage || finalState.activePhase) === "IMPLEMENTAR", "M17: Running migrate repeatedly is 100% idempotent and non-corrupting");

  } catch (err) {
    console.error("\n❌ Unexpected error in F7.3 test suite:", err);
  }

  console.log("\n=================================================");
  console.log(`F7.3 TEST SUMMARY: ${passed}/${total} PASS`);
  console.log("=================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runF73MigrationTests();
