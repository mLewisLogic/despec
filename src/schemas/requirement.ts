/**
 * Requirement schema for despec specifications.
 * Defines the structure and validation for individual requirements.
 */

import { z } from "zod";
import { AcceptanceCriterionSchema } from "./acceptance-criteria.js";
import {
  CategorySchema,
  DateTimeSchema,
  EARSTypeSchema,
  PrioritySchema,
  RequirementIdSchema,
  VALIDATION_LIMITS,
} from "./base.js";

/**
 * Requirement schema based on EARS methodology.
 * Each requirement has a unique ID, type, category, and acceptance criteria.
 *
 * @example
 * ```typescript
 * const requirement: Requirement = {
 *   id: "REQ-AUTH-a1b2c3d4e5",
 *   type: "event",
 *   category: "AUTH",
 *   description: "System shall authenticate users when they submit valid credentials",
 *   rationale: "User authentication is critical for security and access control",
 *   acceptance_criteria: [
 *     {
 *       id: "AC-x1y2z3w4v5",
 *       type: "behavioral",
 *       given: "user has valid credentials",
 *       when: "user submits login form",
 *       then: "system grants access and creates session",
 *       created_at: "2025-01-30T12:00:00.000Z"
 *     }
 *   ],
 *   priority: "critical",
 *   created_at: "2025-01-30T12:00:00.000Z"
 * };
 * ```
 */
export const RequirementSchema = z.object({
  /**
   * Unique identifier for the requirement.
   * Format: REQ-{CATEGORY}-{nanoid(16)}
   * @example "REQ-AUTH-a1b2c3d4e5f6g7h8"
   */
  id: RequirementIdSchema,

  /**
   * EARS requirement type.
   * - ubiquitous: Continuous behavior (always true)
   * - event: Triggered by specific events
   * - state: Active during specific states
   * - optional: Conditional or optional behavior
   */
  type: EARSTypeSchema,

  /**
   * User-defined category for organizing requirements.
   * Must be uppercase alphanumeric (e.g., AUTH, API, UI).
   * @minLength 1
   * @maxLength 20
   */
  category: CategorySchema,

  /**
   * Clear, concise description of the requirement.
   * Should state what the system must do.
   * @minLength 10
   * @maxLength 500
   */
  description: z
    .string()
    .min(
      VALIDATION_LIMITS.REQUIREMENT_DESCRIPTION_MIN,
      `Description must be at least ${VALIDATION_LIMITS.REQUIREMENT_DESCRIPTION_MIN} characters`,
    )
    .max(
      VALIDATION_LIMITS.REQUIREMENT_DESCRIPTION_MAX,
      `Description cannot exceed ${VALIDATION_LIMITS.REQUIREMENT_DESCRIPTION_MAX} characters`,
    ),

  /**
   * Explanation of why this requirement exists.
   * Should provide context and justification.
   * @minLength 10
   * @maxLength 500
   */
  rationale: z
    .string()
    .min(
      VALIDATION_LIMITS.REQUIREMENT_RATIONALE_MIN,
      `Rationale must be at least ${VALIDATION_LIMITS.REQUIREMENT_RATIONALE_MIN} characters`,
    )
    .max(
      VALIDATION_LIMITS.REQUIREMENT_RATIONALE_MAX,
      `Rationale cannot exceed ${VALIDATION_LIMITS.REQUIREMENT_RATIONALE_MAX} characters`,
    ),

  /**
   * List of acceptance criteria for this requirement.
   * Each criterion defines how to verify the requirement is met.
   * @minItems 1
   * @maxItems 10
   */
  acceptance_criteria: z
    .array(AcceptanceCriterionSchema)
    .min(
      VALIDATION_LIMITS.ACCEPTANCE_CRITERIA_MIN,
      `At least ${VALIDATION_LIMITS.ACCEPTANCE_CRITERIA_MIN} acceptance criterion required`,
    )
    .max(
      VALIDATION_LIMITS.ACCEPTANCE_CRITERIA_MAX,
      `Cannot exceed ${VALIDATION_LIMITS.ACCEPTANCE_CRITERIA_MAX} acceptance criteria`,
    ),

  /**
   * Priority level for implementation.
   * @default "medium"
   */
  priority: PrioritySchema,

  /**
   * ISO 8601 timestamp of requirement creation.
   * @format date-time
   */
  created_at: DateTimeSchema,
});

/**
 * TypeScript type for requirements.
 */
export type Requirement = z.infer<typeof RequirementSchema>;

/**
 * Validates a requirement.
 *
 * @param data - The data to validate
 * @returns Parsed and validated requirement
 * @throws {z.ZodError} If validation fails
 *
 * @example
 * ```typescript
 * const requirement = validateRequirement({
 *   id: "REQ-AUTH-a1b2c3d4e5",
 *   type: "event",
 *   category: "AUTH",
 *   description: "System shall authenticate users when credentials are submitted",
 *   rationale: "Required for secure access control",
 *   acceptance_criteria: [criterion],
 *   priority: "critical",
 *   created_at: new Date().toISOString()
 * });
 * ```
 */
export function validateRequirement(data: unknown): Requirement {
  return RequirementSchema.parse(data);
}

/**
 * Safely validates a requirement, returning a result object.
 *
 * @param data - The data to validate
 * @returns Success/failure result with parsed data or error
 *
 * @example
 * ```typescript
 * const result = safeValidateRequirement(rawData);
 * if (result.success) {
 *   console.log("Valid requirement:", result.data);
 * } else {
 *   console.error("Validation errors:", result.error);
 * }
 * ```
 */
export function safeValidateRequirement(
  data: unknown,
): z.util.SafeParseResult<Requirement> {
  return RequirementSchema.safeParse(data);
}

/**
 * Helper to extract category from requirement ID.
 *
 * @param requirementId - The requirement ID to parse
 * @returns The category portion of the ID, or null if invalid
 *
 * @example
 * ```typescript
 * const category = extractCategoryFromId("REQ-AUTH-a1b2c3d4e5");
 * console.log(category); // "AUTH"
 * ```
 */
export function extractCategoryFromId(requirementId: string): string | null {
  const match = requirementId.match(/^REQ-([A-Z0-9]+)-[a-zA-Z0-9_-]{16}$/);
  return match?.[1] ?? null;
}

/**
 * Helper to validate that a requirement's ID matches its category.
 *
 * @param requirement - The requirement to validate
 * @returns True if ID category matches requirement category
 *
 * @example
 * ```typescript
 * const isValid = validateRequirementIdMatchesCategory(requirement);
 * if (!isValid) {
 *   throw new Error("Requirement ID category does not match requirement category");
 * }
 * ```
 */
export function validateRequirementIdMatchesCategory(
  requirement: Requirement,
): boolean {
  const idCategory = extractCategoryFromId(requirement.id);
  return idCategory === requirement.category;
}
