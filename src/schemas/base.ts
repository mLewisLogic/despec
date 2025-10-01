/**
 * Base schemas and constants for the despec system.
 * Defines common validation patterns and ID formats.
 */

import { z } from "zod";

/**
 * ID format patterns for different entity types.
 * All IDs use nanoid(16) for enterprise-grade collision resistance.
 * At 1M IDs/hour: ~2.4 million years to 1% collision probability.
 */
export const ID_PATTERNS = {
  /** Requirement ID: REQ-{CATEGORY}-{nanoid(16)} */
  REQUIREMENT: /^REQ-[A-Z0-9]+-[a-zA-Z0-9_-]{16}$/,
  /** Acceptance Criterion ID: AC-{nanoid(16)} */
  ACCEPTANCE_CRITERION: /^AC-[a-zA-Z0-9_-]{16}$/,
  /** Event ID: EVT-{nanoid(16)} */
  EVENT: /^EVT-[a-zA-Z0-9_-]{16}$/,
} as const;

/**
 * Common validation constants.
 */
export const VALIDATION_LIMITS = {
  /** Maximum length for project name */
  PROJECT_NAME_MAX: 100,
  /** Maximum length for project description */
  PROJECT_DESCRIPTION_MAX: 1000,
  /** Minimum length for project description */
  PROJECT_DESCRIPTION_MIN: 10,
  /** Maximum length for requirement description */
  REQUIREMENT_DESCRIPTION_MAX: 500,
  /** Minimum length for requirement description */
  REQUIREMENT_DESCRIPTION_MIN: 10,
  /** Maximum length for requirement rationale */
  REQUIREMENT_RATIONALE_MAX: 500,
  /** Minimum length for requirement rationale */
  REQUIREMENT_RATIONALE_MIN: 10,
  /** Maximum number of acceptance criteria per requirement */
  ACCEPTANCE_CRITERIA_MAX: 10,
  /** Minimum number of acceptance criteria per requirement */
  ACCEPTANCE_CRITERIA_MIN: 1,
  /** Maximum length for acceptance criterion field */
  ACCEPTANCE_CRITERION_FIELD_MAX: 200,
  /** Minimum length for acceptance criterion field */
  ACCEPTANCE_CRITERION_FIELD_MIN: 5,
  /** Maximum length for category name */
  CATEGORY_MAX: 20,
  /** Minimum length for category name */
  CATEGORY_MIN: 1,
  /** Maximum number of requirements in a project */
  REQUIREMENTS_MAX: 1000,
  /** Maximum number of events in changelog */
  CHANGELOG_EVENTS_MAX: 10000,
  /** Maximum number of categories */
  CATEGORIES_MAX: 50,
} as const;

/**
 * ISO 8601 datetime string schema with validation.
 */
export const DateTimeSchema = z.string().datetime({
  message: "Must be a valid ISO 8601 datetime string",
});

/**
 * Category name schema with validation.
 * Categories are user-defined strings that organize requirements.
 */
export const CategorySchema = z
  .string()
  .min(VALIDATION_LIMITS.CATEGORY_MIN)
  .max(VALIDATION_LIMITS.CATEGORY_MAX)
  .regex(/^[A-Z0-9]+$/, {
    message: "Category must be uppercase alphanumeric characters only",
  });

/**
 * Requirement ID schema with validation.
 * Format: REQ-{CATEGORY}-{nanoid(16)}
 */
export const RequirementIdSchema = z.string().regex(ID_PATTERNS.REQUIREMENT, {
  message:
    "Requirement ID must match format: REQ-{CATEGORY}-{nanoid(16)} (e.g., REQ-AUTH-a1b2c3d4e5f6g7h8)",
});

/**
 * Acceptance Criterion ID schema with validation.
 * Format: AC-{nanoid(16)}
 */
export const AcceptanceCriterionIdSchema = z
  .string()
  .regex(ID_PATTERNS.ACCEPTANCE_CRITERION, {
    message:
      "Acceptance Criterion ID must match format: AC-{nanoid(16)} (e.g., AC-x1y2z3w4v5u6t7s8r9)",
  });

/**
 * Event ID schema with validation.
 * Format: EVT-{nanoid(16)}
 */
export const EventIdSchema = z.string().regex(ID_PATTERNS.EVENT, {
  message:
    "Event ID must match format: EVT-{nanoid(16)} (e.g., EVT-m1n2o3p4q5r6s7t8u9)",
});

/**
 * EARS requirement type enumeration.
 * Based on the EARS (Easy Approach to Requirements Syntax) methodology.
 */
export const EARSTypeSchema = z.enum(
  ["ubiquitous", "event", "state", "optional"],
  {
    error:
      "Type must be one of: ubiquitous, event, state, or optional (EARS methodology)",
  },
);

/**
 * Priority level enumeration for requirements.
 */
export const PrioritySchema = z
  .enum(["critical", "high", "medium", "low"])
  .default("medium");

/**
 * Type exports for TypeScript inference.
 */
export type EARSType = z.infer<typeof EARSTypeSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type RequirementId = z.infer<typeof RequirementIdSchema>;
export type AcceptanceCriterionId = z.infer<typeof AcceptanceCriterionIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;
export type Category = z.infer<typeof CategorySchema>;
