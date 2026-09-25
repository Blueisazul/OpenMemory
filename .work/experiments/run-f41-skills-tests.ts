import * as fs from "fs";
import * as path from "path";

interface TestResult {
  id: string;
  name: string;
  status: "PASSED" | "FAILED";
  details: string;
}

const results: TestResult[] = [];
const skillsDir = path.join(process.cwd(), ".opencode", "skills");

function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const lines = content.split("\n");
  if (lines[0].trim() !== "---") {
    return {};
  }
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return {};

  const result: Record<string, string> = {};
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.substring(0, colonIdx).trim();
      const val = line.substring(colonIdx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

async function runF41SkillsTests() {
  console.log("=================================================");
  console.log("   OpenMemory F4.1 Operational SOP Skills Suite  ");
  console.log("=================================================\n");

  const skillNames = [
    "skill-architecture-review",
    "skill-session-handoff",
    "skill-qa-verification",
    "skill-security-audit",
  ];

  // -------------------------------------------------------------------------
  // Test F4.1-001: skill-architecture-review Validation
  // -------------------------------------------------------------------------
  try {
    const filePath = path.join(skillsDir, "skill-architecture-review", "SKILL.md");
    if (!fs.existsSync(filePath)) {
      throw new Error(`File missing: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const fm = parseSkillFrontmatter(content);

    if (fm.name !== "skill-architecture-review") {
      throw new Error(`Expected frontmatter name 'skill-architecture-review', got '${fm.name}'`);
    }
    if (!content.includes("MADR v3") || !content.includes("saveADR")) {
      throw new Error("Missing required architectural review procedure content");
    }

    results.push({
      id: "F4.1-001",
      name: "skill-architecture-review Validation",
      status: "PASSED",
      details: "Validated skill-architecture-review/SKILL.md frontmatter and MADR SOP procedures",
    });
    console.log("[PASSED] F4.1-001: skill-architecture-review Validation");
  } catch (err) {
    results.push({
      id: "F4.1-001",
      name: "skill-architecture-review Validation",
      status: "FAILED",
      details: (err as Error).message,
    });
    console.error("[FAILED] F4.1-001:", (err as Error).message);
  }

  // -------------------------------------------------------------------------
  // Test F4.1-002: skill-session-handoff Validation
  // -------------------------------------------------------------------------
  try {
    const filePath = path.join(skillsDir, "skill-session-handoff", "SKILL.md");
    if (!fs.existsSync(filePath)) {
      throw new Error(`File missing: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const fm = parseSkillFrontmatter(content);

    if (fm.name !== "skill-session-handoff") {
      throw new Error(`Expected frontmatter name 'skill-session-handoff', got '${fm.name}'`);
    }
    if (!content.includes("500 palabras") || !content.includes("verbatim")) {
      throw new Error("Missing required handoff section preservation content");
    }

    results.push({
      id: "F4.1-002",
      name: "skill-session-handoff Validation",
      status: "PASSED",
      details: "Validated skill-session-handoff/SKILL.md frontmatter and section preservation procedures",
    });
    console.log("[PASSED] F4.1-002: skill-session-handoff Validation");
  } catch (err) {
    results.push({
      id: "F4.1-002",
      name: "skill-session-handoff Validation",
      status: "FAILED",
      details: (err as Error).message,
    });
    console.error("[FAILED] F4.1-002:", (err as Error).message);
  }

  // -------------------------------------------------------------------------
  // Test F4.1-003: skill-qa-verification Validation
  // -------------------------------------------------------------------------
  try {
    const filePath = path.join(skillsDir, "skill-qa-verification", "SKILL.md");
    if (!fs.existsSync(filePath)) {
      throw new Error(`File missing: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const fm = parseSkillFrontmatter(content);

    if (fm.name !== "skill-qa-verification") {
      throw new Error(`Expected frontmatter name 'skill-qa-verification', got '${fm.name}'`);
    }
    if (!content.includes("npx tsx") || !content.includes("evidencia")) {
      throw new Error("Missing required empirical QA verification content");
    }

    results.push({
      id: "F4.1-003",
      name: "skill-qa-verification Validation",
      status: "PASSED",
      details: "Validated skill-qa-verification/SKILL.md frontmatter and empirical test execution procedures",
    });
    console.log("[PASSED] F4.1-003: skill-qa-verification Validation");
  } catch (err) {
    results.push({
      id: "F4.1-003",
      name: "skill-qa-verification Validation",
      status: "FAILED",
      details: (err as Error).message,
    });
    console.error("[FAILED] F4.1-003:", (err as Error).message);
  }

  // -------------------------------------------------------------------------
  // Test F4.1-004: skill-security-audit Validation
  // -------------------------------------------------------------------------
  try {
    const filePath = path.join(skillsDir, "skill-security-audit", "SKILL.md");
    if (!fs.existsSync(filePath)) {
      throw new Error(`File missing: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const fm = parseSkillFrontmatter(content);

    if (fm.name !== "skill-security-audit") {
      throw new Error(`Expected frontmatter name 'skill-security-audit', got '${fm.name}'`);
    }
    if (!content.includes("Clean-Room MIT") || !content.includes("<!-- OPENMEMORY:START -->")) {
      throw new Error("Missing required security and license auditing content");
    }

    results.push({
      id: "F4.1-004",
      name: "skill-security-audit Validation",
      status: "PASSED",
      details: "Validated skill-security-audit/SKILL.md frontmatter and license safety procedures",
    });
    console.log("[PASSED] F4.1-004: skill-security-audit Validation");
  } catch (err) {
    results.push({
      id: "F4.1-004",
      name: "skill-security-audit Validation",
      status: "FAILED",
      details: (err as Error).message,
    });
    console.error("[FAILED] F4.1-004:", (err as Error).message);
  }

  // -------------------------------------------------------------------------
  // Test F4.1-005: OpenCode Native Skill Engine Compatibility Check
  // -------------------------------------------------------------------------
  try {
    if (!fs.existsSync(skillsDir)) {
      throw new Error(`Skills directory ${skillsDir} does not exist`);
    }
    for (const sName of skillNames) {
      const sPath = path.join(skillsDir, sName, "SKILL.md");
      if (!fs.existsSync(sPath)) {
        throw new Error(`Native skill structure violated: ${sPath} missing`);
      }
      const raw = fs.readFileSync(sPath, "utf-8");
      const parsed = parseSkillFrontmatter(raw);
      if (!parsed.name || !parsed.description) {
        throw new Error(`Skill ${sName} missing valid YAML name or description frontmatter`);
      }
    }

    results.push({
      id: "F4.1-005",
      name: "OpenCode Native Skill Engine Compatibility Check",
      status: "PASSED",
      details: "All 4 SOP skills conform 100% to OpenCode native skill engine discovery standards",
    });
    console.log("[PASSED] F4.1-005: OpenCode Native Skill Engine Compatibility Check");
  } catch (err) {
    results.push({
      id: "F4.1-005",
      name: "OpenCode Native Skill Engine Compatibility Check",
      status: "FAILED",
      details: (err as Error).message,
    });
    console.error("[FAILED] F4.1-005:", (err as Error).message);
  }

  // Write test results to evidence
  const evidenceDir = path.join(process.cwd(), ".work", "evidence");
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }
  const evidenceFile = path.join(evidenceDir, "phase-4.1-skills-test-results.json");
  fs.writeFileSync(evidenceFile, JSON.stringify(results, null, 2), "utf-8");

  console.log("\n=================================================");
  console.log("   F4.1 Skills Test Execution Complete!          ");
  console.log(`   Results saved to: .work/evidence/phase-4.1-skills-test-results.json`);
  console.log("=================================================");

  const failedCount = results.filter((r) => r.status === "FAILED").length;
  if (failedCount > 0) {
    process.exit(1);
  }
}

runF41SkillsTests();
