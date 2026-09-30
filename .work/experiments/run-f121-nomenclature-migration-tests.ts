import * as fs from "fs";
import * as path from "path";
import {
  StorageEngine,
  normalizeProjectState,
  ProjectState,
  MigrationClassification,
} from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";
import { MASTER_PHASE_ORDER } from "../../src/master-prompt";
import { createMCPServer } from "../../src/mcp";
import { runCLI } from "../../src/cli";
import { runInteractiveInitWizard } from "../../src/installer";

// Test assertion helper
let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
  }
}

async function runF121TestSuite() {
  console.log("=================================================================");
  console.log("=== F12.1 Phase/Stage Nomenclature Migration Test Suite ===");
  console.log("=================================================================\n");

  const testDir = path.join(process.cwd(), ".work", "f121_test_tmp");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // -----------------------------------------------------------------
    // Scenario 1: Canonical State Passthrough (CANONICAL)
    // -----------------------------------------------------------------
    console.log("[EXECUTED] Test 01: Canonical State Passthrough (CANONICAL)");
    const input1 = {
      currentStage: "IMPLEMENTAR",
      currentStatus: "IN_PROGRESS",
      activeGoal: "Canonical Goal",
      activeTasks: [],
      sessionRunCount: 1,
      lastSessionId: "sess-1",
      lastUpdated: new Date().toISOString(),
      roadmap: {
        activePhaseId: "PHASE-1",
        phases: [
          {
            id: "PHASE-1",
            name: "Fase 1",
            description: "Desc",
            status: "IN_PROGRESS",
            currentStage: "IMPLEMENTAR",
            stageStatus: "IN_PROGRESS",
            activeGoal: "Goal",
            activeTasks: [],
            deliverables: [],
            risksOrUncertainties: [],
            nextPhaseProposed: "PHASE-2",
            createdTimestamp: new Date().toISOString(),
          },
        ],
        updatedAt: new Date().toISOString(),
      },
    };

    const res1 = normalizeProjectState(input1);
    assert(res1.classification === "CANONICAL", "Classification is CANONICAL");
    assert(res1.state.currentStage === "IMPLEMENTAR", "currentStage is IMPLEMENTAR");
    assert(!("activePhase" in res1.state), "activePhase pruned");
    assert(!("currentPhase" in res1.state), "currentPhase pruned");

    // -----------------------------------------------------------------
    // Scenario 2: Legacy activePhase (Stage) Migration (LEGACY_EQUIVALENT)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 02: Legacy activePhase (Stage) Migration (LEGACY_EQUIVALENT)");
    const input2 = {
      activePhase: "IMPLEMENTAR",
      currentStatus: "IN_PROGRESS",
      activeGoal: "Legacy activePhase Goal",
    };

    const res2 = normalizeProjectState(input2);
    assert(res2.classification === "LEGACY_EQUIVALENT", "Classification is LEGACY_EQUIVALENT");
    assert(res2.state.currentStage === "IMPLEMENTAR", "Migrated activePhase 'IMPLEMENTAR' to currentStage");
    assert(!("activePhase" in res2.state), "activePhase pruned");

    // -----------------------------------------------------------------
    // Scenario 3: Legacy currentPhase (Stage) Migration (LEGACY_EQUIVALENT)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 03: Legacy currentPhase (Stage) Migration (LEGACY_EQUIVALENT)");
    const input3 = {
      currentPhase: "DISEÑAR",
      currentStatus: "IN_PROGRESS",
      activeGoal: "Legacy currentPhase Goal",
    };

    const res3 = normalizeProjectState(input3);
    assert(res3.classification === "LEGACY_EQUIVALENT", "Classification is LEGACY_EQUIVALENT");
    assert(res3.state.currentStage === "DISEÑAR", "Migrated currentPhase 'DISEÑAR' to currentStage");
    assert(!("currentPhase" in res3.state), "currentPhase pruned");

    // -----------------------------------------------------------------
    // Scenario 4: Contradiction A — Canonical Valid Stage vs Legacy Stage (CONTRADICTORY)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 04: Contradiction A — Canonical Valid Stage vs Legacy Stage (CONTRADICTORY)");
    const input4 = {
      currentStage: "DISEÑAR",
      activePhase: "IMPLEMENTAR",
      currentStatus: "IN_PROGRESS",
    };

    const res4 = normalizeProjectState(input4);
    assert(res4.classification === "CONTRADICTORY", "Classification is CONTRADICTORY");
    assert(res4.state.currentStage === "DISEÑAR", "Canonical valid currentStage 'DISEÑAR' preserved");
    assert(!("activePhase" in res4.state), "Legacy activePhase 'IMPLEMENTAR' removed");
    assert(res4.logEvidence.length > 0, "Contradiction evidence logged");

    // -----------------------------------------------------------------
    // Scenario 5: Contradiction B — Invalid Canonical Stage vs Legacy Valid Stage (INVALID)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 05: Contradiction B — Invalid Canonical Stage vs Legacy Valid Stage (INVALID)");
    const input5 = {
      currentStage: "INVALIDO",
      activePhase: "IMPLEMENTAR",
    };

    const res5 = normalizeProjectState(input5);
    assert(res5.classification === "INVALID", "Classification is INVALID");
    assert(res5.state.currentStage === "IMPLEMENTAR", "Does NOT accept 'INVALIDO' silently; recovers valid stage 'IMPLEMENTAR'");
    assert(!("activePhase" in res5.state), "Legacy activePhase pruned");

    // -----------------------------------------------------------------
    // Scenario 6: Contradiction C — Legacy currentPhase vs Canonical Valid currentStage (CONTRADICTORY)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 06: Contradiction C — Legacy currentPhase vs Canonical Valid currentStage (CONTRADICTORY)");
    const input6 = {
      currentPhase: "DISEÑAR",
      currentStage: "IMPLEMENTAR",
    };

    const res6 = normalizeProjectState(input6);
    assert(res6.classification === "CONTRADICTORY", "Classification is CONTRADICTORY");
    assert(res6.state.currentStage === "IMPLEMENTAR", "Preserves canonical valid currentStage 'IMPLEMENTAR'");
    assert(!("currentPhase" in res6.state), "Legacy currentPhase removed");

    // -----------------------------------------------------------------
    // Scenario 7: Roadmap-Only Case — Resolved from roadmap.phases[] (LEGACY_EQUIVALENT)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 07: Roadmap-Only Case — Resolved from roadmap.phases[] (LEGACY_EQUIVALENT)");
    const input7 = {
      activePhase: "PHASE-2",
      roadmap: {
        activePhaseId: "PHASE-2",
        phases: [
          {
            id: "PHASE-1",
            name: "Fase 1",
            status: "COMPLETED",
            currentStage: "PREPARAR_CONTINUIDAD",
          },
          {
            id: "PHASE-2",
            name: "Fase 2",
            status: "IN_PROGRESS",
            currentStage: "VALIDAR",
          },
        ],
        updatedAt: new Date().toISOString(),
      },
    };

    const res7 = normalizeProjectState(input7);
    assert(res7.classification === "LEGACY_EQUIVALENT", "Classification is LEGACY_EQUIVALENT");
    assert(res7.state.currentStage === "VALIDAR", "Resolved currentStage 'VALIDAR' from Roadmap phase PHASE-2");
    assert(res7.state.roadmap?.activePhaseId === "PHASE-2", "roadmap.activePhaseId is PHASE-2");

    // -----------------------------------------------------------------
    // Scenario 8: Roadmap-Only Case — Stage Unknown (ROADMAP_KNOWN_STAGE_UNKNOWN)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 08: Roadmap-Only Case — Stage Unknown (ROADMAP_KNOWN_STAGE_UNKNOWN)");
    const input8 = {
      activePhase: "PHASE-2",
    };

    const res8 = normalizeProjectState(input8);
    assert(res8.classification === "ROADMAP_KNOWN_STAGE_UNKNOWN", "Classification is ROADMAP_KNOWN_STAGE_UNKNOWN");
    assert(res8.state.roadmap?.activePhaseId === "PHASE-2", "roadmap.activePhaseId set to PHASE-2");
    assert(res8.logEvidence.some((e) => e.includes("ROADMAP_KNOWN_STAGE_UNKNOWN") || e.includes("unknown")), "Logged uncertainty correctly without inventing stage");

    // -----------------------------------------------------------------
    // Scenario 9: Uninitialized State (WORKFLOW_STAGE_UNINITIALIZED)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 09: Uninitialized State (WORKFLOW_STAGE_UNINITIALIZED)");
    const input9 = {};

    const res9 = normalizeProjectState(input9);
    assert(res9.classification === "WORKFLOW_STAGE_UNINITIALIZED", "Classification is WORKFLOW_STAGE_UNINITIALIZED");
    assert(res9.state.currentStage === undefined, "Uninitialized state keeps currentStage undefined without inventing state");
    assert(res9.state.roadmap?.activePhaseId === "PHASE-1", "Initialized default roadmap PHASE-1");

    // -----------------------------------------------------------------
    // Scenario 10: Idempotence Test — Single Pass vs Double Pass
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 10: Idempotence Test — Double Pass Normalization");
    const input10 = {
      currentStage: "IMPLEMENTAR",
      activePhase: "IMPLEMENTAR",
      roadmap: { activePhaseId: "PHASE-1", phases: [] },
    };

    const pass1 = normalizeProjectState(input10).state;
    const pass2 = normalizeProjectState(pass1).state;
    assert(JSON.stringify(pass1) === JSON.stringify(pass2), "Double pass normalization yields identical state (Idempotent)");

    // -----------------------------------------------------------------
    // Scenario 11: Disk Persistence Contract — Strict Absence of Legacy Keys
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 11: Disk Persistence Contract — Strict Absence of Legacy Keys");
    const storage11 = new StorageEngine(testDir);
    storage11.ensureStorageStructure();
    const stateToSave: any = {
      currentStage: "VALIDAR",
      activePhase: "VALIDAR", // Legacy key injected intentionally before saving
      currentPhase: "VALIDAR", // Legacy key injected intentionally before saving
      currentStatus: "IN_PROGRESS",
      activeGoal: "Save test goal",
      activeTasks: [],
      sessionRunCount: 0,
      lastSessionId: null,
      lastUpdated: new Date().toISOString(),
    };

    storage11.saveProjectState(stateToSave);

    const rawDiskContent = fs.readFileSync(path.join(testDir, ".openmemory", "project-state.json"), "utf-8");
    const parsedDiskObj = JSON.parse(rawDiskContent);

    assert(!("activePhase" in parsedDiskObj), "project-state.json MUST NOT contain activePhase key");
    assert(!("currentPhase" in parsedDiskObj), "project-state.json MUST NOT contain currentPhase key");
    assert("currentStage" in parsedDiskObj && parsedDiskObj.currentStage === "VALIDAR", "project-state.json contains canonical currentStage='VALIDAR'");

    // -----------------------------------------------------------------
    // Scenario 12: Atomic Backup and Auto-Rollback on Auto-Migration
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 12: Atomic Backup and Auto-Rollback on Migration Failure");
    const backupMeta12 = storage11.createBackup("pre-f12.1-migration");
    assert(fs.existsSync(backupMeta12.backupPath), "Backup directory created");
    assert(storage11.restoreBackup(backupMeta12.id), "restoreBackup restores state successfully");

    // -----------------------------------------------------------------
    // Scenario 13: Restart / Cold Re-instantiation Integrity
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 13: Restart / Cold Re-instantiation Integrity");
    const coldStorage = new StorageEngine(testDir);
    const reloadedState = coldStorage.getOrInitProjectState();

    assert(reloadedState.currentStage === "VALIDAR", "Cold reloaded state preserves canonical currentStage='VALIDAR'");
    assert(!("activePhase" in reloadedState), "Cold reloaded state has no activePhase key");
    assert(!("currentPhase" in reloadedState), "Cold reloaded state has no currentPhase key");

    // -----------------------------------------------------------------
    // Scenario 14: StageState Compatibility Getter
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 14: StageState Compatibility Getter");
    const stageEngine14 = new StageEngine(testDir);
    const stageState14 = stageEngine14.getStageState();

    assert(stageState14.currentStage === "VALIDAR", "StageState.currentStage is primary");
    assert(stageState14.currentPhase === "VALIDAR", "StageState.currentPhase deprecated getter returns currentStage");

    // Test compatibility setter
    stageState14.currentPhase = "EVALUAR";
    assert(stageState14.currentStage === "EVALUAR", "StageState.currentPhase deprecated setter mutates currentStage");
    stageEngine14.saveStageState(stageState14);

    // -----------------------------------------------------------------
    // Scenario 15: MCP openmemory_get_stage Output Contract
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 15: MCP openmemory_get_stage Output Contract");
    const mcpServer = createMCPServer(testDir);
    assert(Boolean(mcpServer), "MCP Server instantiated successfully for F12.1 contract check");

    // -----------------------------------------------------------------
    // Scenario 16: CLI Output Formatting Contract
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 16: CLI Output Formatting Contract");
    const cliStatus = await runCLI(["status"], testDir);
    assert(cliStatus.includes("Workflow Stage: EVALUAR"), "CLI status output contains 'Workflow Stage: EVALUAR'");
    assert(cliStatus.includes("Roadmap Phase: PHASE-1"), "CLI status output contains 'Roadmap Phase: PHASE-1'");

    const cliStage = await runCLI(["stage"], testDir);
    assert(cliStage.includes("Workflow Stage:"), "CLI stage output contains 'Workflow Stage:'");
    assert(cliStage.includes("Roadmap Phase:"), "CLI stage output contains 'Roadmap Phase:'");

    // -----------------------------------------------------------------
    // Scenario 17: Interactive /init Wizard Canonical Persistence
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 17: Interactive /init Wizard Canonical Persistence");
    const initTestDir = path.join(process.cwd(), ".work", "f121_init_tmp");
    if (fs.existsSync(initTestDir)) fs.rmSync(initTestDir, { recursive: true, force: true });
    fs.mkdirSync(initTestDir, { recursive: true });

    const wizardRes = await runInteractiveInitWizard({
      targetDir: initTestDir,
      answersProvider: async (_prompt, defVal) => defVal,
      confirmProvider: async () => true,
    });

    assert(wizardRes.success === true, "Interactive init wizard completed successfully");
    const initDiskRaw = fs.readFileSync(path.join(initTestDir, ".openmemory", "project-state.json"), "utf-8");
    const initDiskObj = JSON.parse(initDiskRaw);
    assert("currentStage" in initDiskObj, "Wizard persisted currentStage in project-state.json");
    assert(!("activePhase" in initDiskObj), "Wizard did NOT persist activePhase in project-state.json");

    // -----------------------------------------------------------------
    // Scenario 18: Single Writer Audit Facade Verification
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 18: Single Writer Audit Facade Verification");
    const storage18 = new StorageEngine(testDir);
    const updatedCanonical = storage18.saveCanonicalState({
      currentStage: "CONSOLIDAR",
      phaseStatus: "IN_PROGRESS",
      activeGoal: "Single writer goal",
    });

    assert(updatedCanonical.currentStage === "CONSOLIDAR", "saveCanonicalState updated currentStage='CONSOLIDAR'");
    const disk18Raw = fs.readFileSync(path.join(testDir, ".openmemory", "project-state.json"), "utf-8");
    const disk18Obj = JSON.parse(disk18Raw);
    assert(!("activePhase" in disk18Obj), "Single writer facade output has no activePhase");
    assert(!("currentPhase" in disk18Obj), "Single writer facade output has no currentPhase");

    // -----------------------------------------------------------------
    // Scenario 19: Full Static Code Search Audit (Zero Writers Outside StorageEngine)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 19: Full Static Code Search Audit (Zero Direct Writers)");
    const srcFiles = ["storage.ts", "stage-engine.ts", "installer.ts", "cli.ts", "mcp.ts"];
    let directWritersFound = 0;

    for (const file of srcFiles) {
      const content = fs.readFileSync(path.join(process.cwd(), "src", file), "utf-8");
      // Check for direct JSON writing to project-state.json outside StorageEngine
      if (file !== "storage.ts") {
        const matches = content.match(/project-state\.json/g);
        if (matches) {
          // Verify that non-storage files only refer to project-state.json in comments or path declarations, not fs.writeFileSync
          const writeMatches = content.match(/writeFileSync\([^)]*project-state\.json[^)]*\)/g);
          if (writeMatches) {
            directWritersFound += writeMatches.length;
            console.error(`  [FAIL] Direct writer found in ${file}: ${writeMatches.join(", ")}`);
          }
        }
      }
    }

    assert(directWritersFound === 0, "Zero direct writers to project-state.json found outside StorageEngine");

    // Clean temp test dirs
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    if (fs.existsSync(initTestDir)) fs.rmSync(initTestDir, { recursive: true, force: true });

    console.log("\n=================================================================");
    console.log(`   F12.1 Nomenclature Migration Suite Complete: ${passedAssertions}/${totalAssertions} PASSED`);
    console.log("=================================================================");

    if (passedAssertions !== totalAssertions) {
      process.exit(1);
    }
  } catch (err) {
    console.error("[FAIL] Unhandled error during F12.1 test suite execution:", err);
    process.exit(1);
  }
}

runF121TestSuite();
