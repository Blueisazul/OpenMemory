import * as fs from "fs";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";

interface TestResult {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "PARTIAL" | "NOT DETERMINED";
  evidenceType: "[OBSERVED]" | "[VERIFIED]" | "[INFERRED]";
  details: string;
}

const testResults: TestResult[] = [];

// Base directory for scratch isolation
const scratchBase = path.join(process.cwd(), ".work", "scratch-f173-tests");
if (fs.existsSync(scratchBase)) {
  fs.rmSync(scratchBase, { recursive: true, force: true });
}
fs.mkdirSync(scratchBase, { recursive: true });

function getScratchDir(testId: string): string {
  const dir = path.join(scratchBase, testId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

class MCPTestClient {
  public child: ChildProcess;
  public pid: number;
  public stderrOutput: string = "";
  public rawStdoutLines: string[] = [];
  private buffer: string = "";
  private pendingRequests: Map<number, (res: any) => void> = new Map();
  private nextId = 1;

  constructor(cwd: string) {
    const mcpScript = path.join(process.cwd(), "dist", "mcp.js");
    this.child = spawn("node", [mcpScript], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    this.pid = this.child.pid!;

    this.child.stderr?.on("data", (chunk) => {
      this.stderrOutput += chunk.toString();
    });

    this.child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      this.buffer += text;
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        this.rawStdoutLines.push(line.trim());
        try {
          const msg = JSON.parse(line.trim());
          if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
            const resolve = this.pendingRequests.get(msg.id)!;
            this.pendingRequests.delete(msg.id);
            resolve(msg);
          }
        } catch (e) {
          // Line wasn't valid JSON
        }
      }
    });
  }

  public sendRequest(method: string, params: any = {}): Promise<any> {
    const id = this.nextId++;
    const req = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Timeout waiting for response to '${method}' (id ${id})`));
        }
      }, 10000);

      this.pendingRequests.set(id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });

      this.child.stdin?.write(JSON.stringify(req) + "\n");
    });
  }

  public sendNotification(method: string, params: any = {}): void {
    const notif = { jsonrpc: "2.0", method, params };
    this.child.stdin?.write(JSON.stringify(notif) + "\n");
  }

  public async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.child.exitCode !== null) {
        return resolve();
      }
      this.child.on("exit", () => resolve());
      this.child.stdin?.end();
      setTimeout(() => {
        if (this.child.exitCode === null) {
          this.child.kill();
        }
      }, 1500);
    });
  }
}

function runCLIProcess(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string; pid: number }> {
  return new Promise((resolve) => {
    const cliScript = path.join(process.cwd(), "dist", "cli.js");
    const child = spawn("node", [cliScript, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const pid = child.pid!;
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (c) => (stdout += c.toString()));
    child.stderr?.on("data", (c) => (stderr += c.toString()));

    child.on("exit", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr, pid });
    });
  });
}

async function runF173Suite() {
  console.log("==========================================================================");
  console.log("   OpenMemory F17.3 Real Process Boundary & Cross-Process Validation");
  console.log("==========================================================================\n");

  // ---------------------------------------------------------------------------------
  // F17.3-MCP-01 — REAL PROCESS STARTUP
  // ---------------------------------------------------------------------------------
  console.log("[TEST] Executing F17.3-MCP-01: Real MCP Process Startup & Stdio Handshake...");
  const scratchMcp01 = getScratchDir("mcp-01");
  const mcpClient01 = new MCPTestClient(scratchMcp01);

  try {
    const initRes = await mcpClient01.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "f173-test-client", version: "1.0.0" },
    });

    const isJsonRpcValid = initRes.jsonrpc === "2.0" && initRes.id === 1 && initRes.result?.serverInfo?.name === "openmemory";

    mcpClient01.sendNotification("notifications/initialized");

    const toolsRes = await mcpClient01.sendRequest("tools/list");
    const hasToolsList = Array.isArray(toolsRes.result?.tools) && toolsRes.result.tools.length > 0;
    const hasStatusTool = toolsRes.result?.tools?.some((t: any) => t.name === "openmemory_status");

    // Check stdout isolation: every line on stdout must be valid JSON-RPC
    const nonJsonStdout = mcpClient01.rawStdoutLines.filter((line) => {
      try {
        JSON.parse(line);
        return false;
      } catch {
        return true;
      }
    });

    const stdoutIsolated = nonJsonStdout.length === 0;
    const stderrHasLogs = mcpClient01.stderrOutput.includes("[OpenMemory MCP]");

    if (isJsonRpcValid && hasToolsList && hasStatusTool && stdoutIsolated && stderrHasLogs) {
      testResults.push({
        id: "F17.3-MCP-01",
        name: "Real Process Startup & Handshake",
        status: "PASS",
        evidenceType: "[VERIFIED]",
        details: `MCP server spawned as PID ${mcpClient01.pid}. Stdio JSON-RPC initialize & tools/list verified. Stdout 100% clean JSON-RPC (${mcpClient01.rawStdoutLines.length} frames). Stderr isolated log verified.`,
      });
    } else {
      testResults.push({
        id: "F17.3-MCP-01",
        name: "Real Process Startup & Handshake",
        status: "FAIL",
        evidenceType: "[OBSERVED]",
        details: `Validation failed: initValid=${isJsonRpcValid}, hasTools=${hasToolsList}, statusTool=${hasStatusTool}, stdoutIsolated=${stdoutIsolated}, stderrLogs=${stderrHasLogs}`,
      });
    }
  } catch (err) {
    testResults.push({
      id: "F17.3-MCP-01",
      name: "Real Process Startup & Handshake",
      status: "FAIL",
      evidenceType: "[OBSERVED]",
      details: `Exception during MCP-01: ${(err as Error).message}`,
    });
  } finally {
    await mcpClient01.close();
  }

  // ---------------------------------------------------------------------------------
  // F17.3-MCP-02 — CROSS-PROCESS PERSISTENCE
  // ---------------------------------------------------------------------------------
  console.log("[TEST] Executing F17.3-MCP-02: Cross-Process MCP Write -> Terminate -> Read...");
  const scratchMcp02 = getScratchDir("mcp-02");

  let pidProcA = 0;
  let pidProcB = 0;
  let writeSuccess = false;
  let readSuccess = false;
  let mcp02AObserved = "";
  let mcp02BObserved = "";

  // Process A Writes Knowledge Record
  const clientA = new MCPTestClient(scratchMcp02);
  pidProcA = clientA.pid;

  try {
    await clientA.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "client-a", version: "1.0.0" },
    });
    clientA.sendNotification("notifications/initialized");

    // Register active session for authorization using `id` parameter
    await clientA.sendRequest("tools/call", {
      name: "openmemory_register_session",
      arguments: {
        agentId: "agent-process-a",
        id: "session-proc-a-100",
        status: "ACTIVE",
      },
    });

    const recordRes = await clientA.sendRequest("tools/call", {
      name: "openmemory_record_knowledge",
      arguments: {
        topic: "F17.3 Process A Record Topic",
        summary: "Synthesized evidence written by independent Process A via MCP Stdio",
        agentId: "agent-process-a",
        sessionId: "session-proc-a-100",
      },
    });

    mcp02AObserved = JSON.stringify(recordRes);
    const recText = recordRes.result?.content?.[0]?.text || "";
    writeSuccess = !recordRes.result?.isError && (recText.includes("recorded") || recText.includes("RESEARCH-") || recText.includes("Success"));
  } catch (err) {
    mcp02AObserved = `Error: ${(err as Error).message}`;
  } finally {
    await clientA.close();
  }

  // Process B Reads Knowledge Record
  const clientB = new MCPTestClient(scratchMcp02);
  pidProcB = clientB.pid;

  try {
    await clientB.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "client-b", version: "1.0.0" },
    });
    clientB.sendNotification("notifications/initialized");

    const queryRes = await clientB.sendRequest("tools/call", {
      name: "openmemory_query_knowledge",
      arguments: {
        query: "Process A Record Topic",
      },
    });

    mcp02BObserved = JSON.stringify(queryRes);
    const resText = queryRes.result?.content?.[0]?.text || "";
    readSuccess = resText.includes("F17.3 Process A Record Topic") || resText.includes("Synthesized evidence written by independent Process A");
  } catch (err) {
    mcp02BObserved = `Error: ${(err as Error).message}`;
  } finally {
    await clientB.close();
  }

  if (pidProcA !== pidProcB && writeSuccess && readSuccess) {
    testResults.push({
      id: "F17.3-MCP-02",
      name: "Cross-Process MCP Persistence",
      status: "PASS",
      evidenceType: "[VERIFIED]",
      details: `Process A (PID ${pidProcA}) recorded knowledge and terminated. Independent Process B (PID ${pidProcB}) spawned and successfully read data from disk. PIDs distinct (Process A !== Process B).`,
    });
  } else {
    testResults.push({
      id: "F17.3-MCP-02",
      name: "Cross-Process MCP Persistence",
      status: "FAIL",
      evidenceType: "[OBSERVED]",
      details: `Validation failed: pidA=${pidProcA}, pidB=${pidProcB}, writeSuccess=${writeSuccess}, readSuccess=${readSuccess}. ProcA response=${mcp02AObserved}. ProcB response=${mcp02BObserved}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // F17.3-MCP-03 — PROCESS TERMINATION / RECOVERY
  // ---------------------------------------------------------------------------------
  console.log("[TEST] Executing F17.3-MCP-03: Process Termination & ADR Continuity Recovery...");
  const scratchMcp03 = getScratchDir("mcp-03");

  let pidAdrA = 0;
  let pidAdrB = 0;
  let adrWriteSuccess = false;
  let adrReadSuccess = false;
  let mcp03AObserved = "";
  let mcp03BObserved = "";

  const clientAdrA = new MCPTestClient(scratchMcp03);
  pidAdrA = clientAdrA.pid;

  try {
    await clientAdrA.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "adr-client-a", version: "1.0.0" },
    });
    clientAdrA.sendNotification("notifications/initialized");

    // Register active session for authorization using `id` parameter
    await clientAdrA.sendRequest("tools/call", {
      name: "openmemory_register_session",
      arguments: {
        agentId: "agent-adr-a",
        id: "session-adr-a-200",
        status: "ACTIVE",
      },
    });

    const adrRes = await clientAdrA.sendRequest("tools/call", {
      name: "openmemory_save_adr",
      arguments: {
        title: "F17.3 Process Termination Continuity ADR",
        status: "PROPOSED",
        context: "Verifying ADR state survival after process shutdown",
        decision: "Persist ADR via MCP Process A and read back in Process B",
        consequences: "Ensures cross-process state durability",
        agentId: "agent-adr-a",
        sessionId: "session-adr-a-200",
      },
    });

    mcp03AObserved = JSON.stringify(adrRes);
    const adrText = adrRes.result?.content?.[0]?.text || "";
    adrWriteSuccess = !adrRes.result?.isError && (adrText.includes("ADR-") || adrText.includes("PROPOSED") || adrText.includes("created/updated"));
  } catch (err) {
    mcp03AObserved = `Error: ${(err as Error).message}`;
  } finally {
    await clientAdrA.close();
  }

  const clientAdrB = new MCPTestClient(scratchMcp03);
  pidAdrB = clientAdrB.pid;

  try {
    await clientAdrB.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "adr-client-b", version: "1.0.0" },
    });
    clientAdrB.sendNotification("notifications/initialized");

    const statusRes = await clientAdrB.sendRequest("tools/call", {
      name: "openmemory_status",
      arguments: {},
    });

    mcp03BObserved = JSON.stringify(statusRes);
    const statusText = statusRes.result?.content?.[0]?.text || "";
    adrReadSuccess = statusText.includes("F17.3 Process Termination Continuity ADR") || statusText.includes("ADR-001");
  } catch (err) {
    mcp03BObserved = `Error: ${(err as Error).message}`;
  } finally {
    await clientAdrB.close();
  }

  if (pidAdrA !== pidAdrB && adrWriteSuccess && adrReadSuccess) {
    testResults.push({
      id: "F17.3-MCP-03",
      name: "Process Termination & ADR Recovery",
      status: "PASS",
      evidenceType: "[VERIFIED]",
      details: `ADR created by MCP Process A (PID ${pidAdrA}). Process A closed. Process B (PID ${pidAdrB}) recovered ADR state via openmemory_status. Continuity verified.`,
    });
  } else {
    testResults.push({
      id: "F17.3-MCP-03",
      name: "Process Termination & ADR Recovery",
      status: "FAIL",
      evidenceType: "[OBSERVED]",
      details: `Validation failed: pidA=${pidAdrA}, pidB=${pidAdrB}, writeSuccess=${adrWriteSuccess}, readSuccess=${adrReadSuccess}. ProcA response=${mcp03AObserved}. ProcB response=${mcp03BObserved}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // F17.3-CLI-01 — REAL PROCESS EXECUTION
  // ---------------------------------------------------------------------------------
  console.log("[TEST] Executing F17.3-CLI-01: Real CLI Process Execution...");
  const scratchCli01 = getScratchDir("cli-01");

  const cliExecRes = await runCLIProcess(["status"], scratchCli01);
  const cliOutputValid = cliExecRes.exitCode === 0 && (cliExecRes.stdout.includes("[OpenMemory CLI]") || cliExecRes.stdout.includes("Project Context Summary"));

  if (cliOutputValid) {
    testResults.push({
      id: "F17.3-CLI-01",
      name: "Real CLI Process Execution",
      status: "PASS",
      evidenceType: "[VERIFIED]",
      details: `CLI executable (dist/cli.js) spawned as OS process PID ${cliExecRes.pid}. Exit code 0, stdout matched expected CLI header output.`,
    });
  } else {
    testResults.push({
      id: "F17.3-CLI-01",
      name: "Real CLI Process Execution",
      status: "FAIL",
      evidenceType: "[OBSERVED]",
      details: `CLI execution failed: exitCode=${cliExecRes.exitCode}, stdout=${cliExecRes.stdout}, stderr=${cliExecRes.stderr}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // F17.3-CLI-02 — CROSS-PROCESS PERSISTENCE
  // ---------------------------------------------------------------------------------
  console.log("[TEST] Executing F17.3-CLI-02: CLI Cross-Process Persistence...");
  const scratchCli02 = getScratchDir("cli-02");

  // CLI Process A creates task using --created-by
  const cliProcA = await runCLIProcess(["task", "create", "--title", "CLI Cross-Process Validation Task", "--created-by", "cli-agent-a"], scratchCli02);
  const cliAOk = cliProcA.exitCode === 0 && (cliProcA.stdout.includes("Task created") || cliProcA.stdout.includes("TASK-") || cliProcA.stdout.includes("[OpenMemory CLI]"));

  // CLI Process B lists tasks
  const cliProcB = await runCLIProcess(["task", "list"], scratchCli02);
  const cliBOk = cliProcB.exitCode === 0 && cliProcB.stdout.includes("CLI Cross-Process Validation Task");

  if (cliProcA.pid !== cliProcB.pid && cliAOk && cliBOk) {
    testResults.push({
      id: "F17.3-CLI-02",
      name: "CLI Cross-Process Persistence",
      status: "PASS",
      evidenceType: "[VERIFIED]",
      details: `CLI Process A (PID ${cliProcA.pid}) created coordination task. CLI Process B (PID ${cliProcB.pid}) listed coordination tasks and retrieved task created by A.`,
    });
  } else {
    testResults.push({
      id: "F17.3-CLI-02",
      name: "CLI Cross-Process Persistence",
      status: "FAIL",
      evidenceType: "[OBSERVED]",
      details: `CLI Cross-process failed: pidA=${cliProcA.pid}, pidB=${cliProcB.pid}, aOk=${cliAOk}, bOk=${cliBOk}. CLI A exit=${cliProcA.exitCode} stdout='${cliProcA.stdout}' stderr='${cliProcA.stderr}'. CLI B exit=${cliProcB.exitCode} stdout='${cliProcB.stdout}' stderr='${cliProcB.stderr}'`,
    });
  }

  // ---------------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------------
  console.log("\n==========================================================================");
  console.log("   F17.3 Process Boundary Validation Summary Report");
  console.log("==========================================================================\n");

  let allPassed = true;
  for (const r of testResults) {
    const icon = r.status === "PASS" ? "✓" : "❌";
    console.log(`${icon} [${r.status}] ${r.id} - ${r.name} ${r.evidenceType}`);
    console.log(`    Details: ${r.details}\n`);
    if (r.status !== "PASS") allPassed = false;
  }

  // Clean scratch base after run
  try {
    fs.rmSync(scratchBase, { recursive: true, force: true });
    console.log("[CLEANUP] Scratch directory cleaned up successfully.");
  } catch (e) {
    console.warn("[CLEANUP WARNING] Failed to remove scratch base:", e);
  }

  if (!allPassed) {
    process.exit(1);
  }
}

runF173Suite().catch((err) => {
  console.error("FATAL ERROR in F17.3 Suite:", err);
  process.exit(1);
});
