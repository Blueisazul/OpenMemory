import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { StorageEngine } from "../../src/storage";
import { OpenMemoryPlugin } from "../../src/plugin";
import { StageEngine } from "../../src/stage-engine";

async function runContractClosureTests() {
  console.log("=================================================");
  console.log("OpenMemory v0.3.0 Contract Closure Test Suite");
  console.log("=================================================");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-v030-fix-test-"));
  try {
    const storage = new StorageEngine(tempDir);
    const stageEngine = new StageEngine(tempDir);
    storage.ensureStorageStructure();

    // -------------------------------------------------------------
    // TEST A: Idle Handoff (autoHandoffOnIdle = true)
    // -------------------------------------------------------------
    console.log("\n[Test A] Idle Handoff when autoHandoffOnIdle = true");
    const pluginInstance = await OpenMemoryPlugin({
      directory: tempDir,
      worktree: tempDir,
    } as any);

    // Register session
    await pluginInstance.event({
      event: {
        type: "session.created",
        properties: { info: { id: "ses_idle_test_001" } },
      },
    });

    const handoffBefore = storage.getOrInitHandoff();

    // Emit session.idle
    await pluginInstance.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "ses_idle_test_001" },
      },
    });

    const handoffAfterIdle = storage.getOrInitHandoff();
    console.log("Handoff updated on idle:", handoffAfterIdle !== handoffBefore);
    if (!handoffAfterIdle.includes("Current Phase:") || !handoffAfterIdle.includes("DESCUBRIR")) {
      throw new Error("Test A FAIL: Handoff after idle does not contain active phase details");
    }
    console.log("Test A PASSED: Idle Handoff executed on session.idle");

    // -------------------------------------------------------------
    // TEST B: autoHandoffOnIdle = false
    // -------------------------------------------------------------
    console.log("\n[Test B] autoHandoffOnIdle = false skips idle handoff");
    const tempDirB = fs.mkdtempSync(path.join(os.tmpdir(), "om-v030-fix-testb-"));
    const storageB = new StorageEngine(tempDirB);
    storageB.ensureStorageStructure();

    // Disable autoHandoffOnIdle in manifest
    const manifestB = storageB.getOrInitManifest();
    manifestB.config.autoHandoffOnIdle = false;
    storageB.saveManifest(manifestB);

    const pluginInstanceB = await OpenMemoryPlugin({
      directory: tempDirB,
      worktree: tempDirB,
    } as any);

    await pluginInstanceB.event({
      event: {
        type: "session.created",
        properties: { info: { id: "ses_idle_test_002" } },
      },
    });

    // Write a unique custom handoff marker
    const customHandoffMarker = "# Custom Handoff Verbatim";
    storageB.saveHandoff(customHandoffMarker);

    // Emit session.idle
    await pluginInstanceB.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "ses_idle_test_002" },
      },
    });

    const handoffAfterIdleB = storageB.getOrInitHandoff();
    if (handoffAfterIdleB !== customHandoffMarker) {
      throw new Error("Test B FAIL: Handoff was mutated when autoHandoffOnIdle was false");
    }
    console.log("Test B PASSED: autoHandoffOnIdle = false preserved handoff verbatim");

    // -------------------------------------------------------------
    // TEST C: Active Phase Resolution (No 'undefined')
    // -------------------------------------------------------------
    console.log("\n[Test C] Active Phase resolution in context summary");
    const summary = storage.formatProjectContextSummary();
    console.log("Formatted summary sample:\n" + summary.split("\n").slice(0, 6).join("\n"));

    if (summary.includes("Active Phase: undefined")) {
      throw new Error("Test C FAIL: Context summary contained 'Active Phase: undefined'");
    }
    console.log("Test C PASSED: Active Phase resolved properly without 'undefined'");

    console.log("\n=================================================");
    console.log("ALL V0.3.0 CONTRACT CLOSURE TESTS PASSED CLEANLY!");
    console.log("=================================================");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runContractClosureTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
