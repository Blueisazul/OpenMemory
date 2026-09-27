import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { StorageEngine } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";
import { createMCPServer } from "../../src/mcp";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runGovernanceAdditionalTests(): Promise<void> {
  console.log("=================================================");
  console.log("   OpenMemory Master Prompt Additional Test Suite ");
  console.log("=================================================\n");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmemory-governance-add-test-"));

  try {
    const storage = new StorageEngine(tmpDir);
    const stageEngine = new StageEngine(tmpDir);
    const mcpServer = createMCPServer(tmpDir);

    // Helper to invoke MCP tool handler directly
    const callMcp = async (toolName: string, args: Record<string, any> = {}) => {
      const handler = (mcpServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
      if (!handler) throw new Error("MCP CallToolRequestSchema handler not registered");
      return await handler({
        method: "tools/call",
        params: { name: toolName, arguments: args },
      });
    };

    // -------------------------------------------------------------
    // SECTION A: MCP Governance Tools Verification
    // -------------------------------------------------------------
    console.log("--- Section A: MCP Governance Tools ---");

    // 1. openmemory_get_stage
    const getStageRes = await callMcp("openmemory_get_stage");
    assert(getStageRes && getStageRes.content && getStageRes.content[0], "openmemory_get_stage returned response");
    const stageData = JSON.parse(getStageRes.content[0].text);
    assert(stageData.currentPhase === "DESCUBRIR", "MCP openmemory_get_stage returns DESCUBRIR");
    assert(stageData.canModifyProductionCode === false, "canModifyProductionCode is false");
    console.log("[PASSED] MCP tool openmemory_get_stage");

    // 2. openmemory_complete_stage
    const completeRes = await callMcp("openmemory_complete_stage", {
      summary: "Descubrimiento de requerimientos listo",
      activitiesDone: ["Entrevista", "Análisis de dominio"],
      evidenceProduced: ["docs/discovery.md"],
      pendingItems: ["Definir requisitos detallados"],
    });
    assert(completeRes.content[0].text.includes("AWAITING_APPROVAL"), "openmemory_complete_stage puts phase in AWAITING_APPROVAL");
    console.log("[PASSED] MCP tool openmemory_complete_stage");

    // 3. openmemory_get_phase_report
    const reportRes = await callMcp("openmemory_get_phase_report");
    const reportData = JSON.parse(reportRes.content[0].text);
    assert(reportData.phaseId === "DESCUBRIR", "openmemory_get_phase_report returns report for DESCUBRIR");
    assert(reportData.dodVerified === true, "dodVerified is true in report");
    console.log("[PASSED] MCP tool openmemory_get_phase_report");

    // 4. openmemory_request_approval
    const reqApprovalRes = await callMcp("openmemory_request_approval");
    assert(reqApprovalRes.content[0].text.includes("GATE DE TRANSICIÓN"), "openmemory_request_approval returns transition prompt");
    console.log("[PASSED] MCP tool openmemory_request_approval");

    // 5. openmemory_approve_stage
    const approveRes = await callMcp("openmemory_approve_stage", { notes: "Aprobado por el usuario vía MCP" });
    assert(approveRes.content[0].text.includes("Human Gate APPROVED"), "openmemory_approve_stage approves transition");
    const newStageData = JSON.parse((await callMcp("openmemory_get_stage")).content[0].text);
    assert(newStageData.currentPhase === "DEFINIR", "After approval, active phase is DEFINIR");
    console.log("[PASSED] MCP tool openmemory_approve_stage");

    // 6. openmemory_reject_stage
    await callMcp("openmemory_complete_stage", { summary: "Definición completada" });
    const rejectRes = await callMcp("openmemory_reject_stage", { reason: "Requisitos imprecisos" });
    assert(rejectRes.content[0].text.includes("Human Gate REJECTED"), "openmemory_reject_stage rejects transition");
    const rejStageData = JSON.parse((await callMcp("openmemory_get_stage")).content[0].text);
    assert(rejStageData.phaseStatus === "REJECTED", "Phase status is REJECTED");
    console.log("[PASSED] MCP tool openmemory_reject_stage");

    // 7. openmemory_start_stage error handling
    const startInvalidRes = await callMcp("openmemory_start_stage", { phaseId: "INVALID_PHASE" });
    assert(startInvalidRes.isError === true, "openmemory_start_stage with invalid phase returns error");
    console.log("[PASSED] MCP tool openmemory_start_stage invalid phase validation");

    // -------------------------------------------------------------
    // SECTION B: Persistence & Re-instantiation Verification
    // -------------------------------------------------------------
    console.log("\n--- Section B: Persistence & Instantiation ---");

    // Approve DEFINIR -> INVESTIGAR -> COMPARAR
    await callMcp("openmemory_approve_stage", { notes: "Re-aprobar DEFINIR tras corrección" });
    await callMcp("openmemory_complete_stage", { summary: "Investigación completada" });
    await callMcp("openmemory_approve_stage", { notes: "Aprobar INVESTIGAR" });

    const currentStageBeforeReset = stageEngine.getStageState();
    assert(currentStageBeforeReset.currentPhase === "COMPARAR", "State is COMPARAR before new instance");

    // Create a NEW StageEngine instance pointing to same tmpDir
    const newStageEngineInstance = new StageEngine(tmpDir);
    const recoveredStateFromDisk = newStageEngineInstance.getStageState();
    assert(recoveredStateFromDisk.currentPhase === "COMPARAR", "New StageEngine instance recovers exact persisted phase COMPARAR");
    assert(recoveredStateFromDisk.projectName === currentStageBeforeReset.projectName, "New instance recovers project name");
    console.log("[PASSED] Persistence: New StageEngine instance recovers exact persisted state from disk");

    // -------------------------------------------------------------
    // SECTION C: Governance Restrictions Verification
    // -------------------------------------------------------------
    console.log("\n--- Section C: Governance Restrictions ---");

    assert(newStageEngineInstance.canModifyProductionCode() === false, "Code modification forbidden in COMPARAR");

    // Attempt skipping COMPARAR -> IMPLEMENTAR directly
    let invalidSkipError = false;
    try {
      newStageEngineInstance.startStage("IMPLEMENTAR");
    } catch (err) {
      invalidSkipError = true;
    }
    assert(invalidSkipError, "Skipping phases from COMPARAR to IMPLEMENTAR throws transition error");
    console.log("[PASSED] Governance: Skipping intermediate phases blocked");

    // Advance to IMPLEMENTAR properly: COMPARAR -> DISEÑAR -> PLANIFICAR -> IMPLEMENTAR
    newStageEngineInstance.completeStage({ summary: "Comparación lista" });
    newStageEngineInstance.approveStage("Aprobar COMPARAR");
    newStageEngineInstance.completeStage({ summary: "Diseño listo" });
    newStageEngineInstance.approveStage("Aprobar DISEÑAR");
    newStageEngineInstance.completeStage({ summary: "Planificación lista" });
    newStageEngineInstance.approveStage("Aprobar PLANIFICAR");

    assert(newStageEngineInstance.getStageState().currentPhase === "IMPLEMENTAR", "Active phase is now IMPLEMENTAR");
    assert(newStageEngineInstance.canModifyProductionCode() === true, "Code modification ALLOWED when IMPLEMENTAR is active & IN_PROGRESS");
    console.log("[PASSED] Governance: Code modification allowed in IMPLEMENTAR");

    // -------------------------------------------------------------
    // SECTION D: Backward Compatibility Verification
    // -------------------------------------------------------------
    console.log("\n--- Section D: Backward Compatibility ---");

    const projState = storage.getOrInitProjectState();
    assert(projState.activePhase === "IMPLEMENTAR", "project-state.json activePhase synced with StageEngine");
    assert(projState.currentStatus === "IN_PROGRESS", "project-state.json currentStatus synced with StageEngine");

    // Verify existing StorageEngine methods work cleanly
    const adr = storage.saveADR({ title: "Test ADR", context: "Ctx", decision: "Dec", status: "ACCEPTED", date: "2026-09-27" });
    assert(adr.id.startsWith("ADR-"), "StorageEngine saveADR works");

    const backup = storage.createBackup("governance-add-test");
    assert(backup.filesCount > 0, "StorageEngine createBackup works");

    console.log("[PASSED] Backward compatibility: StorageEngine primitives sync and operate correctly");

    console.log("\n=================================================");
    console.log("   All Governance Additional Tests PASSED!        ");
    console.log("=================================================\n");

  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

if (require.main === module) {
  runGovernanceAdditionalTests().catch((err) => {
    console.error("Governance Additional Test Failure:", err);
    process.exit(1);
  });
}
