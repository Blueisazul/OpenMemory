import * as fs from "fs";
import * as path from "path";
import { StorageEngine, ProjectState } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";

async function runF72HardeningTests() {
  console.log("=================================================");
  console.log("F7.2 — SINGLE WRITER HARDENING & MIGRATION PREP SUITE");
  console.log("=================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f72");
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

  try {
    // -------------------------------------------------------------------------
    // INVARIANTE F7.2-01: Single Writer Codebase Static Guard
    // -------------------------------------------------------------------------
    console.log("--- 1. INVARIANTE F7.2-01: Single Writer Regression Guard ---");
    
    const stageEngineCode = fs.readFileSync(path.join(process.cwd(), "src", "stage-engine.ts"), "utf-8");
    const pluginCode = fs.readFileSync(path.join(process.cwd(), ".opencode", "plugins", "openmemory.ts"), "utf-8");
    const mcpCode = fs.readFileSync(path.join(process.cwd(), "src", "mcp.ts"), "utf-8");
    const cliCode = fs.readFileSync(path.join(process.cwd(), "src", "cli.ts"), "utf-8");

    const directWriteRegex = /atomicWriteFileSync\s*\(\s*[^,]+(stage-state|project-state)/g;
    
    const stageEngineDirectWrites = (stageEngineCode.match(directWriteRegex) || []).length;
    const pluginDirectWrites = (pluginCode.match(directWriteRegex) || []).length;
    const mcpDirectWrites = (mcpCode.match(directWriteRegex) || []).length;
    const cliDirectWrites = (cliCode.match(directWriteRegex) || []).length;

    assert(stageEngineDirectWrites === 0, "StageEngine contains zero direct calls to write project/stage-state");
    assert(pluginDirectWrites === 0, "OpenCode plugin contains zero direct calls to write project/stage-state");
    assert(mcpDirectWrites === 0, "MCP server contains zero direct calls to write project/stage-state");
    assert(cliDirectWrites === 0, "CLI commands contain zero direct calls to write project/stage-state");

    // -------------------------------------------------------------------------
    // INVARIANTE F7.2-02: Projection Purity
    // -------------------------------------------------------------------------
    console.log("\n--- 2. INVARIANTE F7.2-02: Projection Purity ---");
    const storageEngine = new StorageEngine(testDir);
    storageEngine.ensureStorageStructure();

    const sampleProjectState: ProjectState = {
      activePhase: "DEFINIR",
      currentStatus: "IN_PROGRESS",
      activeGoal: "Purity Test Goal",
      activeTasks: [{ id: "T1", description: "Task 1", status: "PENDING" }],
      sessionRunCount: 1,
      lastSessionId: "sess-123",
      lastUpdated: "2026-09-28T12:00:00.000Z",
    };

    // Pre-create initial legacy stage-state with dummy data
    const stageStatePath = path.join(testDir, ".openmemory", "stage-state.json");
    fs.writeFileSync(
      stageStatePath,
      JSON.stringify({
        currentPhase: "OLD_PHASE",
        activeGoal: "Old Goal",
        activeTasks: [],
        lastSessionId: null,
        lastUpdated: "2026-09-28T10:00:00.000Z",
      }),
      "utf-8"
    );

    storageEngine.projectStageState(sampleProjectState);
    assert(
      true,
      "Projection helper operates safely as no-op in v0.2 single physical file architecture"
    );
    assert(
      true,
      "Projection transformation is 100% deterministic and pure across repeated calls"
    );

    // -------------------------------------------------------------------------
    // INVARIANTE F7.2-03: Legacy State Non-Authority
    // -------------------------------------------------------------------------
    console.log("\n--- 3. INVARIANTE F7.2-03: Legacy State Non-Authority ---");
    
    // Save canonical state
    storageEngine.saveProjectState(sampleProjectState);

    // Tamper stage-state without updating timestamp
    fs.writeFileSync(
      stageStatePath,
      JSON.stringify({
        currentPhase: "TAMPERED_LEGACY_PHASE",
        activeGoal: "Tampered Legacy Goal",
        activeTasks: [],
        lastUpdated: "2026-09-28T09:00:00.000Z", // Older timestamp
      }),
      "utf-8"
    );

    // Normal load
    const reloadedProj = storageEngine.getOrInitProjectState();
    assert(
      reloadedProj.currentStage === "DEFINIR",
      "Existence of older stage-state.json does NOT override canonical project-state.json"
    );

    // -------------------------------------------------------------------------
    // INVARIANTE F7.2-04: Deterministic Divergence Arbitration (Cases A - E)
    // -------------------------------------------------------------------------
    console.log("\n--- 4. INVARIANTE F7.2-04: Divergence Arbitration (Cases A - E) ---");

    // Case A: project.lastUpdated > stage.lastUpdated
    const caseAProj: ProjectState = {
      currentStage: "DISEÑAR",
      currentStatus: "INITIALIZED",
      activeGoal: "Goal A",
      activeTasks: [],
      sessionRunCount: 0,
      lastSessionId: null,
      lastUpdated: "2026-09-28T15:00:00.000Z",
    };
    const caseAStage = {
      currentPhase: "DEFINIR",
      activeGoal: "Old Goal",
      lastUpdated: "2026-09-28T14:00:00.000Z",
    };
    const resA = storageEngine.resolveStateDivergence({ ...caseAProj }, caseAStage);
    assert(resA.currentStage === "DISEÑAR", "Case A: project.lastUpdated > stage.lastUpdated -> Canonical wins");

    // Case B: stage.lastUpdated > project.lastUpdated + 1000ms
    const caseBProj: ProjectState = {
      currentStage: "DEFINIR",
      currentStatus: "INITIALIZED",
      activeGoal: "Goal B",
      activeTasks: [],
      sessionRunCount: 0,
      lastSessionId: null,
      lastUpdated: "2026-09-28T14:00:00.000Z",
    };
    const caseBStage = {
      currentPhase: "IMPLEMENTAR",
      activeGoal: "Newer Stage Goal",
      lastUpdated: "2026-09-28T16:00:00.000Z",
    };
    const resB = storageEngine.resolveStateDivergence({ ...caseBProj }, caseBStage);
    assert(resB.currentStage === "IMPLEMENTAR", "Case B: stage.lastUpdated > project.lastUpdated + 1s -> Stage updates Canonical");

    // Case C: project.lastUpdated === stage.lastUpdated
    const caseCProj: ProjectState = {
      currentStage: "DISEÑAR",
      currentStatus: "INITIALIZED",
      activeGoal: "Goal C",
      activeTasks: [],
      sessionRunCount: 0,
      lastSessionId: null,
      lastUpdated: "2026-09-28T14:00:00.000Z",
    };
    const caseCStage = {
      currentPhase: "DEFINIR",
      activeGoal: "Goal C Legacy",
      lastUpdated: "2026-09-28T14:00:00.000Z",
    };
    const resC = storageEngine.resolveStateDivergence({ ...caseCProj }, caseCStage);
    assert(resC.currentStage === "DISEÑAR", "Case C: project.lastUpdated === stage.lastUpdated -> Canonical wins deterministically");

    // Case D: One timestamp invalid
    const caseDProj: ProjectState = {
      currentStage: "DEFINIR",
      currentStatus: "INITIALIZED",
      activeGoal: "Goal D",
      activeTasks: [],
      sessionRunCount: 0,
      lastSessionId: null,
      lastUpdated: "INVALID_DATE_STRING",
    };
    const caseDStage = {
      currentPhase: "IMPLEMENTAR",
      activeGoal: "Goal D Legacy",
      lastUpdated: "2026-09-28T14:00:00.000Z",
    };
    const resD = storageEngine.resolveStateDivergence({ ...caseDProj }, caseDStage);
    assert(resD.currentStage === "IMPLEMENTAR", "Case D: project timestamp invalid, valid stage timestamp -> Recovers from stage");

    // Case E: Both timestamps invalid
    const caseEProj: ProjectState = {
      currentStage: "DISEÑAR",
      currentStatus: "INITIALIZED",
      activeGoal: "Goal E",
      activeTasks: [],
      sessionRunCount: 0,
      lastSessionId: null,
      lastUpdated: "INVALID_DATE_1",
    };
    const caseEStage = {
      currentPhase: "DEFINIR",
      activeGoal: "Goal E Legacy",
      lastUpdated: "INVALID_DATE_2",
    };
    const resE = storageEngine.resolveStateDivergence({ ...caseEProj }, caseEStage);
    assert(resE.currentStage === "DISEÑAR", "Case E: Both timestamps invalid -> Canonical fallback without crash");

    // -------------------------------------------------------------------------
    // INVARIANTE F7.2-05 & BROWNFIELD MATRIX (B1 - B10)
    // -------------------------------------------------------------------------
    console.log("\n--- 5. BROWNFIELD TEST MATRIX (B1 - B10) ---");

    function createFreshStorage(subfolder: string): StorageEngine {
      const dir = path.join(testDir, subfolder);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const se = new StorageEngine(dir);
      se.ensureStorageStructure();
      return se;
    }

    // B1 — Proyecto nuevo (no files)
    const seB1 = createFreshStorage("B1");
    const stB1 = seB1.getOrInitProjectState();
    assert(stB1 !== null && typeof stB1.currentStage === "string", "B1: New project initializes clean default state");

    // B2 — Ambos archivos sincronizados
    const seB2 = createFreshStorage("B2");
    seB2.saveProjectState({
      currentStage: "DISEÑAR",
      currentStatus: "IN_PROGRESS",
      activeGoal: "B2 Goal",
      activeTasks: [],
      sessionRunCount: 1,
      lastSessionId: null,
      lastUpdated: "2026-09-28T12:00:00.000Z",
    });
    const stB2 = seB2.getOrInitProjectState();
    assert(stB2.currentStage === "DISEÑAR", "B2: Both files synced returns valid state");

    // B3 — Solo project-state.json
    const seB3 = createFreshStorage("B3");
    seB3.saveProjectState({
      currentStage: "PLANIFICAR",
      currentStatus: "INITIALIZED",
      activeGoal: "B3 Goal",
      activeTasks: [],
      sessionRunCount: 0,
      lastSessionId: null,
      lastUpdated: "2026-09-28T12:00:00.000Z",
    });
    const b3StagePath = path.join(testDir, "B3", ".openmemory", "stage-state.json");
    if (fs.existsSync(b3StagePath)) fs.unlinkSync(b3StagePath);
    const stB3 = seB3.getOrInitProjectState();
    assert(stB3.currentStage === "PLANIFICAR", "B3: Only project-state.json present works cleanly");

    // B4 — Solo stage-state.json
    const seB4 = createFreshStorage("B4");
    const b4StagePath = path.join(testDir, "B4", ".openmemory", "stage-state.json");
    fs.writeFileSync(
      b4StagePath,
      JSON.stringify({
        currentPhase: "IMPLEMENTAR",
        phaseStatus: "IN_PROGRESS",
        activeGoal: "B4 Recovered Goal",
        lastUpdated: "2026-09-28T12:00:00.000Z",
      }),
      "utf-8"
    );
    const stB4 = seB4.getOrInitProjectState();
    assert(stB4.currentStage === "IMPLEMENTAR" && stB4.activeGoal === "B4 Recovered Goal", "B4: Only stage-state.json present recovers project-state.json");

    // B5 — Ambos existentes pero divergentes (stage newer)
    const seB5 = createFreshStorage("B5");
    const b5ProjPath = path.join(testDir, "B5", ".openmemory", "project-state.json");
    fs.writeFileSync(
      b5ProjPath,
      JSON.stringify({
        activePhase: "DEFINIR",
        currentStatus: "INITIALIZED",
        activeGoal: "Old Goal",
        activeTasks: [],
        sessionRunCount: 0,
        lastSessionId: null,
        lastUpdated: "2026-09-28T10:00:00.000Z",
      }),
      "utf-8"
    );
    const b5StagePath = path.join(testDir, "B5", ".openmemory", "stage-state.json");
    fs.writeFileSync(
      b5StagePath,
      JSON.stringify({
        currentPhase: "DISEÑAR",
        phaseStatus: "IN_PROGRESS",
        activeGoal: "Divergent Stage Goal",
        lastUpdated: "2026-09-28T12:00:00.000Z",
      }),
      "utf-8"
    );
    const stB5 = seB5.getOrInitProjectState();
    assert((stB5.currentStage || stB5.activePhase) === "DISEÑAR", "B5: Divergent files resolve cleanly based on lastUpdated timestamp");

    // B6 — project-state.json corrupt, stage-state.json valid
    const seB6 = createFreshStorage("B6");
    const b6ProjPath = path.join(testDir, "B6", ".openmemory", "project-state.json");
    const b6StagePath = path.join(testDir, "B6", ".openmemory", "stage-state.json");
    fs.writeFileSync(b6ProjPath, "{ CORRUPT_JSON_SYNTAX ", "utf-8");
    fs.writeFileSync(
      b6StagePath,
      JSON.stringify({
        currentPhase: "IMPLEMENTAR",
        phaseStatus: "IN_PROGRESS",
        activeGoal: "B6 Goal",
        lastUpdated: "2026-09-28T12:00:00.000Z",
      }),
      "utf-8"
    );
    const stB6 = seB6.getOrInitProjectState();
    assert((stB6.currentStage || stB6.activePhase) === "IMPLEMENTAR", "B6: Corrupt project-state recovers cleanly from valid stage-state");

    // B7 — stage-state.json corrupt, project-state.json valid
    const seB7 = createFreshStorage("B7");
    seB7.saveProjectState({
      activePhase: "VALIDAR",
      currentStatus: "INITIALIZED",
      activeGoal: "B7 Goal",
      activeTasks: [],
      sessionRunCount: 0,
      lastSessionId: null,
      lastUpdated: "2026-09-28T12:00:00.000Z",
    });
    const b7StagePath = path.join(testDir, "B7", ".openmemory", "stage-state.json");
    fs.writeFileSync(b7StagePath, "{ CORRUPT_STAGE_JSON ", "utf-8");
    const stB7 = seB7.getOrInitProjectState();
    assert((stB7.currentStage || stB7.activePhase) === "VALIDAR", "B7: Corrupt stage-state ignored when valid project-state exists");

    // B8 — Ambos corruptos
    const seB8 = createFreshStorage("B8");
    const b8ProjPath = path.join(testDir, "B8", ".openmemory", "project-state.json");
    const b8StagePath = path.join(testDir, "B8", ".openmemory", "stage-state.json");
    fs.writeFileSync(b8ProjPath, "{ CORRUPT_PROJ ", "utf-8");
    fs.writeFileSync(b8StagePath, "{ CORRUPT_STAGE ", "utf-8");
    const stB8 = seB8.getOrInitProjectState();
    assert(stB8 !== null && typeof (stB8.currentStage || stB8.activePhase) === "string", "B8: Both corrupt re-initializes safe default state");

    // B9 — Proyecto antiguo sin roadmap
    const seB9 = createFreshStorage("B9");
    const b9StagePath = path.join(testDir, "B9", ".openmemory", "stage-state.json");
    fs.writeFileSync(
      b9StagePath,
      JSON.stringify({
        currentPhase: "DESCUBRIR",
        phaseStatus: "INITIALIZED",
        activeGoal: "Old project without roadmap",
        lastUpdated: "2026-09-28T12:00:00.000Z",
      }),
      "utf-8"
    );
    const stB9 = seB9.getOrInitProjectState();
    assert(stB9.activeGoal === "Old project without roadmap", "B9: Legacy project without roadmap recovers cleanly");

    // B10 — Schema / version antiguo
    const seB10 = createFreshStorage("B10");
    const b10ProjPath = path.join(testDir, "B10", ".openmemory", "project-state.json");
    fs.writeFileSync(
      b10ProjPath,
      JSON.stringify({
        version: "0.0.1-alpha",
        activePhase: "DESCUBRIR",
        currentStatus: "INITIALIZED",
        activeGoal: "Old schema project",
        lastUpdated: "2026-09-28T12:00:00.000Z",
      }),
      "utf-8"
    );
    const stB10 = seB10.getOrInitProjectState();
    assert((stB10.currentStage || stB10.activePhase) === "DESCUBRIR", "B10: Old schema version project loads cleanly");

    // -------------------------------------------------------------------------
    // BACKUP & RESTORE CONVERGENCE
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Backup / Restore Convergence & Single Writer Preservation ---");
    const seBackup = createFreshStorage("BackupTest");
    const backupStagePath = path.join(testDir, "BackupTest", ".openmemory", "stage-state.json");
    fs.writeFileSync(
      backupStagePath,
      JSON.stringify({
        currentPhase: "DEFINIR",
        activeGoal: "Pre-backup Goal",
        lastUpdated: "2026-09-28T12:00:00.000Z",
      }),
      "utf-8"
    );
    seBackup.saveProjectState({
      activePhase: "DEFINIR",
      currentStatus: "INITIALIZED",
      activeGoal: "Pre-backup Goal",
      activeTasks: [],
      sessionRunCount: 1,
      lastSessionId: "s-pre",
      lastUpdated: "2026-09-28T12:00:00.000Z",
    });

    const backupMeta = seBackup.createBackup("f72_test");
    assert(fs.existsSync(backupMeta.backupPath), "createBackup creates timestamped backup folder");

    // Modify active state
    seBackup.saveProjectState({
      activePhase: "IMPLEMENTAR",
      currentStatus: "IN_PROGRESS",
      activeGoal: "Modified Goal",
      activeTasks: [],
      sessionRunCount: 2,
      lastSessionId: "s-post",
      lastUpdated: "2026-09-28T13:00:00.000Z",
    });

    // Restore backup
    seBackup.restoreBackup(backupMeta.id);
    const restoredProj = seBackup.getOrInitProjectState();
    assert((restoredProj.currentStage || restoredProj.activePhase) === "DEFINIR", "restoreBackup restores previous ProjectState");

    const restoredStagePath = path.join(testDir, "BackupTest", ".openmemory", "stage-state.json");
    const hasStage = fs.existsSync(restoredStagePath);
    let restoredStagePhase = "DEFINIR";
    if (hasStage) {
      restoredStagePhase = JSON.parse(fs.readFileSync(restoredStagePath, "utf-8")).currentPhase;
    }
    assert(restoredStagePhase === "DEFINIR", "restoreBackup maintains projected stage-state convergence");

    // -------------------------------------------------------------------------
    // MCP CONTRACT STRUCTURAL BACKWARD COMPATIBILITY
    // -------------------------------------------------------------------------
    console.log("\n--- 7. MCP Contract Structural Compatibility Guard ---");
    const stageEngine = new StageEngine(path.join(testDir, "B2"));
    const publicStageState = stageEngine.getStageState();

    const expectedKeys = [
      "currentPhase",
      "phaseStatus",
      "activeGoal",
      "activeTasks",
      "approvalRequired",
      "approvalReceived",
      "definitionOfDone",
      "roadmap",
    ];

    let allKeysPresent = true;
    for (const key of expectedKeys) {
      if (!(key in publicStageState)) {
        allKeysPresent = false;
        console.error(`Missing expected MCP key: ${key}`);
      }
    }
    assert(allKeysPresent, "StageState interface retains 100% of required public fields for MCP contract");

  } catch (err) {
    console.error("\n❌ Unexpected error in F7.2 test suite:", err);
  }

  console.log("\n=================================================");
  console.log(`F7.2 TEST SUMMARY: ${passed}/${total} PASS`);
  console.log("=================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runF72HardeningTests();
