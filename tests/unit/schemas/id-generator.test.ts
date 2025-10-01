/**
 * Unit tests for ID generation utilities.
 * Verifies collision resistance and format validation.
 */

import { describe, expect, it } from "bun:test";
import {
  checkForCollisions,
  extractCategory,
  generateAcceptanceCriterionId,
  generateBulkIds,
  generateEventId,
  generateRequirementId,
  ID_LENGTH,
  isValidAcceptanceCriterionId,
  isValidEventId,
  isValidRequirementId,
} from "../../../src/schemas/id-generator.js";

describe("ID Generator", () => {
  describe("generateRequirementId", () => {
    it("generates valid requirement IDs", () => {
      const id = generateRequirementId("AUTH");
      expect(id).toMatch(/^REQ-AUTH-[a-zA-Z0-9_-]{16}$/);
      expect(isValidRequirementId(id)).toBe(true);
    });

    it("uppercases category names", () => {
      const id = generateRequirementId("auth");
      expect(id).toMatch(/^REQ-AUTH-[a-zA-Z0-9_-]{16}$/);
    });

    it("generates unique IDs for the same category", () => {
      const id1 = generateRequirementId("AUTH");
      const id2 = generateRequirementId("AUTH");
      expect(id1).not.toBe(id2);
    });

    it("rejects invalid category names", () => {
      expect(() => generateRequirementId("")).toThrow();
      expect(() => generateRequirementId("AUTH-INVALID")).toThrow(); // contains dash
      expect(() => generateRequirementId("AUTH_INVALID")).toThrow(); // contains underscore
      expect(() =>
        generateRequirementId("VERYLONGCATEGORYNAMETHATSHOULDNOTBEALLOWED"),
      ).toThrow();
    });

    it("accepts valid category names", () => {
      expect(() => generateRequirementId("A")).not.toThrow();
      expect(() => generateRequirementId("a")).not.toThrow(); // gets uppercased
      expect(() => generateRequirementId("AUTH123")).not.toThrow();
      expect(() => generateRequirementId("API")).not.toThrow();
    });
  });

  describe("generateAcceptanceCriterionId", () => {
    it("generates valid acceptance criterion IDs", () => {
      const id = generateAcceptanceCriterionId();
      expect(id).toMatch(/^AC-[a-zA-Z0-9_-]{16}$/);
      expect(isValidAcceptanceCriterionId(id)).toBe(true);
    });

    it("generates unique IDs", () => {
      const id1 = generateAcceptanceCriterionId();
      const id2 = generateAcceptanceCriterionId();
      expect(id1).not.toBe(id2);
    });

    it("has correct ID length", () => {
      const id = generateAcceptanceCriterionId();
      // ID format is AC-{nanoid} where nanoid is 16 characters
      // Remove the "AC-" prefix to get the nanoid part
      const nanoIdPart = id.substring(3);
      expect(nanoIdPart.length).toBe(ID_LENGTH);
    });
  });

  describe("generateEventId", () => {
    it("generates valid event IDs", () => {
      const id = generateEventId();
      expect(id).toMatch(/^EVT-[a-zA-Z0-9_-]{16}$/);
      expect(isValidEventId(id)).toBe(true);
    });

    it("generates unique IDs", () => {
      const id1 = generateEventId();
      const id2 = generateEventId();
      expect(id1).not.toBe(id2);
    });

    it("has correct ID length", () => {
      const id = generateEventId();
      // ID format is EVT-{nanoid} where nanoid is 16 characters
      // Remove the "EVT-" prefix to get the nanoid part
      const nanoIdPart = id.substring(4);
      expect(nanoIdPart.length).toBe(ID_LENGTH);
    });
  });

  describe("ID validation", () => {
    it("validates requirement IDs correctly", () => {
      expect(isValidRequirementId("REQ-AUTH-a1b2c3d4e5f6g7h8")).toBe(true);
      expect(isValidRequirementId("REQ-API-x1y2z3w4v5u6t7s8")).toBe(true);
      expect(isValidRequirementId("REQ-UI-m1n2o3p4q5r6s7t8")).toBe(true);

      // Invalid formats
      expect(isValidRequirementId("REQ-AUTH-short")).toBe(false);
      expect(isValidRequirementId("REQ-AUTH-toolongid123456789")).toBe(false);
      expect(isValidRequirementId("INVALID-AUTH-a1b2c3d4e5f6g7h8")).toBe(false);
      expect(isValidRequirementId("REQ-auth-a1b2c3d4e5f6g7h8")).toBe(false); // lowercase category
      expect(isValidRequirementId("")).toBe(false);
    });

    it("validates acceptance criterion IDs correctly", () => {
      expect(isValidAcceptanceCriterionId("AC-a1b2c3d4e5f6g7h8")).toBe(true);
      expect(isValidAcceptanceCriterionId("AC-x1y2z3w4v5u6t7s8")).toBe(true);

      // Invalid formats
      expect(isValidAcceptanceCriterionId("AC-short")).toBe(false);
      expect(isValidAcceptanceCriterionId("AC-toolongid123456789")).toBe(false);
      expect(isValidAcceptanceCriterionId("INVALID-a1b2c3d4e5f6g7h8")).toBe(
        false,
      );
      expect(isValidAcceptanceCriterionId("")).toBe(false);
    });

    it("validates event IDs correctly", () => {
      expect(isValidEventId("EVT-a1b2c3d4e5f6g7h8")).toBe(true);
      expect(isValidEventId("EVT-x1y2z3w4v5u6t7s8")).toBe(true);

      // Invalid formats
      expect(isValidEventId("EVT-short")).toBe(false);
      expect(isValidEventId("EVT-toolongid123456789")).toBe(false);
      expect(isValidEventId("INVALID-a1b2c3d4e5f6g7h8")).toBe(false);
      expect(isValidEventId("")).toBe(false);
    });
  });

  describe("extractCategory", () => {
    it("extracts category from valid requirement IDs", () => {
      expect(extractCategory("REQ-AUTH-a1b2c3d4e5f6g7h8")).toBe("AUTH");
      expect(extractCategory("REQ-API-x1y2z3w4v5u6t7s8")).toBe("API");
      expect(extractCategory("REQ-UI123-m1n2o3p4q5r6s7t8")).toBe("UI123");
    });

    it("returns null for invalid IDs", () => {
      expect(extractCategory("INVALID-AUTH-a1b2c3d4e5f6g7h8")).toBeNull();
      expect(extractCategory("REQ-AUTH-short")).toBeNull();
      expect(extractCategory("")).toBeNull();
    });
  });

  describe("collision resistance", () => {
    it("generates unique IDs in bulk (1000 IDs)", () => {
      const ids = generateBulkIds(generateEventId, 1000);
      const result = checkForCollisions(ids);

      expect(result.totalCount).toBe(1000);
      expect(result.uniqueCount).toBe(1000);
      expect(result.collisionCount).toBe(0);
      expect(result.hasCollisions).toBe(false);
      expect(result.duplicates).toHaveLength(0);
    });

    it("generates unique IDs in bulk (10,000 IDs)", () => {
      const ids = generateBulkIdsForRequirement(10000, "TEST");
      const result = checkForCollisions(ids);

      expect(result.totalCount).toBe(10000);
      expect(result.uniqueCount).toBe(10000);
      expect(result.collisionCount).toBe(0);
      expect(result.hasCollisions).toBe(false);
      expect(result.duplicates).toHaveLength(0);
    });

    it("generates unique IDs in bulk (100,000 IDs) - stress test", () => {
      // This tests the collision resistance at scale
      // With nanoid(16), we should see zero collisions even at 100k IDs
      const ids = generateBulkIds(generateAcceptanceCriterionId, 100000);
      const result = checkForCollisions(ids);

      expect(result.totalCount).toBe(100000);
      expect(result.uniqueCount).toBe(100000);
      expect(result.collisionCount).toBe(0);
      expect(result.hasCollisions).toBe(false);
      expect(result.duplicates).toHaveLength(0);
    });

    it("detects collisions when they exist", () => {
      const ids = ["ID-1", "ID-2", "ID-1", "ID-3", "ID-2"];
      const result = checkForCollisions(ids);

      expect(result.totalCount).toBe(5);
      expect(result.uniqueCount).toBe(3);
      expect(result.collisionCount).toBe(2);
      expect(result.hasCollisions).toBe(true);
      expect(result.duplicates).toContain("ID-1");
      expect(result.duplicates).toContain("ID-2");
    });
  });

  describe("performance", () => {
    it("generates IDs quickly", () => {
      const startTime = performance.now();
      for (let i = 0; i < 1000; i++) {
        generateEventId();
      }
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should generate 1000 IDs in under 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});

// Helper function for generating requirement IDs in bulk
function generateBulkIdsForRequirement(
  count: number,
  category: string,
): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(generateRequirementId(category));
  }
  return ids;
}
