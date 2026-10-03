import {
  ResearchRecord,
  KnowledgeItem,
  KnowledgeRelation,
  KnowledgeRelationType,
  KnowledgeLifecycleState,
  ActorRole,
  AcceptanceBasis,
  KnowledgeItemTMSView,
  TMSAnalysisResult,
} from "../types";

export interface LifecycleTransitionResult {
  valid: boolean;
  reason?: string;
  acceptanceBasis?: AcceptanceBasis;
  evaluationRationale?: string;
}

export interface RelationValidationResult {
  valid: boolean;
  reason?: string;
  isDuplicate?: boolean;
  existingRelation?: KnowledgeRelation;
}

export class KnowledgeTMS {
  /**
   * Pure validation rules for KnowledgeItem lifecycle state transitions (F13.1-B)
   */
  public validateLifecycleTransition(params: {
    currentState: KnowledgeLifecycleState;
    targetState: KnowledgeLifecycleState;
    actorRole?: ActorRole;
    evaluationRationale?: string;
    acceptanceBasis?: AcceptanceBasis;
    evidenceReference?: string;
  }): LifecycleTransitionResult {
    const { currentState, targetState } = params;

    // Terminal State Protection: SUPERSEDED and DEPRECATED are terminal
    if (currentState === "SUPERSEDED" || currentState === "DEPRECATED") {
      return {
        valid: false,
        reason: `Terminal state protection: KnowledgeItem is in terminal state '${currentState}' and cannot be resurrected or modified.`,
      };
    }

    const role = params.actorRole || "WORKER_AGENT";
    const isLeadOrHuman = role === "HUMAN_OPERATOR" || role === "LEAD_AGENT";

    if (targetState === "VALIDATED") {
      if (
        !params.evidenceReference ||
        typeof params.evidenceReference !== "string" ||
        params.evidenceReference.trim().length < 3
      ) {
        return {
          valid: false,
          reason: "Validation rejected: evidenceReference (min 3 chars) is mandatory for transition to VALIDATED.",
        };
      }
    } else if (targetState === "ACCEPTED") {
      if (!isLeadOrHuman) {
        return {
          valid: false,
          reason: `Unauthorized acceptance: caller role '${role}' is not authorized to transition KnowledgeItem to ACCEPTED. Must be HUMAN_OPERATOR or LEAD_AGENT.`,
        };
      }

      if (currentState === "LEGACY_UNEVALUATED") {
        const basis = params.acceptanceBasis || "OPERATIONAL_ADOPTION";
        if (basis !== "OPERATIONAL_ADOPTION") {
          return {
            valid: false,
            reason: "Acceptance rejected: direct legacy acceptance must specify acceptanceBasis = 'OPERATIONAL_ADOPTION'.",
          };
        }
        if (!params.evaluationRationale || params.evaluationRationale.trim().length < 15) {
          return {
            valid: false,
            reason: "Acceptance rejected: direct legacy acceptance requires an evaluationRationale of at least 15 characters.",
          };
        }
      } else if (currentState === "VALIDATED") {
        if (!params.evaluationRationale || params.evaluationRationale.trim().length < 1) {
          return {
            valid: false,
            reason: "Acceptance rejected: evaluationRationale is mandatory for transition to ACCEPTED.",
          };
        }
      } else if (currentState === "CREATED") {
        return {
          valid: false,
          reason: "Acceptance rejected: item in state 'CREATED' must be VALIDATED prior to acceptance unless adopting legacy knowledge.",
        };
      }
    } else if (targetState === "SUPERSEDED") {
      if (!isLeadOrHuman) {
        return {
          valid: false,
          reason: `Unauthorized: caller role '${role}' is not authorized to set KnowledgeItem to SUPERSEDED. Must be HUMAN_OPERATOR or LEAD_AGENT.`,
        };
      }
      if (!params.evaluationRationale || params.evaluationRationale.trim().length === 0) {
        return {
          valid: false,
          reason: "Supersede rejected: evaluationRationale is mandatory.",
        };
      }
    } else if (targetState === "DEPRECATED") {
      if (!isLeadOrHuman) {
        return {
          valid: false,
          reason: `Unauthorized: caller role '${role}' is not authorized to set KnowledgeItem to DEPRECATED. Must be HUMAN_OPERATOR or LEAD_AGENT.`,
        };
      }
      if (!params.evaluationRationale || params.evaluationRationale.trim().length === 0) {
        return {
          valid: false,
          reason: "Deprecation rejected: evaluationRationale is mandatory.",
        };
      }
    }

    const defaultBasis =
      params.acceptanceBasis ||
      (targetState === "ACCEPTED"
        ? currentState === "LEGACY_UNEVALUATED"
          ? "OPERATIONAL_ADOPTION"
          : "EVIDENCE_VALIDATED"
        : "EVIDENCE_VALIDATED");

    return {
      valid: true,
      acceptanceBasis: defaultBasis,
      evaluationRationale: params.evaluationRationale || `Transitioned to ${targetState}`,
    };
  }

  /**
   * Pure validation rules and supersession cycle detection for KnowledgeRelation creation (F13.2-A)
   */
  public validateRelationCreation(
    existingRelations: Array<KnowledgeRelation & { owningResearchRecordId: string }>,
    params: {
      relationType: KnowledgeRelationType;
      sourceItemId: string;
      targetItemId: string;
      sourceItemExistsInRecord: boolean;
    }
  ): RelationValidationResult {
    const validTypes: KnowledgeRelationType[] = [
      "SUPPORTS",
      "CONTRADICTS",
      "SUPERSEDES",
      "DERIVED_FROM",
      "QUALIFIES",
    ];

    if (!validTypes.includes(params.relationType)) {
      return {
        valid: false,
        reason: `Invalid relationType '${params.relationType}'. Must be one of SUPPORTS, CONTRADICTS, SUPERSEDES, DERIVED_FROM, QUALIFIES.`,
      };
    }

    if (params.sourceItemId === params.targetItemId) {
      return {
        valid: false,
        reason: `Self-relation rejected: item cannot relate to itself ('${params.sourceItemId}').`,
      };
    }

    if (!params.targetItemId || typeof params.targetItemId !== "string" || params.targetItemId.trim().length === 0) {
      return {
        valid: false,
        reason: "Invalid relation rejected: targetItemId must be a non-empty string.",
      };
    }

    if (!params.sourceItemExistsInRecord) {
      return {
        valid: false,
        reason: `Source ownership mismatch: sourceItemId '${params.sourceItemId}' not found in research record. Canonical ownership rule requires relation to be stored in the ResearchRecord containing sourceItemId.`,
      };
    }

    // Supersession Cycle Guard for NEW relations
    if (params.relationType === "SUPERSEDES") {
      const supersedesEdges = existingRelations.filter(r => r.relationType === "SUPERSEDES");
      const visited = new Set<string>();
      const queue = [params.targetItemId];
      let createsCycle = false;

      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (curr === params.sourceItemId) {
          createsCycle = true;
          break;
        }
        if (visited.has(curr)) continue;
        visited.add(curr);

        for (const edge of supersedesEdges) {
          if (edge.sourceItemId === curr && !visited.has(edge.targetItemId)) {
            queue.push(edge.targetItemId);
          }
        }
      }

      if (createsCycle) {
        return {
          valid: false,
          reason: `Supersession cycle rejected: adding SUPERSEDES relation from '${params.sourceItemId}' to '${params.targetItemId}' would create a cycle.`,
        };
      }
    }

    // Duplicate detection
    const duplicate = existingRelations.find(
      r =>
        r.sourceItemId === params.sourceItemId &&
        r.targetItemId === params.targetItemId &&
        r.relationType === params.relationType
    );

    if (duplicate) {
      return {
        valid: true,
        isDuplicate: true,
        existingRelation: duplicate,
      };
    }

    return { valid: true };
  }

  /**
   * Pure Truth Maintenance System (TMS) graph analysis (Tier A - F13.2-B)
   */
  public analyzeTMS(
    researches: ResearchRecord[],
    filter?: {
      researchId?: string;
      itemId?: string;
    }
  ): TMSAnalysisResult {
    const itemMap = new Map<string, { item: KnowledgeItem; researchId: string }>();

    for (const r of researches) {
      for (const item of r.items) {
        itemMap.set(item.id, { item, researchId: r.id });
      }
    }

    const overallDiagnostics: string[] = [];
    let isOverallDegraded = false;
    let totalRelationsCount = 0;
    let targetNotFoundCount = 0;

    const viewsMap = new Map<string, KnowledgeItemTMSView>();

    // Initialize views for all items
    for (const [itemId, { item, researchId }] of itemMap.entries()) {
      viewsMap.set(itemId, {
        itemId,
        researchRecordId: researchId,
        canonicalLifecycleState: item.lifecycleState || "LEGACY_UNEVALUATED",
        derivedConflictState: "CONSISTENT",
        derivedLineageStatus: "NONE",
        diagnostics: [],
        relations: [],
      });
    }

    const validTypes: KnowledgeRelationType[] = [
      "SUPPORTS",
      "CONTRADICTS",
      "SUPERSEDES",
      "DERIVED_FROM",
      "QUALIFIES",
    ];

    interface ValidatedRelation {
      rel: KnowledgeRelation;
      owningResearchRecordId: string;
      targetStatus: "EXISTS" | "TARGET_NOT_FOUND";
    }

    const validRelations: ValidatedRelation[] = [];

    // 1. Inspect and validate relations
    for (const r of researches) {
      const recordRelations = r.relations || [];
      for (const rel of recordRelations) {
        totalRelationsCount++;

        let isMalformed = false;
        let malformedReason = "";

        if (!rel || typeof rel !== "object") {
          isMalformed = true;
          malformedReason = "Relation object is null or not an object.";
        } else if (!rel.id || typeof rel.id !== "string") {
          isMalformed = true;
          malformedReason = "Relation missing valid string 'id'.";
        } else if (!rel.relationType || !validTypes.includes(rel.relationType)) {
          isMalformed = true;
          malformedReason = `Relation '${rel?.id || "unknown"}' has invalid relationType '${rel?.relationType}'.`;
        } else if (
          !rel.sourceItemId ||
          typeof rel.sourceItemId !== "string" ||
          !rel.targetItemId ||
          typeof rel.targetItemId !== "string"
        ) {
          isMalformed = true;
          malformedReason = `Relation '${rel?.id || "unknown"}' has missing or empty sourceItemId or targetItemId.`;
        } else if (!rel.createdAt || !rel.provenance || !rel.provenance.agentId) {
          isMalformed = true;
          malformedReason = `Relation '${rel?.id || "unknown"}' has missing or malformed provenance/createdAt metadata.`;
        }

        if (isMalformed) {
          isOverallDegraded = true;
          const diagMsg = `Malformed relation detected in ResearchRecord '${r.id}': ${malformedReason}`;
          overallDiagnostics.push(diagMsg);

          if (rel?.sourceItemId && viewsMap.has(rel.sourceItemId)) {
            const v = viewsMap.get(rel.sourceItemId)!;
            v.isDegraded = true;
            v.diagnostics.push(`Degraded relation '${rel?.id || "unknown"}': ${malformedReason}`);
          }
          continue;
        }

        const targetExists = itemMap.has(rel.targetItemId);
        if (!targetExists) {
          targetNotFoundCount++;
        }

        validRelations.push({
          rel,
          owningResearchRecordId: r.id,
          targetStatus: targetExists ? "EXISTS" : "TARGET_NOT_FOUND",
        });
      }
    }

    // 2. Populate source relations lists
    for (const vr of validRelations) {
      const { rel, owningResearchRecordId, targetStatus } = vr;
      if (viewsMap.has(rel.sourceItemId)) {
        const sourceView = viewsMap.get(rel.sourceItemId)!;
        sourceView.relations.push({
          ...rel,
          owningResearchRecordId,
          targetStatus,
        });
      }
    }

    // 3. Process CONTRADICTS relations symmetrically
    for (const vr of validRelations) {
      const { rel, owningResearchRecordId } = vr;
      if (rel.relationType === "CONTRADICTS") {
        const sourceView = viewsMap.get(rel.sourceItemId);
        const targetView = viewsMap.get(rel.targetItemId);

        if (sourceView) {
          sourceView.derivedConflictState = "CONFLICTED";
          sourceView.diagnostics.push(`Contradiction detected with target item '${rel.targetItemId}'.`);
        }

        if (targetView) {
          targetView.derivedConflictState = "CONFLICTED";
          targetView.diagnostics.push(`Contradiction detected with source item '${rel.sourceItemId}'.`);

          const hasSymmetric = targetView.relations.some(r => r.id === rel.id && r.isSymmetric);
          if (!hasSymmetric) {
            targetView.relations.push({
              ...rel,
              owningResearchRecordId,
              targetStatus: sourceView ? "EXISTS" : "TARGET_NOT_FOUND",
              isSymmetric: true,
            });
          }
        }
      }
    }

    // 4. SUPERSEDES Graph Analysis & Cycle Detection
    const supersedesEdges = validRelations.filter(vr => vr.rel.relationType === "SUPERSEDES");

    const supersedesAdj = new Map<string, string[]>();
    for (const vr of supersedesEdges) {
      const s = vr.rel.sourceItemId;
      const t = vr.rel.targetItemId;
      if (!supersedesAdj.has(s)) supersedesAdj.set(s, []);
      supersedesAdj.get(s)!.push(t);
    }

    const cycleNodes = new Set<string>();
    for (const startNode of itemMap.keys()) {
      const outgoing = supersedesAdj.get(startNode) || [];
      let foundCycle = false;
      for (const firstHop of outgoing) {
        const bfsQueue = [firstHop];
        const bfsVisited = new Set<string>([firstHop]);

        while (bfsQueue.length > 0) {
          const curr = bfsQueue.shift()!;
          if (curr === startNode) {
            foundCycle = true;
            break;
          }
          for (const nextNode of supersedesAdj.get(curr) || []) {
            if (!bfsVisited.has(nextNode)) {
              bfsVisited.add(nextNode);
              bfsQueue.push(nextNode);
            }
          }
        }
        if (foundCycle) break;
      }

      if (foundCycle) {
        cycleNodes.add(startNode);
      }
    }

    for (const node of cycleNodes) {
      const v = viewsMap.get(node);
      if (v) {
        v.derivedConflictState = "UNRESOLVED";
        v.diagnostics.push(`Supersession cycle detected involving item '${node}'. Derived supersession blocked.`);
      }
    }

    for (const vr of supersedesEdges) {
      const sId = vr.rel.sourceItemId;
      const tId = vr.rel.targetItemId;

      if (cycleNodes.has(sId) || cycleNodes.has(tId)) {
        continue;
      }

      const sourceView = viewsMap.get(sId);
      const targetView = viewsMap.get(tId);

      if (sourceView && sourceView.canonicalLifecycleState === "ACCEPTED") {
        if (sourceView.derivedLineageStatus !== "SUPERSEDED_BY_ACCEPTED_SOURCE") {
          sourceView.derivedLineageStatus = "SUPERSEDING";
        }
        if (targetView) {
          targetView.derivedLineageStatus = "SUPERSEDED_BY_ACCEPTED_SOURCE";
        }
      }
    }

    // 5. SUPPORTS Cycles Detection
    const supportsEdges = validRelations.filter(vr => vr.rel.relationType === "SUPPORTS");
    const supportsAdj = new Map<string, string[]>();
    for (const vr of supportsEdges) {
      const s = vr.rel.sourceItemId;
      const t = vr.rel.targetItemId;
      if (!supportsAdj.has(s)) supportsAdj.set(s, []);
      supportsAdj.get(s)!.push(t);
    }

    for (const startNode of itemMap.keys()) {
      const outgoing = supportsAdj.get(startNode) || [];
      let foundCycle = false;
      for (const firstHop of outgoing) {
        const bfsQueue = [firstHop];
        const bfsVisited = new Set<string>([firstHop]);

        while (bfsQueue.length > 0) {
          const curr = bfsQueue.shift()!;
          if (curr === startNode) {
            foundCycle = true;
            break;
          }
          for (const nextNode of supportsAdj.get(curr) || []) {
            if (!bfsVisited.has(nextNode)) {
              bfsVisited.add(nextNode);
              bfsQueue.push(nextNode);
            }
          }
        }
        if (foundCycle) break;
      }

      if (foundCycle) {
        const v = viewsMap.get(startNode);
        if (v) {
          v.diagnostics.push(`Structurally permitted SUPPORT cycle detected involving item '${startNode}'. No truth inferred.`);
        }
      }
    }

    const itemsResult: Record<string, KnowledgeItemTMSView> = {};
    let consistentCount = 0;
    let conflictedCount = 0;
    let unresolvedCount = 0;
    let degradedCount = 0;

    for (const [id, view] of viewsMap.entries()) {
      if (filter?.researchId && view.researchRecordId !== filter.researchId) {
        continue;
      }
      if (filter?.itemId && id !== filter.itemId) {
        continue;
      }

      itemsResult[id] = view;

      if (view.isDegraded) degradedCount++;
      if (view.derivedConflictState === "UNRESOLVED") unresolvedCount++;
      else if (view.derivedConflictState === "CONFLICTED") conflictedCount++;
      else consistentCount++;
    }

    let overallStatus: "CONSISTENT" | "CONFLICTED" | "UNRESOLVED" | "DEGRADED" = "CONSISTENT";
    if (isOverallDegraded || degradedCount > 0) {
      overallStatus = "DEGRADED";
    } else if (unresolvedCount > 0) {
      overallStatus = "UNRESOLVED";
    } else if (conflictedCount > 0) {
      overallStatus = "CONFLICTED";
    }

    return {
      overallStatus,
      diagnostics: overallDiagnostics,
      items: itemsResult,
      summary: {
        totalItems: Object.keys(itemsResult).length,
        totalRelations: totalRelationsCount,
        consistentCount,
        conflictedCount,
        unresolvedCount,
        degradedCount,
        targetNotFoundCount,
      },
    };
  }
}
