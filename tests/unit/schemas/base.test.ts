/**
 * Unit tests for base schemas and validation patterns.
 */

import { describe, expect, it } from "bun:test";
import {
  AcceptanceCriterionIdSchema,
  CategorySchema,
  DateTimeSchema,
  EARSTypeSchema,
  EventIdSchema,
  PrioritySchema,
  RequirementIdSchema,
  VALIDATION_LIMITS,
} from "../../../src/schemas/base.js";

describe("Base Schemas", () => {
  describe("DateTimeSchema", () => {
    it("accepts valid ISO 8601 datetime strings", () => {
      const validDates = [
        "2025-01-30T12:00:00.000Z",
        "2025-01-30T12:00:00Z",
        "2025-01-30T12:00:00.123Z",
        new Date().toISOString(),
      ];

      for (const date of validDates) {
        expect(() => DateTimeSchema.parse(date)).not.toThrow();
      }
    });

    it("rejects invalid datetime strings", () => {
      const invalidDates = [
        "2025-01-30",
        "12:00:00",
        "invalid",
        "",
        "2025-01-30 12:00:00",
      ];

      for (const date of invalidDates) {
        expect(() => DateTimeSchema.parse(date)).toThrow();
      }
    });
  });

  describe("CategorySchema", () => {
    it("accepts valid category names", () => {
      const validCategories = [
        "A",
        "AUTH",
        "API",
        "UI",
        "AUTH123",
        "DATA",
        "SECURITY",
        "123",
      ];

      for (const category of validCategories) {
        expect(() => CategorySchema.parse(category)).not.toThrow();
      }
    });

    it("rejects invalid category names", () => {
      const invalidCategories = [
        "", // too short
        "a", // lowercase
        "auth", // lowercase
        "Auth", // mixed case
        "AUTH-API", // contains dash
        "AUTH_API", // contains underscore
        "AUTH API", // contains space
        "VERYLONGCATEGORYNAMETHATSHOULDNOTBEALLOWED", // too long
      ];

      for (const category of invalidCategories) {
        expect(() => CategorySchema.parse(category)).toThrow();
      }
    });

    it("enforces length limits", () => {
      const maxLength = "A".repeat(VALIDATION_LIMITS.CATEGORY_MAX);
      const tooLong = "A".repeat(VALIDATION_LIMITS.CATEGORY_MAX + 1);

      expect(() => CategorySchema.parse(maxLength)).not.toThrow();
      expect(() => CategorySchema.parse(tooLong)).toThrow();
    });
  });

  describe("RequirementIdSchema", () => {
    it("accepts valid requirement IDs", () => {
      const validIds = [
        "REQ-AUTH-a1b2c3d4e5f6g7h8",
        "REQ-API-x1y2z3w4v5u6t7s8",
        "REQ-UI-m1n2o3p4q5r6s7t8",
        "REQ-123-abcdefghij123456",
        "REQ-A-1234567890abcdef",
      ];

      for (const id of validIds) {
        expect(() => RequirementIdSchema.parse(id)).not.toThrow();
      }
    });

    it("rejects invalid requirement IDs", () => {
      const invalidIds = [
        "REQ-AUTH-short", // nanoid too short
        "REQ-AUTH-toolongid123456789abc", // nanoid too long
        "REQ-auth-a1b2c3d4e5f6g7h8", // lowercase category
        "INVALID-AUTH-a1b2c3d4e5f6g7h8", // wrong prefix
        "REQ-AUTH", // missing nanoid
        "AUTH-a1b2c3d4e5f6g7h8", // missing REQ prefix
        "",
      ];

      for (const id of invalidIds) {
        expect(() => RequirementIdSchema.parse(id)).toThrow();
      }
    });
  });

  describe("AcceptanceCriterionIdSchema", () => {
    it("accepts valid acceptance criterion IDs", () => {
      const validIds = [
        "AC-a1b2c3d4e5f6g7h8",
        "AC-x1y2z3w4v5u6t7s8",
        "AC-m1n2o3p4q5r6s7t8",
        "AC-1234567890abcdef",
        "AC-abcdefghij123456",
      ];

      for (const id of validIds) {
        expect(() => AcceptanceCriterionIdSchema.parse(id)).not.toThrow();
      }
    });

    it("rejects invalid acceptance criterion IDs", () => {
      const invalidIds = [
        "AC-short", // nanoid too short
        "AC-toolongid123", // nanoid too long
        "INVALID-a1b2c3d4e5", // wrong prefix
        "AC", // missing nanoid
        "",
      ];

      for (const id of invalidIds) {
        expect(() => AcceptanceCriterionIdSchema.parse(id)).toThrow();
      }
    });
  });

  describe("EventIdSchema", () => {
    it("accepts valid event IDs", () => {
      const validIds = [
        "EVT-a1b2c3d4e5f6g7h8",
        "EVT-x1y2z3w4v5u6t7s8",
        "EVT-m1n2o3p4q5r6s7t8",
        "EVT-1234567890abcdef",
        "EVT-abcdefghij123456",
      ];

      for (const id of validIds) {
        expect(() => EventIdSchema.parse(id)).not.toThrow();
      }
    });

    it("rejects invalid event IDs", () => {
      const invalidIds = [
        "EVT-short", // nanoid too short
        "EVT-toolongid123456789abc", // nanoid too long
        "INVALID-a1b2c3d4e5f6g7h8", // wrong prefix
        "EVT", // missing nanoid
        "",
      ];

      for (const id of invalidIds) {
        expect(() => EventIdSchema.parse(id)).toThrow();
      }
    });
  });

  describe("EARSTypeSchema", () => {
    it("accepts valid EARS types", () => {
      const validTypes = ["ubiquitous", "event", "state", "optional"];

      for (const type of validTypes) {
        expect(() => EARSTypeSchema.parse(type)).not.toThrow();
      }
    });

    it("rejects invalid EARS types", () => {
      const invalidTypes = ["invalid", "UBIQUITOUS", "Event", "", "unknown"];

      for (const type of invalidTypes) {
        expect(() => EARSTypeSchema.parse(type)).toThrow();
      }
    });
  });

  describe("PrioritySchema", () => {
    it("accepts valid priority levels", () => {
      const validPriorities = ["critical", "high", "medium", "low"];

      for (const priority of validPriorities) {
        expect(() => PrioritySchema.parse(priority)).not.toThrow();
      }
    });

    it("defaults to medium when not provided", () => {
      const result = PrioritySchema.parse(undefined);
      expect(result).toBe("medium");
    });

    it("rejects invalid priority levels", () => {
      const invalidPriorities = ["invalid", "CRITICAL", "High", "", "urgent"];

      for (const priority of invalidPriorities) {
        expect(() => PrioritySchema.parse(priority)).toThrow();
      }
    });
  });

  describe("VALIDATION_LIMITS", () => {
    it("has sensible limit values", () => {
      expect(VALIDATION_LIMITS.PROJECT_NAME_MAX).toBe(100);
      expect(VALIDATION_LIMITS.PROJECT_DESCRIPTION_MAX).toBe(1000);
      expect(VALIDATION_LIMITS.REQUIREMENT_DESCRIPTION_MAX).toBe(500);
      expect(VALIDATION_LIMITS.ACCEPTANCE_CRITERIA_MAX).toBe(10);
      expect(VALIDATION_LIMITS.CATEGORY_MAX).toBe(20);
      expect(VALIDATION_LIMITS.REQUIREMENTS_MAX).toBe(1000);
      expect(VALIDATION_LIMITS.CHANGELOG_EVENTS_MAX).toBe(10000);
    });

    it("has consistent min/max pairs", () => {
      expect(VALIDATION_LIMITS.PROJECT_DESCRIPTION_MIN).toBeLessThan(
        VALIDATION_LIMITS.PROJECT_DESCRIPTION_MAX,
      );
      expect(VALIDATION_LIMITS.REQUIREMENT_DESCRIPTION_MIN).toBeLessThan(
        VALIDATION_LIMITS.REQUIREMENT_DESCRIPTION_MAX,
      );
      expect(VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MIN).toBeLessThan(
        VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MAX,
      );
    });
  });
});
