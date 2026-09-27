import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[INVARIANT AUDIT FAILED] ${message}`);
    throw new Error(`Invariant Assertion Failed: ${message}`);
  }
}

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASSED] ${name}`);
  } catch (err) {
    console.error(`[FAILED] ${name}:`, (err as Error).message);
    process.exit(1);
  }
}

const tmpDir = path.join(process.cwd(), ".work", "experiments", "tmp-f62-invariants");

function cleanupTmp() {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

cleanupTmp();
fs.mkdirSync(tmpDir, { recursive: true });

console.log("=================================================");
console.log("   OpenMemory F6.2 Invariants & Hardening Suite");
console.log("=================================================\n");

// Invariant 1: activePhaseId points to a valid, existing Phase
runTest("Invariant 1: activePhaseId always points to an existing Phase", () => {
  const engine = new StageEngine(tmpDir);
  const state = engine.getStageState();
  const activePhase = state.roadmap?.phases.find((p) => p.id === state.roadmap?.activePhaseId);
  assert(activePhase !== undefined, "activePhaseId must match a phase in roadmap.phases");
});

// Invariant 2: No two Phases are IN_PROGRESS simultaneously
runTest("Invariant 2: No two Phases are IN_PROGRESS simultaneously", () => {
  const engine = new StageEngine(tmpDir);
  // Advance through workflow to complete PHASE-1 and start PHASE-2
  engine.completeStage({ summary: "Done DESCUBRIR" });
  engine.approveStage(); // DEFINIR
  engine.completeStage({ summary: "Done DEFINIR" });
  engine.approveStage(); // INVESTIGAR
  engine.completeStage({ summary: "Done INVESTIGAR" });
  engine.approveStage(); // COMPARAR
  engine.completeStage({ summary: "Done COMPARAR" });
  engine.approveStage(); // DISEÑAR
  engine.completeStage({ summary: "Done DISEÑAR" });
  engine.approveStage(); // PLANIFICAR
  engine.completeStage({ summary: "Done PLANIFICAR" });
  engine.approveStage(); // IMPLEMENTAR
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
  engine.completeStage({ summary: "Done PREPARAR_CONTINUIDAD" });
  engine.approvePhase("PHASE-1"); // Advance to PHASE-2

  const roadmap = engine.getRoadmap();
  const inProgressPhases = roadmap.phases.filter((p) => p.status === "IN_PROGRESS");
  assert(inProgressPhases.length === 1, `Expected exactly 1 IN_PROGRESS phase, found ${inProgressPhases.length}`);
  assert(inProgressPhases[0].id === "PHASE-2", "Only PHASE-2 is IN_PROGRESS");
});

// Invariant 3: COMPLETED Phase cannot be modified or re-approved/re-rejected
runTest("Invariant 3: COMPLETED Phase cannot be re-approved or re-rejected", () => {
  const engine = new StageEngine(tmpDir);

  let approveError = false;
  try {
    engine.approvePhase("PHASE-1");
  } catch (err) {
    approveError = true;
    assert((err as Error).message.includes("completada previamente"), "re-approving COMPLETED phase throws error");
  }
  assert(approveError, "Error caught for re-approving COMPLETED phase");

  let rejectError = false;
  try {
    engine.rejectPhase("PHASE-1");
  } catch (err) {
    rejectError = true;
    assert((err as Error).message.includes("completada"), "re-rejecting COMPLETED phase throws error");
  }
  assert(rejectError, "Error caught for re-rejecting COMPLETED phase");
});

// Invariant 4 & 5: AWAITING_HUMAN_APPROVAL does not auto-advance to PHASE-3
runTest("Invariant 4 & 5: AWAITING_HUMAN_APPROVAL does not auto-advance", () => {
  const engine = new StageEngine(tmpDir);
  // We are in PHASE-2
  engine.completeStage({ summary: "Done DESCUBRIR P2" });
  engine.approveStage(); // DEFINIR P2
  engine.completeStage({ summary: "Done DEFINIR P2" });
  engine.approveStage(); // INVESTIGAR P2
  engine.completeStage({ summary: "Done INVESTIGAR P2" });
  engine.approveStage(); // COMPARAR P2
  engine.completeStage({ summary: "Done COMPARAR P2" });
  engine.approveStage(); // DISEÑAR P2
  engine.completeStage({ summary: "Done DISEÑAR P2" });
  engine.approveStage(); // PLANIFICAR P2
  engine.completeStage({ summary: "Done PLANIFICAR P2" });
  engine.approveStage(); // IMPLEMENTAR P2
  engine.completeStage({ summary: "Done IMPLEMENTAR P2" });
  engine.approveStage(); // VALIDAR P2
  engine.completeStage({ summary: "Done VALIDAR P2" });
  engine.approveStage(); // EVALUAR P2
  engine.completeStage({ summary: "Done EVALUAR P2" });
  engine.approveStage(); // CONSOLIDAR P2
  engine.completeStage({ summary: "Done CONSOLIDAR P2" });
  engine.approveStage(); // ACTUALIZAR_MEMORIA P2
  engine.completeStage({ summary: "Done ACTUALIZAR_MEMORIA P2" });
  engine.approveStage(); // PREPARAR_CONTINUIDAD P2

  const state = engine.completeStage({ summary: "Done PREPARAR_CONTINUIDAD P2" });
  assert(state.roadmap?.activePhaseId === "PHASE-2", "Active phase is still PHASE-2");
  const p2 = state.roadmap?.phases.find((p) => p.id === "PHASE-2");
  assert(p2?.status === "AWAITING_HUMAN_APPROVAL", "PHASE-2 is in AWAITING_HUMAN_APPROVAL");
  assert(state.roadmap?.phases.find((p) => p.id === "PHASE-3") === undefined, "PHASE-3 has NOT been auto-created or auto-activated");
});

// Invariant 6 & 7: canModifyProductionCode ONLY in IN_PROGRESS + IMPLEMENTAR
runTest("Invariant 6 & 7: Code edit restrictions during AWAITING_HUMAN_APPROVAL & REJECTED", () => {
  const engine = new StageEngine(tmpDir);
  assert(engine.canModifyProductionCode() === false, "canModifyProductionCode is false in AWAITING_HUMAN_APPROVAL");

  engine.rejectPhase("PHASE-2", "Rework needed in P2");
  assert(engine.canModifyProductionCode() === false, "canModifyProductionCode is false in REJECTED status");
});

// Invariant 8 & 9: OSS Evaluation scoping and BUILD_CUSTOM justification
runTest("Invariant 8 & 9: OSS Evaluation scoping prevents cross-phase leakage", () => {
  const storage = new StorageEngine(tmpDir);
  const engine = new StageEngine(tmpDir);

  // Save OSS evaluation bound to PHASE-1
  storage.saveOSSEvaluation({
    capabilityName: "Ledger Module",
    phaseId: "PHASE-1",
    decision: "BUILD_CUSTOM",
    investigatedAlternatives: [{ name: "OpenLedger", rationale: "Incompatible license" }],
    customBuildJustification: "Strict compliance audit requirement for financial core",
  });

  // Verify against PHASE-1 -> passes
  const checkPhase1 = engine.verifyOSSEvaluation("Ledger Module", "PHASE-1");
  assert(checkPhase1.verified === true, "OSS evaluation passes for PHASE-1");

  // Verify against PHASE-2 -> fails due to cross-phase scope mismatch
  const checkPhase2 = engine.verifyOSSEvaluation("Ledger Module", "PHASE-2");
  assert(checkPhase2.verified === false, "OSS evaluation for PHASE-1 fails when checked against PHASE-2");
});

// Invariant 10: Non-existent phaseId throws explicit error and does not mutate active phase
runTest("Invariant 10: Invalid phaseId rejected cleanly without fallback corruption", () => {
  const engine = new StageEngine(tmpDir);

  let errorCount = 0;
  try {
    engine.approvePhase("PHASE-9999");
  } catch (err) {
    errorCount++;
    assert((err as Error).message.includes("no existe"), "Explicit error for invalid phaseId");
  }
  assert(errorCount === 1, "Caught error for invalid approvePhase ID");

  const state = engine.getStageState();
  assert(state.roadmap?.activePhaseId === "PHASE-2", "activePhaseId intact and uncorrupted");
});

// Invariant 11: completeStage & startStage state locks during AWAITING_HUMAN_APPROVAL
runTest("Invariant 11: completeStage & startStage blocked during AWAITING_HUMAN_APPROVAL", () => {
  const engine = new StageEngine(tmpDir);
  const state = engine.getStageState();

  // Set PHASE-2 to AWAITING_HUMAN_APPROVAL
  const activeP2 = state.roadmap?.phases.find((p) => p.id === "PHASE-2");
  if (activeP2) activeP2.status = "AWAITING_HUMAN_APPROVAL";
  engine.saveStageState(state);

  let completeErr = false;
  try {
    engine.completeStage({ summary: "Try complete while awaiting approval" });
  } catch (err) {
    completeErr = true;
    assert((err as Error).message.includes("AWAITING_HUMAN_APPROVAL"), "completeStage blocked in AWAITING_HUMAN_APPROVAL");
  }
  assert(completeErr, "Caught error for completeStage in AWAITING_HUMAN_APPROVAL");

  let startErr = false;
  try {
    engine.startStage("IMPLEMENTAR");
  } catch (err) {
    startErr = true;
    assert((err as Error).message.includes("AWAITING_HUMAN_APPROVAL"), "startStage blocked in AWAITING_HUMAN_APPROVAL");
  }
  assert(startErr, "Caught error for startStage in AWAITING_HUMAN_APPROVAL");
});

// Persistence & Restart Audit across multiple StageEngine instances
runTest("Persistence & Instance Destruction Recovery Audit", () => {
  const restartDir = path.join(tmpDir, "restart-test");
  fs.mkdirSync(restartDir, { recursive: true });

  // Instance 1: Advance to IMPLEMENTAR
  {
    const e1 = new StageEngine(restartDir);
    e1.startStage("DESCUBRIR");
    e1.completeStage({ summary: "Done DESCUBRIR" });
    e1.approveStage(); // DEFINIR
    e1.completeStage({ summary: "Done DEFINIR" });
    e1.approveStage(); // INVESTIGAR
    e1.completeStage({ summary: "Done INVESTIGAR" });
    e1.approveStage(); // COMPARAR
    e1.completeStage({ summary: "Done COMPARAR" });
    e1.approveStage(); // DISEÑAR
    e1.completeStage({ summary: "Done DISEÑAR" });
    e1.approveStage(); // PLANIFICAR
    e1.completeStage({ summary: "Done PLANIFICAR" });
    e1.approveStage(); // IMPLEMENTAR
    assert(e1.canModifyProductionCode() === true, "Instance 1 can modify code in IMPLEMENTAR");
  }

  // Instance 2: Destroy e1, instantiate e2 on same directory -> check state recovery
  {
    const e2 = new StageEngine(restartDir);
    const s2 = e2.getStageState();
    assert(s2.currentPhase === "IMPLEMENTAR", "Instance 2 recovered IMPLEMENTAR stage from disk");
    assert(s2.roadmap?.activePhaseId === "PHASE-1", "Instance 2 recovered activePhaseId PHASE-1");
    assert(e2.canModifyProductionCode() === true, "Instance 2 recovered canModifyProductionCode === true");

    // Advance to PREPARAR_CONTINUIDAD -> complete -> AWAITING_HUMAN_APPROVAL
    e2.completeStage({ summary: "Done IMPLEMENTAR" });
    e2.approveStage(); // VALIDAR
    e2.completeStage({ summary: "Done VALIDAR" });
    e2.approveStage(); // EVALUAR
    e2.completeStage({ summary: "Done EVALUAR" });
    e2.approveStage(); // CONSOLIDAR
    e2.completeStage({ summary: "Done CONSOLIDAR" });
    e2.approveStage(); // ACTUALIZAR_MEMORIA
    e2.completeStage({ summary: "Done ACTUALIZAR_MEMORIA" });
    e2.approveStage(); // PREPARAR_CONTINUIDAD
    e2.completeStage({ summary: "Done PREPARAR_CONTINUIDAD" });
  }

  // Instance 3: Destroy e2, instantiate e3 on same directory -> check AWAITING_HUMAN_APPROVAL recovery
  {
    const e3 = new StageEngine(restartDir);
    const s3 = e3.getStageState();
    assert(s3.roadmap?.phases[0].status === "AWAITING_HUMAN_APPROVAL", "Instance 3 recovered AWAITING_HUMAN_APPROVAL");
    assert(e3.canModifyProductionCode() === false, "Instance 3 recovered canModifyProductionCode === false");

    // Reject Phase 1 -> REJECTED
    e3.rejectPhase("PHASE-1", "Needs fix");
  }

  // Instance 4: Destroy e3, instantiate e4 -> check REJECTED recovery
  {
    const e4 = new StageEngine(restartDir);
    const s4 = e4.getStageState();
    assert(s4.roadmap?.phases[0].status === "REJECTED", "Instance 4 recovered REJECTED status from disk");
    assert(e4.canModifyProductionCode() === false, "Instance 4 recovered canModifyProductionCode === false");
  }
});

cleanupTmp();

console.log("\n=================================================");
console.log("   F6.2 Invariants & Hardening Suite COMPLETED!");
console.log("=================================================");
