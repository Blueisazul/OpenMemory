import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { installOpenMemory, runInteractiveInitWizard } from "../../src/installer";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedCount++;
  }
}

async function runF111InitInteractiveTests() {
  console.log("=== Running Phase F11.1 Interactive /init Wizard Tests ===");

  const testDir = path.join(process.cwd(), ".openmemory_test_f11_init_" + Date.now());

  try {
    // -------------------------------------------------------------------------
    // TEST 1: DISCOVER -> INFER -> ASK -> CONFIRM -> PERSIST (User Confirms)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 1: Full Interactive Wizard Flow (Confirmed) ---");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "package.json"), JSON.stringify({ name: "my-custom-app" }), "utf-8");

    const answersMap: Record<string, string> = {
      "DISCOVER: Nombre del proyecto": "My Custom App",
      "INFER: Meta activa del proyecto": "Build Enterprise Dashboard",
      "INFER: Fase inicial": "PHASE_1",
    };

    const resConfirmed = await runInteractiveInitWizard({
      targetDir: testDir,
      answersProvider: async (promptText, defaultVal) => answersMap[promptText] || defaultVal,
      confirmProvider: async (_summary) => true,
    });

    assert(resConfirmed.userConfirmed === true, "User confirmation registered as true");
    assert(resConfirmed.success === true, "Installation succeeded after confirmation");
    assert(resConfirmed.discoveredProjectName === "my-custom-app", "Discovered project name from package.json");
    assert(resConfirmed.unknownsIdentified.length > 0, "Identified missing AGENTS.md as unknown");
    assert(resConfirmed.userAnswers?.projectName === "My Custom App", "Recorded user custom project name answer");

    const storage = new StorageEngine(testDir);
    const savedState = storage.getOrInitProjectState();
    assert(savedState.roadmap?.activePhaseId === "PHASE_1" || (savedState as any).activePhase === "PHASE_1" || savedState.currentStage === "PHASE_1", "Persisted user active phase in project-state.json");

    const savedManifest = storage.getOrInitManifest();
    assert(savedManifest.projectName === "My Custom App", "Persisted custom project name in openmemory.json");

    // -------------------------------------------------------------------------
    // TEST 2: Cancellation Safeguard (User Denies Confirmation)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 2: Wizard Cancellation Safeguard (Unconfirmed) ---");
    const testDirCancel = path.join(process.cwd(), ".openmemory_test_f11_cancel_" + Date.now());
    fs.mkdirSync(testDirCancel, { recursive: true });

    const resCancelled = await runInteractiveInitWizard({
      targetDir: testDirCancel,
      answersProvider: async (_prompt, defaultVal) => defaultVal,
      confirmProvider: async (_summary) => false, // Deny confirmation
    });

    assert(resCancelled.userConfirmed === false, "User confirmation registered as false");
    assert(resCancelled.success === false, "Installation returned success=false on cancellation");
    assert(!fs.existsSync(path.join(testDirCancel, ".openmemory")), ".openmemory directory NOT created on cancellation");
    assert(!fs.existsSync(path.join(testDirCancel, "AGENTS.md")), "AGENTS.md NOT created on cancellation");

    // Cleanup cancel dir
    fs.rmSync(testDirCancel, { recursive: true, force: true });

    // -------------------------------------------------------------------------
    // TEST 3: Non-Interactive Backward Compatibility (openmemory install)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 3: Non-Interactive Backward Compatibility ---");
    const testDirNonInt = path.join(process.cwd(), ".openmemory_test_f11_nonint_" + Date.now());
    fs.mkdirSync(testDirNonInt, { recursive: true });

    const resNonInt = installOpenMemory({ targetDir: testDirNonInt });
    assert(resNonInt.success === true, "Non-interactive installOpenMemory succeeded");
    assert(fs.existsSync(path.join(testDirNonInt, "AGENTS.md")), "AGENTS.md created cleanly");
    assert(fs.existsSync(path.join(testDirNonInt, ".openmemory", "project-state.json")), "project-state.json initialized");

    fs.rmSync(testDirNonInt, { recursive: true, force: true });

    console.log("\n=======================================================");
    console.log(`F11.1 TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("=======================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runF111InitInteractiveTests().catch((err) => {
  console.error("Unhandled error in F11.1 tests:", err);
  process.exit(1);
});
