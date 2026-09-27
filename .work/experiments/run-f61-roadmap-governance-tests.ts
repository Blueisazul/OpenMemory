import * as fs from "fs";
import * as path from "path";
import { StorageEngine, OSSEvaluationRecord } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASSED] ${name}`);
  } catch (err) {
    console.error(`[FAILED] ${name}:`, (err as Error).message);
    process.exit(1);
  }
}

const tmpDir = path.join(process.cwd(), ".work", "experiments", "tmp-f61-test");

function cleanupTmp() {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

cleanupTmp();
fs.mkdirSync(tmpDir, { recursive: true });

console.log("=================================================");
console.log("   OpenMemory F6.1 Roadmap & OSS Governance Suite");
console.log("=================================================\n");

// F6.1-001: Auto-migration of legacy state
runTest("F6.1-001: Auto-migration of legacy state to Roadmap structure", () => {
  const openmemoryDir = path.join(tmpDir, ".openmemory");
  fs.mkdirSync(openmemoryDir, { recursive: true });

  // Write legacy stage-state.json without roadmap
  const legacyState = {
    projectName: "LegacyTestProject",
    currentPhase: "INVESTIGAR",
    phaseStatus: "IN_PROGRESS",
    activeGoal: "Investigate legacy migration",
    activeTasks: [],
    definitionOfDone: [],
    phaseReport: null,
    approvalRequired: false,
    approvalReceived: false,
    nextPhase: "COMPARAR",
    lastSessionId: "legacy-session",
    lastUpdated: new Date().toISOString(),
    history: [],
  };
  fs.writeFileSync(path.join(openmemoryDir, "stage-state.json"), JSON.stringify(legacyState, null, 2));

  const engine = new StageEngine(tmpDir);
  const state = engine.getStageState();

  if (!state.roadmap) {
    throw new Error("Roadmap missing after legacy state load.");
  }
  if (state.roadmap.activePhaseId !== "PHASE-1") {
    throw new Error(`Expected activePhaseId to be PHASE-1, got ${state.roadmap.activePhaseId}`);
  }
  if (state.roadmap.phases.length !== 1) {
    throw new Error(`Expected 1 phase in roadmap, got ${state.roadmap.phases.length}`);
  }
  if (state.currentPhase !== "INVESTIGAR") {
    throw new Error(`Expected currentPhase to be preserved as INVESTIGAR, got ${state.currentPhase}`);
  }
});

// F6.1-002: Code Governance lock check
runTest("F6.1-002: Strict canModifyProductionCode enforcement", () => {
  const engine = new StageEngine(tmpDir);

  // Currently in INVESTIGAR
  if (engine.canModifyProductionCode() !== false) {
    throw new Error("canModifyProductionCode should be false when in INVESTIGAR stage.");
  }

  // Advance sequentially to IMPLEMENTAR
  engine.completeStage({ summary: "Done INVESTIGAR" });
  engine.approveStage(); // COMPARAR
  engine.completeStage({ summary: "Done COMPARAR" });
  engine.approveStage(); // DISEÑAR
  engine.completeStage({ summary: "Done DISEÑAR" });
  engine.approveStage(); // PLANIFICAR
  engine.completeStage({ summary: "Done PLANIFICAR" });
  engine.approveStage(); // IMPLEMENTAR

  if (engine.canModifyProductionCode() !== true) {
    throw new Error("canModifyProductionCode should be true when in IMPLEMENTAR stage and phase IN_PROGRESS.");
  }

  // Reject phase -> status becomes REJECTED
  engine.rejectPhase("PHASE-1", "Needs revision");
  if (engine.canModifyProductionCode() !== false) {
    throw new Error("canModifyProductionCode should be false when active phase is REJECTED.");
  }

  // Resume phase
  engine.startPhase("PHASE-1");
  if (engine.canModifyProductionCode() !== true) {
    throw new Error("canModifyProductionCode should be true after resuming phase into IMPLEMENTAR.");
  }
});

// F6.1-003: Internal workflow completion stops at AWAITING_HUMAN_APPROVAL at PREPARAR_CONTINUIDAD
runTest("F6.1-003: Internal workflow completion stops at Human Gate", () => {
  const engine = new StageEngine(tmpDir);
  // Advance through remaining stages to PREPARAR_CONTINUIDAD
  engine.completeStage({ summary: "Done IMPLEMENTAR" });
  engine.approveStage(); // VALIDAR
  engine.completeStage({ summary: "Done VALIDAR" });
  engine.approveStage(); // EVALUAR
  engine.completeStage({ summary: "Done EVALUAR" });
  engine.approveStage(); // CONSOLIDAR
  engine.completeStage({ summary: "Done CONSOLIDAR" });
  engine.approveStage(); // ACTUALIZAR_MEMORIA
  engine.completeStage({ summary: "Done ACTUALIZAR_MEMORIA" });
  engine.approveStage(); // PREPARAR_CONTINUIDAD

  const state = engine.completeStage({
    summary: "Workflow completed for Phase 1",
    evidenceProduced: ["handoff.md", "backup.json"],
  });

  const activePhase = state.roadmap?.phases.find((p) => p.id === state.roadmap?.activePhaseId);
  if (activePhase?.status !== "AWAITING_HUMAN_APPROVAL") {
    throw new Error(`Expected RoadmapPhase status to be AWAITING_HUMAN_APPROVAL, got ${activePhase?.status}`);
  }
  if (state.phaseStatus !== "AWAITING_APPROVAL") {
    throw new Error(`Expected stage phaseStatus to be AWAITING_APPROVAL, got ${state.phaseStatus}`);
  }
});

// F6.1-004: Human Gate Rejection keeps Phase in rework
runTest("F6.1-004: Human Gate Rejection retains phase in rework status", () => {
  const engine = new StageEngine(tmpDir);
  const state = engine.rejectPhase("PHASE-1", "Entregables incompletos");

  const activePhase = state.roadmap?.phases.find((p) => p.id === "PHASE-1");
  if (activePhase?.status !== "REJECTED") {
    throw new Error(`Expected phase status to be REJECTED, got ${activePhase?.status}`);
  }
});

// F6.1-005: Human Gate Approval advances to PHASE-2
runTest("F6.1-005: Human Gate Approval advances to PHASE-2", () => {
  const engine = new StageEngine(tmpDir);
  const state = engine.approvePhase("PHASE-1", "Phase 1 aprobada por usuario");

  if (state.roadmap?.activePhaseId !== "PHASE-2") {
    throw new Error(`Expected activePhaseId to be PHASE-2, got ${state.roadmap?.activePhaseId}`);
  }

  const phase1 = state.roadmap?.phases.find((p) => p.id === "PHASE-1");
  if (phase1?.status !== "COMPLETED") {
    throw new Error(`Expected PHASE-1 to be COMPLETED, got ${phase1?.status}`);
  }

  const phase2 = state.roadmap?.phases.find((p) => p.id === "PHASE-2");
  if (phase2?.status !== "IN_PROGRESS") {
    throw new Error(`Expected PHASE-2 to be IN_PROGRESS, got ${phase2?.status}`);
  }

  if (state.currentPhase !== "DESCUBRIR") {
    throw new Error(`Expected internal workflow of PHASE-2 to start at DESCUBRIR, got ${state.currentPhase}`);
  }
});

// F6.1-006: Verifiable OSS Governance recording and verification
runTest("F6.1-006: Verifiable OSS Governance evaluation", () => {
  const storage = new StorageEngine(tmpDir);
  const engine = new StageEngine(tmpDir);

  const evalRecord = storage.saveOSSEvaluation({
    capabilityName: "Storage Backup Component",
    decision: "ADOPT_EXISTING",
    investigatedAlternatives: [
      {
        name: "tar-stream",
        repositoryUrl: "https://github.com/mafintosh/tar-stream",
        license: "MIT",
        maintenanceStatus: "Active",
        rationale: "Mature stream-based tar implementation in JS",
      },
    ],
    approvedByHuman: true,
  });

  if (!evalRecord.id.startsWith("OSS-")) {
    throw new Error(`Expected OSS evaluation ID to start with OSS-, got ${evalRecord.id}`);
  }

  const verification = engine.verifyOSSEvaluation("Storage Backup Component");
  if (!verification.verified) {
    throw new Error(`Expected OSS evaluation to be verified, got message: ${verification.message}`);
  }
});

cleanupTmp();

console.log("\n=================================================");
console.log("   F6.1 Roadmap & OSS Suite Completed Successfully!");
console.log("=================================================");
