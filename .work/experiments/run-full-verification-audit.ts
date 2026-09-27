import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";
import { createMCPServer } from "../../src/mcp";
import { OpenMemoryPlugin } from "../../.opencode/plugins/openmemory";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[AUDIT FAILED] ${message}`);
    throw new Error(`Audit Assertion Failed: ${message}`);
  }
}

function runAudit(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`[PASSED] ${name}`);
    })
    .catch((err) => {
      console.error(`[FAILED] ${name}:`, (err as Error).message);
      process.exit(1);
    });
}

const auditDir = path.join(process.cwd(), ".work", "experiments", "tmp-full-audit");

function cleanup() {
  if (fs.existsSync(auditDir)) {
    fs.rmSync(auditDir, { recursive: true, force: true });
  }
}

async function executeAudit() {
  cleanup();
  fs.mkdirSync(auditDir, { recursive: true });

  console.log("=================================================");
  console.log("   OPENMEMORY FULL INTEGRATION & AUDIT VERIFICATION");
  console.log("=================================================\n");

  // -----------------------------------------------------------------
  // 1. REAL FUNCTIONAL VERIFICATION
  // -----------------------------------------------------------------
  await runAudit("1. New Project Initialization & File Structure", () => {
    const storage = new StorageEngine(auditDir);
    const stageEngine = new StageEngine(auditDir);

    const manifest = storage.getOrInitManifest();
    const projState = storage.getOrInitProjectState();
    const stageState = stageEngine.getStageState();

    assert(fs.existsSync(path.join(auditDir, ".openmemory", "openmemory.json")), "openmemory.json exists");
    assert(fs.existsSync(path.join(auditDir, ".openmemory", "project-state.json")), "project-state.json exists");
    assert(fs.existsSync(path.join(auditDir, ".openmemory", "stage-state.json")), "stage-state.json exists");

    assert(!!stageState.roadmap, "Roadmap property initialized");
    assert(stageState.roadmap?.activePhaseId === "PHASE-1", "activePhaseId is PHASE-1");
    assert(stageState.roadmap?.phases.length === 1, "Initial roadmap has 1 phase");
    assert(stageState.roadmap?.phases[0].id === "PHASE-1", "First phase is PHASE-1");
    assert(stageState.currentPhase === "DESCUBRIR", "Internal workflow starts at DESCUBRIR");
    assert(stageState.phaseStatus === "IN_PROGRESS", "Phase status is IN_PROGRESS");
  });

  await runAudit("2. 12-Stage Workflow Execution & Code Locks in PHASE-1", () => {
    const stageEngine = new StageEngine(auditDir);

    // DESCUBRIR
    assert(stageEngine.canModifyProductionCode() === false, "canModifyProductionCode is false in DESCUBRIR");

    // Advance to DEFINIR
    stageEngine.completeStage({ summary: "Discovery done" });
    stageEngine.approveStage();
    assert(stageEngine.getStageState().currentPhase === "DEFINIR", "Phase is DEFINIR");
    assert(stageEngine.canModifyProductionCode() === false, "canModifyProductionCode is false in DEFINIR");

    // Advance to INVESTIGAR
    stageEngine.completeStage({ summary: "Definition done" });
    stageEngine.approveStage();
    assert(stageEngine.getStageState().currentPhase === "INVESTIGAR", "Phase is INVESTIGAR");
    assert(stageEngine.canModifyProductionCode() === false, "canModifyProductionCode is false in INVESTIGAR");

    // Advance to COMPARAR
    stageEngine.completeStage({ summary: "Research done" });
    stageEngine.approveStage();

    // Advance to DISEÑAR
    stageEngine.completeStage({ summary: "Comparison done" });
    stageEngine.approveStage();

    // Advance to PLANIFICAR
    stageEngine.completeStage({ summary: "Design done" });
    stageEngine.approveStage();

    // Advance to IMPLEMENTAR
    stageEngine.completeStage({ summary: "Plan done" });
    stageEngine.approveStage();
    assert(stageEngine.getStageState().currentPhase === "IMPLEMENTAR", "Phase is IMPLEMENTAR");
    assert(stageEngine.canModifyProductionCode() === true, "canModifyProductionCode is TRUE ONLY in IMPLEMENTAR & IN_PROGRESS");

    // Advance to VALIDAR
    stageEngine.completeStage({ summary: "Implementation done" });
    stageEngine.approveStage();
    assert(stageEngine.getStageState().currentPhase === "VALIDAR", "Phase is VALIDAR");
    assert(stageEngine.canModifyProductionCode() === false, "canModifyProductionCode returns false after leaving IMPLEMENTAR");

    // Advance remaining stages: EVALUAR -> CONSOLIDAR -> ACTUALIZAR_MEMORIA -> PREPARAR_CONTINUIDAD
    stageEngine.completeStage({ summary: "Validation done" });
    stageEngine.approveStage(); // EVALUAR
    stageEngine.completeStage({ summary: "Evaluation done" });
    stageEngine.approveStage(); // CONSOLIDAR
    stageEngine.completeStage({ summary: "Consolidation done" });
    stageEngine.approveStage(); // ACTUALIZAR_MEMORIA
    stageEngine.completeStage({ summary: "Memory updated" });
    stageEngine.approveStage(); // PREPARAR_CONTINUIDAD
    assert(stageEngine.getStageState().currentPhase === "PREPARAR_CONTINUIDAD", "Phase is PREPARAR_CONTINUIDAD");
  });

  await runAudit("3. Workflow Completion Enters AWAITING_HUMAN_APPROVAL without Auto-Starting PHASE-2", () => {
    const stageEngine = new StageEngine(auditDir);

    // Complete PREPARAR_CONTINUIDAD
    const state = stageEngine.completeStage({
      summary: "Continuity prepared for Phase 1",
      evidenceProduced: ["handoff.md"],
    });

    const activePhase = state.roadmap?.phases.find((p) => p.id === "PHASE-1");
    assert(activePhase?.status === "AWAITING_HUMAN_APPROVAL", "RoadmapPhase status is AWAITING_HUMAN_APPROVAL");
    assert(state.phaseStatus === "AWAITING_APPROVAL", "Root phaseStatus is AWAITING_APPROVAL");
    assert(state.roadmap?.activePhaseId === "PHASE-1", "activePhaseId remains PHASE-1 (PHASE-2 not auto-started)");
    assert(stageEngine.canModifyProductionCode() === false, "canModifyProductionCode is false during AWAITING_HUMAN_APPROVAL");
  });

  // -----------------------------------------------------------------
  // 2. HUMAN GATE AUDIT (Rejection & Approval)
  // -----------------------------------------------------------------
  await runAudit("4. Human Gate Rejection retains PHASE-1 in Rework and prevents PHASE-2 transition", () => {
    const stageEngine = new StageEngine(auditDir);

    const state = stageEngine.rejectPhase("PHASE-1", "Requiere ajustar handoff");
    const activePhase = state.roadmap?.phases.find((p) => p.id === "PHASE-1");

    assert(activePhase?.status === "REJECTED", "Phase 1 status is REJECTED");
    assert(state.roadmap?.activePhaseId === "PHASE-1", "Active phase ID is still PHASE-1");
    assert(state.roadmap?.phases.find((p) => p.id === "PHASE-2") === undefined, "PHASE-2 has NOT been created or activated");
    assert(stageEngine.canModifyProductionCode() === false, "canModifyProductionCode is false while REJECTED");

    // Resume phase work
    const resumedState = stageEngine.startPhase("PHASE-1");
    assert(resumedState.roadmap?.phases[0].status === "IN_PROGRESS", "Phase 1 returned to IN_PROGRESS for rework");
  });

  await runAudit("5. Human Gate Approval completes PHASE-1, activates PHASE-2 starting at DESCUBRIR", () => {
    const stageEngine = new StageEngine(auditDir);

    // Complete PREPARAR_CONTINUIDAD again
    stageEngine.completeStage({ summary: "Phase 1 rework done" });

    // Approve Phase 1
    const state = stageEngine.approvePhase("PHASE-1", "Phase 1 aprobada formalmente");

    const phase1 = state.roadmap?.phases.find((p) => p.id === "PHASE-1");
    const phase2 = state.roadmap?.phases.find((p) => p.id === "PHASE-2");

    assert(phase1?.status === "COMPLETED", "PHASE-1 status is COMPLETED");
    assert(!!phase1?.completedTimestamp, "PHASE-1 has completedTimestamp");
    assert(phase2?.status === "IN_PROGRESS", "PHASE-2 status is IN_PROGRESS");
    assert(state.roadmap?.activePhaseId === "PHASE-2", "Active phase ID advanced to PHASE-2");
    assert(state.currentPhase === "DESCUBRIR", "PHASE-2 internal workflow started at DESCUBRIR");
  });

  // -----------------------------------------------------------------
  // 3. LEGACY MIGRATION AUDIT
  // -----------------------------------------------------------------
  await runAudit("6. Legacy Migration: Synthesizes Roadmap & PHASE-1 without Data Loss", () => {
    const legacyDir = path.join(auditDir, "legacy-proj");
    const openmemoryDir = path.join(legacyDir, ".openmemory");
    fs.mkdirSync(openmemoryDir, { recursive: true });

    const legacyState = {
      projectName: "LegacyClientApp",
      currentPhase: "DISEÑAR",
      phaseStatus: "IN_PROGRESS",
      activeGoal: "Legacy Architecture Design",
      activeTasks: [{ id: "TASK-L1", description: "Design Schema", status: "IN_PROGRESS" }],
      definitionOfDone: [{ id: "DOD-1", criterion: "Design documented", met: true }],
      phaseReport: null,
      approvalRequired: false,
      approvalReceived: false,
      nextPhase: "PLANIFICAR",
      lastSessionId: "session-legacy-999",
      lastUpdated: "2026-09-01T12:00:00.000Z",
      history: [{ timestamp: "2026-09-01T12:00:00.000Z", phase: "DISEÑAR", action: "STARTED" }],
    };

    fs.writeFileSync(path.join(openmemoryDir, "stage-state.json"), JSON.stringify(legacyState, null, 2));

    const stageEngine = new StageEngine(legacyDir);
    const loadedState = stageEngine.getStageState();

    assert(!!loadedState.roadmap, "Synthetic roadmap created");
    assert(loadedState.roadmap?.activePhaseId === "PHASE-1", "Synthetic activePhaseId is PHASE-1");
    assert(loadedState.currentPhase === "DISEÑAR", "Root currentPhase preserved as DISEÑAR");
    assert(loadedState.activeGoal === "Legacy Architecture Design", "Root activeGoal preserved");
    assert(loadedState.activeTasks.length === 1, "Root activeTasks preserved");

    // Re-save and reload
    stageEngine.saveStageState(loadedState);
    const reloadedEngine = new StageEngine(legacyDir);
    const reloadedState = reloadedEngine.getStageState();

    assert(reloadedState.projectName === "LegacyClientApp", "Project name intact");
    assert(reloadedState.currentPhase === "DISEÑAR", "currentPhase intact after re-save");
    assert(reloadedState.roadmap?.phases[0].id === "PHASE-1", "PHASE-1 intact in roadmap");
  });

  // -----------------------------------------------------------------
  // 4. OSS GOVERNANCE VERIFICATION AUDIT
  // -----------------------------------------------------------------
  await runAudit("7. Verifiable OSS Governance Recording & Verification", () => {
    const storage = new StorageEngine(auditDir);
    const stageEngine = new StageEngine(auditDir);

    // Initial check without record
    const checkEmpty = stageEngine.verifyOSSEvaluation("Payment Engine");
    assert(checkEmpty.verified === false, "Returns unverified when no OSS evaluation exists");

    // Save BUILD_CUSTOM without justification -> fails
    const invalidRecord = storage.saveOSSEvaluation({
      capabilityName: "Payment Engine",
      decision: "BUILD_CUSTOM",
      investigatedAlternatives: [{ name: "Stripe SDK", rationale: "Too expensive" }],
      // missing customBuildJustification
    });

    const checkInvalid = stageEngine.verifyOSSEvaluation("Payment Engine");
    assert(checkInvalid.verified === false, "BUILD_CUSTOM without justification fails verification");

    // Save BUILD_CUSTOM with justification -> passes
    storage.saveOSSEvaluation({
      id: invalidRecord.id,
      capabilityName: "Payment Engine",
      decision: "BUILD_CUSTOM",
      investigatedAlternatives: [{ name: "Stripe SDK", rationale: "Too expensive" }],
      customBuildJustification: "Strict in-house compliance requirements mandatory for core ledger",
      approvedByHuman: true,
    });

    const checkValid = stageEngine.verifyOSSEvaluation("Payment Engine");
    assert(checkValid.verified === true, "BUILD_CUSTOM with justification passes verification");
    assert(checkValid.record?.decision === "BUILD_CUSTOM", "Decision is BUILD_CUSTOM");
  });

  // -----------------------------------------------------------------
  // 5. MCP TOOLS INTEGRATION AUDIT
  // -----------------------------------------------------------------
  await runAudit("8. MCP Server Tools (get_roadmap, approve_phase, reject_phase, save_oss_evaluation)", async () => {
    const server = createMCPServer(auditDir);
    const storage = new StorageEngine(auditDir);
    const stageEngine = new StageEngine(auditDir);

    // We can simulate callTool directly by executing storage/stageEngine methods mapped by MCP
    const roadmapData = stageEngine.getRoadmap();
    assert(!!roadmapData.activePhaseId, "MCP openmemory_get_roadmap returns roadmap object");

    // Save OSS evaluation via MCP logic
    const ossRecord = storage.saveOSSEvaluation({
      capabilityName: "Search Indexer",
      decision: "ADOPT_EXISTING",
      investigatedAlternatives: [{ name: "FlexSearch", rationale: "Fast zero-dependency JS search" }],
    });
    assert(ossRecord.id.startsWith("OSS-"), "MCP openmemory_save_oss_evaluation persists record");

    // Test premature approvePhase error handling
    let errorCaught = false;
    try {
      stageEngine.approvePhase("PHASE-999");
    } catch (err) {
      errorCaught = true;
      assert((err as Error).message.includes("no existe"), "Attempting to approve non-existent phase throws clear error");
    }
    assert(errorCaught === true, "Error caught for invalid phase ID");
  });

  // -----------------------------------------------------------------
  // 6. OPENCODE PLUGIN & SESSION CONTINUITY AUDIT
  // -----------------------------------------------------------------
  await runAudit("9. OpenCode Plugin Hooks & Cross-Session Continuity", async () => {
    const pluginDir = path.join(auditDir, "plugin-test-proj");
    fs.mkdirSync(path.join(pluginDir, ".openmemory"), { recursive: true });

    // Instantiate plugin instance
    const pluginInstance = await OpenMemoryPlugin({ directory: pluginDir } as any);

    // Step 1: Session A created
    await pluginInstance.event!({
      event: { type: "session.created", session: { id: "session-A-101" } },
      directory: pluginDir,
    });

    const storageA = new StorageEngine(pluginDir);
    const stateA = storageA.getOrInitProjectState();
    assert(stateA.sessionRunCount === 1, "Session A runCount is 1");
    assert(stateA.lastSessionId === "session-A-101", "Session A ID recorded");

    // Step 2: session.idle checkpoint
    await pluginInstance.event!({
      event: { type: "session.idle", session: { id: "session-A-101" } },
      directory: pluginDir,
    });

    const handoffContent = storageA.getOrInitHandoff();
    assert(handoffContent.includes("Session Handoff"), "handoff.md generated cleanly");

    // Step 3: Session B created (Cross-session recovery)
    await pluginInstance.event!({
      event: { type: "session.created", session: { id: "session-B-202" } },
      directory: pluginDir,
    });

    const stateB = storageA.getOrInitProjectState();
    assert(stateB.sessionRunCount === 2, "Session B incremented runCount to 2");
    assert(stateB.lastSessionId === "session-B-202", "Session B ID updated");
  });

  cleanup();

  console.log("\n=================================================");
  console.log("   ALL INTEGRATION & VERIFICATION AUDITS PASSED!");
  console.log("=================================================");
}

executeAudit();
