import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { StorageEngine } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";
import { OpenMemoryPlugin } from "../../.opencode/plugins/openmemory";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Test assertion failed: ${message}`);
  }
}

export async function runMasterPromptGovernanceTests(): Promise<void> {
  console.log("=================================================");
  console.log("   OpenMemory Master Prompt Governance Test Suite ");
  console.log("=================================================\n");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmemory-master-prompt-test-"));

  try {
    const storage = new StorageEngine(tmpDir);
    const stageEngine = new StageEngine(tmpDir);

    // -------------------------------------------------------------
    // Test 1: A new project begins in DESCUBRIR
    // -------------------------------------------------------------
    const initialState = stageEngine.getStageState();
    assert(initialState.currentPhase === "DESCUBRIR", `New project phase should be DESCUBRIR (actual: ${initialState.currentPhase})`);
    assert(initialState.phaseStatus === "IN_PROGRESS", `New project phase status should be IN_PROGRESS (actual: ${initialState.phaseStatus})`);
    console.log("[PASSED] Test 1: New project begins in DESCUBRIR phase");

    // -------------------------------------------------------------
    // Test 2: OpenCode can work inside DESCUBRIR (task updates, context summaries)
    // -------------------------------------------------------------
    initialState.activeGoal = "Descubrir requerimientos de la nueva tienda web";
    initialState.activeTasks = [
      { id: "TASK-1", description: "Entrevistar stakeholder", status: "COMPLETED" },
      { id: "TASK-2", description: "Analizar contexto existente", status: "IN_PROGRESS" },
    ];
    stageEngine.saveStageState(initialState);

    const updated = stageEngine.getStageState();
    assert(updated.activeTasks.length === 2, "Tasks should be saved in DESCUBRIR phase");
    assert(stageEngine.canModifyProductionCode() === false, "Production code modification MUST be forbidden in DESCUBRIR");
    console.log("[PASSED] Test 2: Agent can perform discovery tasks within DESCUBRIR without code modification permissions");

    // -------------------------------------------------------------
    // Test 3: System CANNOT automatically advance to DEFINIR without approval
    // -------------------------------------------------------------
    assert(stageEngine.canModifyProductionCode() === false, "Production code editing must be blocked");
    let tryJumpError = false;
    try {
      stageEngine.startStage("DEFINIR");
    } catch (err) {
      tryJumpError = true;
    }
    assert(tryJumpError, "Direct startStage('DEFINIR') without prior phase approval must throw an error");
    console.log("[PASSED] Test 3: System cannot advance to DEFINIR without approval");

    // -------------------------------------------------------------
    // Test 4: Completing DESCUBRIR generates phase report
    // -------------------------------------------------------------
    const reportState = stageEngine.completeStage({
      summary: "Descubrimiento inicial completado. Alcance de tienda web identificado.",
      activitiesDone: ["Entrevista de stakeholder", "Análisis de dominio"],
      evidenceProduced: ["docs/discovery-summary.md"],
      pendingItems: ["Definir requerimientos funcionales exactos"],
    });

    assert(reportState.phaseReport !== null, "Phase report must be generated on completion");
    assert(reportState.phaseReport?.phaseId === "DESCUBRIR", "Phase report ID must be DESCUBRIR");
    assert(reportState.phaseReport?.dodVerified === true, "DoD verified should be true");
    console.log("[PASSED] Test 4: Completing DESCUBRIR generates structured phase report");

    // -------------------------------------------------------------
    // Test 5: System enters AWAITING_APPROVAL status
    // -------------------------------------------------------------
    assert(reportState.phaseStatus === "AWAITING_APPROVAL", `Phase status must be AWAITING_APPROVAL (actual: ${reportState.phaseStatus})`);
    assert(reportState.approvalRequired === true, "approvalRequired flag must be true");
    assert(reportState.approvalReceived === false, "approvalReceived flag must be false");
    console.log("[PASSED] Test 5: System enters AWAITING_APPROVAL state upon stage completion");

    // -------------------------------------------------------------
    // Test 6: Without approval, phase transition remains blocked
    // -------------------------------------------------------------
    const currentState = stageEngine.getStageState();
    assert(currentState.currentPhase === "DESCUBRIR", "Phase must remain DESCUBRIR while awaiting approval");
    assert(stageEngine.canModifyProductionCode() === false, "Code modification must remain blocked");
    console.log("[PASSED] Test 6: Transition remains blocked without human approval");

    // -------------------------------------------------------------
    // Test 7: With approval (approveStage), state transitions to DEFINIR
    // -------------------------------------------------------------
    const approvedState = stageEngine.approveStage("Aprobado por el usuario el paso a DEFINIR");
    assert(approvedState.currentPhase === "DEFINIR", `Phase should transition to DEFINIR (actual: ${approvedState.currentPhase})`);
    assert(approvedState.phaseStatus === "IN_PROGRESS", `New phase status should be IN_PROGRESS (actual: ${approvedState.phaseStatus})`);
    assert(approvedState.approvalReceived === false, "approvalReceived flag should reset for new phase");
    console.log("[PASSED] Test 7: With human gate approval, state advances to DEFINIR");

    // -------------------------------------------------------------
    // Test 8: A new session recovers DEFINIR and does NOT reset phase
    // -------------------------------------------------------------
    const plugin = await OpenMemoryPlugin({
      directory: tmpDir,
      client: {} as any,
      project: "TestProject",
      $: {} as any,
      worktree: tmpDir,
    });

    // Fire session.created event
    await plugin.event!({
      event: { type: "session.created", session: { id: "session-recovery-test" } },
    });

    const recoveredStage = stageEngine.getStageState();
    assert(recoveredStage.currentPhase === "DEFINIR", `Session recovery must preserve DEFINIR (actual: ${recoveredStage.currentPhase})`);
    assert(recoveredStage.lastSessionId === "session-recovery-test", "Last session ID should be updated");
    console.log("[PASSED] Test 8: New session recovers DEFINIR and does NOT reset phase");

    // -------------------------------------------------------------
    // Test 9: IMPLEMENTAR is blocked before reaching that phase
    // -------------------------------------------------------------
    assert(stageEngine.canModifyProductionCode() === false, "Production code editing must be blocked in DEFINIR");
    console.log("[PASSED] Test 9: Production code implementation is strictly blocked outside IMPLEMENTAR phase");

    // -------------------------------------------------------------
    // Test 10: Cannot skip phases (e.g. DEFINIR direct to IMPLEMENTAR)
    // -------------------------------------------------------------
    let skipError = false;
    try {
      stageEngine.startStage("IMPLEMENTAR");
    } catch (err) {
      skipError = true;
    }
    assert(skipError, "Attempting to skip from DEFINIR directly to IMPLEMENTAR must throw an error");
    console.log("[PASSED] Test 10: Cannot skip intermediate phases");

    // -------------------------------------------------------------
    // Test 11: Rejecting a phase transition maintains/returns state for rework
    // -------------------------------------------------------------
    stageEngine.completeStage({ summary: "Definición completada." });
    const rejectedState = stageEngine.rejectStage("Requerimientos incompletos, re-trabajar.");
    assert(rejectedState.phaseStatus === "REJECTED", `State should be REJECTED (actual: ${rejectedState.phaseStatus})`);
    assert(rejectedState.currentPhase === "DEFINIR", "Phase must remain DEFINIR upon rejection");
    console.log("[PASSED] Test 11: Human gate rejection returns state to rework status in current phase");

    // -------------------------------------------------------------
    // Test 12: Handoff represents current project goal and tasks
    // -------------------------------------------------------------
    await plugin.event!({
      event: { type: "session.compacted" },
    });

    const handoff = storage.getOrInitHandoff();
    assert(!handoff.includes("F3.1 Storage Engine"), "Handoff must not include stale OpenMemory internal dev text for client projects");
    assert(handoff.includes("DEFINIR") || handoff.includes("Fase activa") || handoff.includes("Requerimientos"), "Handoff must include project-specific stage context");
    console.log("[PASSED] Test 12: Session handoff dynamically represents current project context");

    // -------------------------------------------------------------
    // Test 13: Stage state survives session restart
    // -------------------------------------------------------------
    // Advance DEFINIR -> INVESTIGAR -> COMPARAR -> DISEÑAR -> PLANIFICAR -> IMPLEMENTAR
    stageEngine.approveStage("Approve DEFINIR");
    stageEngine.completeStage({ summary: "Investigación lista" });
    stageEngine.approveStage("Approve INVESTIGAR");
    stageEngine.completeStage({ summary: "Comparación lista" });
    stageEngine.approveStage("Approve COMPARAR");
    stageEngine.completeStage({ summary: "Diseño listo" });
    stageEngine.approveStage("Approve DISEÑAR");
    stageEngine.completeStage({ summary: "Planificación lista" });
    stageEngine.approveStage("Approve PLANIFICAR");

    const implementState = stageEngine.getStageState();
    assert(implementState.currentPhase === "IMPLEMENTAR", `State should be IMPLEMENTAR (actual: ${implementState.currentPhase})`);
    assert(stageEngine.canModifyProductionCode() === true, "Production code editing MUST be permitted when IMPLEMENTAR is active & IN_PROGRESS");

    // Simulate new session startup
    await plugin.event!({
      event: { type: "session.created", session: { id: "session-implement-restart" } },
    });

    const restartedStage = stageEngine.getStageState();
    assert(restartedStage.currentPhase === "IMPLEMENTAR", "Stage state must survive session restart");
    assert(stageEngine.canModifyProductionCode() === true, "Code editing remains allowed after session restart in IMPLEMENTAR");
    console.log("[PASSED] Test 13: State machine survives session restart and enables IMPLEMENTAR when active");

    // -------------------------------------------------------------
    // Test 14: Existing OpenMemory storage primitives are preserved
    // -------------------------------------------------------------
    const manifest = storage.getOrInitManifest();
    assert(manifest.version === "0.1.0", "Manifest version preserved");
    const projState = storage.getOrInitProjectState();
    assert(projState.activePhase === "IMPLEMENTAR", "ProjectState activePhase synced with StageEngine");
    console.log("[PASSED] Test 14: Storage primitives and backward compatibility preserved");

    console.log("\n=================================================");
    console.log("   All 14 Master Prompt Governance Tests PASSED! ");
    console.log("=================================================\n");

  } finally {
    // Cleanup temporary test directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

if (require.main === module) {
  runMasterPromptGovernanceTests().catch((err) => {
    console.error("Master Prompt Governance Test Failure:", err);
    process.exit(1);
  });
}
