import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";

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

async function runF112ContextRelevanceTests() {
  console.log("=== Running Phase F11.2 Context Relevance Scoring Tests ===");

  const testDir = path.join(process.cwd(), ".openmemory_test_f11_context_" + Date.now());
  const projectStatePath = path.join(testDir, ".openmemory", "project-state.json");
  const eventsLogPath = path.join(testDir, ".openmemory", "logs", "events.jsonl");

  try {
    const storage = new StorageEngine(testDir);
    storage.ensureStorageStructure();

    // -------------------------------------------------------------------------
    // TEST 1: Setup ADRs and Knowledge Records
    // -------------------------------------------------------------------------
    console.log("\n--- Test 1: Setup Knowledge Base ---");
    const sess = storage.registerSession({ agentId: "agent-f112", status: "ACTIVE" });
    storage.saveADR(
      {
        title: "Postgres Database Schema",
        date: "2026-09-29",
        context: "Need relational database",
        decision: "Use PostgreSQL",
      },
      "agent-f112",
      sess.id
    );

    storage.saveADR(
      {
        title: "Redis PubSub Messaging Architecture",
        date: "2026-09-29",
        context: "Need high throughput event pubsub",
        decision: "Adopt Redis PubSub",
      },
      "agent-f112",
      sess.id
    );

    storage.saveResearch(
      {
        topic: "GraphQL Query Performance Benchmarks",
        category: "BENCHMARK",
        summary: "Comparison of REST vs GraphQL endpoints throughput",
        items: [
          {
            id: "item-1",
            type: "FINDING",
            classification: "OBSERVATION",
            title: "GraphQL Overhead",
            content: "GraphQL has 15% CPU overhead on query parsing",
            provenance: {},
          },
        ],
      },
      "agent-f112",
      sess.id
    );

    storage.saveResearch(
      {
        topic: "Redis Cluster Performance & Caching Strategy",
        category: "ARCHITECTURE",
        summary: "Redis memory optimization and PubSub throughput benchmarking",
        items: [
          {
            id: "item-2",
            type: "FINDING",
            classification: "CONCLUSION",
            title: "Redis Latency",
            content: "Sub-millisecond latency achieved with Redis cluster",
            tags: ["redis", "cache", "pubsub"],
            provenance: {},
          },
        ],
      },
      "agent-f112",
      sess.id
    );

    assert(storage.listADRs().length === 2, "2 ADRs saved to storage");
    assert(storage.listResearches().length === 2, "2 Research records saved to storage");

    // -------------------------------------------------------------------------
    // TEST 2: Deterministic Relevance Scoring by queryTopic
    // -------------------------------------------------------------------------
    console.log("\n--- Test 2: Relevance Scoring & Sorting ---");
    const summary = storage.assembleCrossAgentContext("agent-tester", "Redis PubSub Caching");

    assert(summary.requestingAgentId === "agent-tester", "Requesting agent ID matched");
    assert(summary.queryTopic === "Redis PubSub Caching", "Query topic preserved in summary");

    // Top scored ADR should be Redis PubSub
    const topAdr = summary.adrs[0];
    assert(topAdr.title.includes("Redis"), "Top ranked ADR is Redis PubSub based on queryTopic relevance");

    // Top scored Research Record should be Redis Cluster
    const topResearch = summary.researches[0];
    assert(topResearch.topic.includes("Redis"), "Top ranked Research Record is Redis Cluster based on queryTopic relevance");

    // -------------------------------------------------------------------------
    // TEST 3: Read-Only Invariant & Token Ceiling Safeguard
    // -------------------------------------------------------------------------
    console.log("\n--- Test 3: Read-Only Invariant & Token Ceiling ---");
    const mtimeBefore = fs.statSync(projectStatePath).mtimeMs;

    const summary2 = storage.assembleCrossAgentContext("agent-auditor", "Postgres Schema");

    const mtimeAfter = fs.statSync(projectStatePath).mtimeMs;
    assert(mtimeBefore === mtimeAfter, "assembleCrossAgentContext() is strictly READ-ONLY (project-state unmodified)");
    assert(summary2.assembledContextMarkdown.length < 8000, `Assembled context markdown fits within <2,000 tokens ceiling (got ${summary2.assembledContextMarkdown.length} chars)`);

    const eventsLog = fs.readFileSync(eventsLogPath, "utf-8");
    assert(eventsLog.includes("context.assembled"), "Telemetry event 'context.assembled' written to events.jsonl");
    assert(eventsLog.includes("Redis PubSub Caching"), "Telemetry event payload included queryTopic");

    console.log("\n=======================================================");
    console.log(`F11.2 TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
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

runF112ContextRelevanceTests().catch((err) => {
  console.error("Unhandled error in F11.2 tests:", err);
  process.exit(1);
});
