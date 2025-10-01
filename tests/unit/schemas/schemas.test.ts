/**
 * Unit tests for all schema validation.
 * Tests project, requirement, acceptance criteria, and changelog schemas.
 */

import { describe, expect, it } from "bun:test";
import {
  type AcceptanceCriterion,
  type AssertionAcceptanceCriterion,
  type BehavioralAcceptanceCriterion,
  type Changelog,
  createEmptyChangelog,
  createEmptySpecification,
  createSnapshot,
  extractCategoryFromId,
  findRequirementById,
  generateAcceptanceCriterionId,
  generateEventId,
  generateRequirementId,
  getCategories,
  getRequirementsByCategory,
  hasUniqueAcceptanceCriterionIds,
  hasUniqueRequirementIds,
  isBehavioralCriterion,
  isRequirementCreatedEvent,
  type ProjectMetadata,
  type Requirement,
  type RequirementCreatedEvent,
  type Specification,
  safeValidateAcceptanceCriterion,
  safeValidateChangelog,
  safeValidateProjectMetadata,
  safeValidateRequirement,
  safeValidateSnapshot,
  safeValidateSpecification,
  shouldCreateSnapshot,
  validateRequirementIdMatchesCategory,
} from "../../../src/schemas/index.js";

describe("Schema Validation", () => {
  describe("ProjectMetadata", () => {
    it("validates valid project metadata", () => {
      const metadata: ProjectMetadata = {
        name: "Test Project",
        description: "A comprehensive test project description",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = safeValidateProjectMetadata(metadata);
      expect(result.success).toBe(true);
    });

    it("rejects invalid project metadata", () => {
      const invalidMetadata = {
        name: "", // too short
        description: "short", // too short
        created_at: "invalid-date",
        updated_at: "invalid-date",
      };

      const result = safeValidateProjectMetadata(invalidMetadata);
      expect(result.success).toBe(false);
    });

    it("enforces description length limits", () => {
      const tooShort = {
        name: "Test",
        description: "short",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const tooLong = {
        name: "Test",
        description: "x".repeat(1001),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(safeValidateProjectMetadata(tooShort).success).toBe(false);
      expect(safeValidateProjectMetadata(tooLong).success).toBe(false);
    });
  });

  describe("AcceptanceCriterion", () => {
    it("validates behavioral acceptance criteria", () => {
      const criterion: BehavioralAcceptanceCriterion = {
        id: generateAcceptanceCriterionId(),
        type: "behavioral",
        given: "user is authenticated",
        when: "user clicks logout",
        // biome-ignore lint/suspicious/noThenProperty: Required by EARS specification (given/when/then format)
        then: "session is terminated",
        created_at: new Date().toISOString(),
      };

      const result = safeValidateAcceptanceCriterion(criterion);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(isBehavioralCriterion(result.data)).toBe(true);
      }
    });

    it("validates assertion acceptance criteria", () => {
      const criterion: AssertionAcceptanceCriterion = {
        id: generateAcceptanceCriterionId(),
        type: "assertion",
        statement: "All API responses must include CORS headers",
        created_at: new Date().toISOString(),
      };

      const result = safeValidateAcceptanceCriterion(criterion);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(isBehavioralCriterion(result.data)).toBe(false);
      }
    });

    it("rejects invalid behavioral criteria", () => {
      const invalid = {
        id: generateAcceptanceCriterionId(),
        type: "behavioral",
        given: "ok", // too short
        when: "ok", // too short
        // biome-ignore lint/suspicious/noThenProperty: Required by EARS specification (given/when/then format)
        then: "ok", // too short
        created_at: new Date().toISOString(),
      };

      const result = safeValidateAcceptanceCriterion(invalid);
      expect(result.success).toBe(false);
    });

    it("enforces field length limits", () => {
      const tooLong = "x".repeat(201);

      const invalidCriterion = {
        id: generateAcceptanceCriterionId(),
        type: "assertion",
        statement: tooLong,
        created_at: new Date().toISOString(),
      };

      const result = safeValidateAcceptanceCriterion(invalidCriterion);
      expect(result.success).toBe(false);
    });
  });

  describe("Requirement", () => {
    it("validates valid requirements", () => {
      const requirement: Requirement = {
        id: generateRequirementId("AUTH"),
        type: "event",
        category: "AUTH",
        description:
          "System shall authenticate users when valid credentials are provided",
        rationale:
          "User authentication is critical for security and access control",
        acceptance_criteria: [
          {
            id: generateAcceptanceCriterionId(),
            type: "behavioral",
            given: "user has valid credentials",
            when: "user submits login form",
            // biome-ignore lint/suspicious/noThenProperty: Required by EARS specification (given/when/then format)
            then: "system grants access and creates session",
            created_at: new Date().toISOString(),
          },
        ],
        priority: "critical",
        created_at: new Date().toISOString(),
      };

      const result = safeValidateRequirement(requirement);
      expect(result.success).toBe(true);
    });

    it("validates requirement ID matches category", () => {
      const requirement: Requirement = {
        id: generateRequirementId("AUTH"),
        type: "event",
        category: "AUTH",
        description: "A valid requirement description that is long enough",
        rationale: "A valid rationale that is long enough to pass validation",
        acceptance_criteria: [
          {
            id: generateAcceptanceCriterionId(),
            type: "assertion",
            statement: "Must be a valid statement",
            created_at: new Date().toISOString(),
          },
        ],
        priority: "medium",
        created_at: new Date().toISOString(),
      };

      expect(validateRequirementIdMatchesCategory(requirement)).toBe(true);

      const mismatch = { ...requirement, category: "API" };
      expect(validateRequirementIdMatchesCategory(mismatch)).toBe(false);
    });

    it("extracts category from requirement ID", () => {
      const id = generateRequirementId("AUTH");
      const category = extractCategoryFromId(id);
      expect(category).toBe("AUTH");
    });

    it("requires at least one acceptance criterion", () => {
      const invalid = {
        id: generateRequirementId("AUTH"),
        type: "event",
        category: "AUTH",
        description: "Valid description that meets minimum length",
        rationale: "Valid rationale that meets minimum length",
        acceptance_criteria: [], // empty!
        priority: "medium",
        created_at: new Date().toISOString(),
      };

      const result = safeValidateRequirement(invalid);
      expect(result.success).toBe(false);
    });

    it("enforces maximum acceptance criteria limit", () => {
      const criteria: AcceptanceCriterion[] = Array.from(
        { length: 11 },
        () => ({
          id: generateAcceptanceCriterionId(),
          type: "assertion" as const,
          statement: "A valid acceptance criterion statement",
          created_at: new Date().toISOString(),
        }),
      );

      const invalid = {
        id: generateRequirementId("AUTH"),
        type: "event",
        category: "AUTH",
        description: "Valid description that meets minimum length",
        rationale: "Valid rationale that meets minimum length",
        acceptance_criteria: criteria, // too many!
        priority: "medium",
        created_at: new Date().toISOString(),
      };

      const result = safeValidateRequirement(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("Specification", () => {
    it("validates valid specifications", () => {
      const spec = createEmptySpecification(
        "Test Project",
        "A comprehensive test project description",
      );

      const result = safeValidateSpecification(spec);
      expect(result.success).toBe(true);
    });

    it("gets unique categories", () => {
      const spec: Specification = {
        project: {
          name: "Test",
          description: "Test description for the project",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        requirements: [
          {
            id: generateRequirementId("AUTH"),
            type: "event",
            category: "AUTH",
            description: "Auth requirement description that is long enough",
            rationale: "Auth requirement rationale that is long enough",
            acceptance_criteria: [
              {
                id: generateAcceptanceCriterionId(),
                type: "assertion",
                statement: "Valid statement",
                created_at: new Date().toISOString(),
              },
            ],
            priority: "high",
            created_at: new Date().toISOString(),
          },
          {
            id: generateRequirementId("API"),
            type: "ubiquitous",
            category: "API",
            description: "API requirement description that is long enough",
            rationale: "API requirement rationale that is long enough",
            acceptance_criteria: [
              {
                id: generateAcceptanceCriterionId(),
                type: "assertion",
                statement: "Valid statement",
                created_at: new Date().toISOString(),
              },
            ],
            priority: "medium",
            created_at: new Date().toISOString(),
          },
          {
            id: generateRequirementId("AUTH"),
            type: "state",
            category: "AUTH",
            description: "Another auth requirement that is long enough",
            rationale: "Another auth rationale that is long enough",
            acceptance_criteria: [
              {
                id: generateAcceptanceCriterionId(),
                type: "assertion",
                statement: "Valid statement",
                created_at: new Date().toISOString(),
              },
            ],
            priority: "low",
            created_at: new Date().toISOString(),
          },
        ],
      };

      const categories = getCategories(spec);
      expect(categories).toEqual(["API", "AUTH"]);
    });

    it("gets requirements by category", () => {
      const spec: Specification = {
        project: {
          name: "Test",
          description: "Test description for the project",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        requirements: [
          {
            id: generateRequirementId("AUTH"),
            type: "event",
            category: "AUTH",
            description: "Auth requirement description that is long enough",
            rationale: "Auth requirement rationale that is long enough",
            acceptance_criteria: [
              {
                id: generateAcceptanceCriterionId(),
                type: "assertion",
                statement: "Valid statement",
                created_at: new Date().toISOString(),
              },
            ],
            priority: "high",
            created_at: new Date().toISOString(),
          },
          {
            id: generateRequirementId("API"),
            type: "ubiquitous",
            category: "API",
            description: "API requirement description that is long enough",
            rationale: "API requirement rationale that is long enough",
            acceptance_criteria: [
              {
                id: generateAcceptanceCriterionId(),
                type: "assertion",
                statement: "Valid statement",
                created_at: new Date().toISOString(),
              },
            ],
            priority: "medium",
            created_at: new Date().toISOString(),
          },
        ],
      };

      const authReqs = getRequirementsByCategory(spec, "AUTH");
      expect(authReqs).toHaveLength(1);
      expect(authReqs[0]?.category).toBe("AUTH");
    });

    it("finds requirement by ID", () => {
      const reqId = generateRequirementId("AUTH");
      const spec: Specification = {
        project: {
          name: "Test",
          description: "Test description for the project",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        requirements: [
          {
            id: reqId,
            type: "event",
            category: "AUTH",
            description: "Auth requirement description that is long enough",
            rationale: "Auth requirement rationale that is long enough",
            acceptance_criteria: [
              {
                id: generateAcceptanceCriterionId(),
                type: "assertion",
                statement: "Valid statement",
                created_at: new Date().toISOString(),
              },
            ],
            priority: "high",
            created_at: new Date().toISOString(),
          },
        ],
      };

      const found = findRequirementById(spec, reqId);
      expect(found).toBeDefined();
      expect(found?.id).toBe(reqId);

      const notFound = findRequirementById(
        spec,
        "REQ-NOTFOUND-a1b2c3d4e5f6g7h8",
      );
      expect(notFound).toBeUndefined();
    });

    it("validates unique requirement IDs", () => {
      const reqId = generateRequirementId("AUTH");
      const spec: Specification = {
        project: {
          name: "Test",
          description: "Test description for the project",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        requirements: [
          {
            id: reqId,
            type: "event",
            category: "AUTH",
            description:
              "First requirement with duplicate ID that is long enough",
            rationale: "First rationale with duplicate ID that is long enough",
            acceptance_criteria: [
              {
                id: generateAcceptanceCriterionId(),
                type: "assertion",
                statement: "Valid statement",
                created_at: new Date().toISOString(),
              },
            ],
            priority: "high",
            created_at: new Date().toISOString(),
          },
          {
            id: reqId, // duplicate!
            type: "state",
            category: "AUTH",
            description:
              "Second requirement with duplicate ID that is long enough",
            rationale: "Second rationale with duplicate ID that is long enough",
            acceptance_criteria: [
              {
                id: generateAcceptanceCriterionId(),
                type: "assertion",
                statement: "Valid statement",
                created_at: new Date().toISOString(),
              },
            ],
            priority: "low",
            created_at: new Date().toISOString(),
          },
        ],
      };

      expect(hasUniqueRequirementIds(spec)).toBe(false);
    });

    it("validates unique acceptance criterion IDs", () => {
      const acId = generateAcceptanceCriterionId();
      const spec: Specification = {
        project: {
          name: "Test",
          description: "Test description for the project",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        requirements: [
          {
            id: generateRequirementId("AUTH"),
            type: "event",
            category: "AUTH",
            description: "First requirement description that is long enough",
            rationale: "First requirement rationale that is long enough",
            acceptance_criteria: [
              {
                id: acId,
                type: "assertion",
                statement: "Valid statement",
                created_at: new Date().toISOString(),
              },
            ],
            priority: "high",
            created_at: new Date().toISOString(),
          },
          {
            id: generateRequirementId("AUTH"),
            type: "state",
            category: "AUTH",
            description: "Second requirement description that is long enough",
            rationale: "Second requirement rationale that is long enough",
            acceptance_criteria: [
              {
                id: acId, // duplicate across requirements!
                type: "assertion",
                statement: "Valid statement",
                created_at: new Date().toISOString(),
              },
            ],
            priority: "low",
            created_at: new Date().toISOString(),
          },
        ],
      };

      expect(hasUniqueAcceptanceCriterionIds(spec)).toBe(false);
    });
  });

  describe("Changelog", () => {
    it("validates valid changelogs", () => {
      const changelog = createEmptyChangelog();
      const result = safeValidateChangelog(changelog);
      expect(result.success).toBe(true);
    });

    it("creates empty changelog with correct structure", () => {
      const changelog = createEmptyChangelog();

      expect(changelog.version).toBe("1.0.0");
      expect(changelog.events).toHaveLength(0);
      expect(changelog.metadata.total_events).toBe(0);
      expect(changelog.metadata.events_since_snapshot).toBe(0);
    });

    it("validates changelog events", () => {
      const event: RequirementCreatedEvent = {
        id: generateEventId(),
        type: "requirement_created",
        timestamp: new Date().toISOString(),
        requirement: {
          id: generateRequirementId("AUTH"),
          type: "event",
          category: "AUTH",
          description: "Requirement description that is long enough",
          rationale: "Requirement rationale that is long enough",
          acceptance_criteria: [
            {
              id: generateAcceptanceCriterionId(),
              type: "assertion",
              statement: "Valid statement",
              created_at: new Date().toISOString(),
            },
          ],
          priority: "high",
          created_at: new Date().toISOString(),
        },
      };

      expect(isRequirementCreatedEvent(event)).toBe(true);

      const changelog: Changelog = {
        version: "1.0.0",
        events: [event],
        last_snapshot: new Date().toISOString(),
        indexes: {
          by_requirement: {},
          by_type: {
            requirement_created: [0],
            requirement_deleted: [],
            requirement_modified: [],
            requirement_recategorized: [],
            acceptance_criterion_added: [],
            acceptance_criterion_modified: [],
            acceptance_criterion_deleted: [],
            project_metadata_updated: [],
          },
          by_category: {},
        },
        metadata: {
          total_events: 1,
          events_since_snapshot: 1,
          events_by_type: {
            requirement_created: 1,
            requirement_deleted: 0,
            requirement_modified: 0,
            requirement_recategorized: 0,
            acceptance_criterion_added: 0,
            acceptance_criterion_modified: 0,
            acceptance_criterion_deleted: 0,
            project_metadata_updated: 0,
          },
        },
      };

      const result = safeValidateChangelog(changelog);
      expect(result.success).toBe(true);
    });

    it("determines when snapshot should be created", () => {
      const changelog = createEmptyChangelog();
      expect(shouldCreateSnapshot(changelog)).toBe(false);

      changelog.metadata.events_since_snapshot = 99;
      expect(shouldCreateSnapshot(changelog)).toBe(false);

      changelog.metadata.events_since_snapshot = 100;
      expect(shouldCreateSnapshot(changelog)).toBe(true);

      changelog.metadata.events_since_snapshot = 150;
      expect(shouldCreateSnapshot(changelog)).toBe(true);
    });
  });

  describe("Snapshot", () => {
    it("creates valid snapshots", () => {
      const project: ProjectMetadata = {
        name: "Test Project",
        description: "A comprehensive test project description",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const requirements: Requirement[] = [
        {
          id: generateRequirementId("AUTH"),
          type: "event",
          category: "AUTH",
          description: "Requirement description that is long enough",
          rationale: "Requirement rationale that is long enough",
          acceptance_criteria: [
            {
              id: generateAcceptanceCriterionId(),
              type: "assertion",
              statement: "Valid statement",
              created_at: new Date().toISOString(),
            },
          ],
          priority: "high",
          created_at: new Date().toISOString(),
        },
      ];

      const snapshot = createSnapshot("1.0.0", 100, project, requirements);

      expect(snapshot.version).toBe("1.0.0");
      expect(snapshot.event_count).toBe(100);
      expect(snapshot.state.project).toEqual(project);
      expect(snapshot.state.requirements).toEqual(requirements);

      const result = safeValidateSnapshot(snapshot);
      expect(result.success).toBe(true);
    });
  });
});
