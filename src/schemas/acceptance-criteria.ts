/**
 * Acceptance criteria schemas for despec requirements.
 * Supports both behavioral (Given-When-Then) and assertion formats.
 */

import { z } from "zod";
import {
  AcceptanceCriterionIdSchema,
  DateTimeSchema,
  VALIDATION_LIMITS,
} from "./base.js";

/**
 * Behavioral acceptance criterion using Given-When-Then format.
 * This format is ideal for describing specific scenarios and expected outcomes.
 *
 * @example
 * ```typescript
 * const criterion: BehavioralAcceptanceCriterion = {
 *   id: "AC-a1b2c3d4e5",
 *   type: "behavioral",
 *   given: "user is authenticated with valid OAuth token",
 *   when: "user clicks the logout button",
 *   then: "session is terminated and user is redirected to login page",
 *   created_at: "2025-01-30T12:00:00.000Z"
 * };
 * ```
 */
export const BehavioralAcceptanceCriterionSchema = z.object({
  /**
   * Unique identifier for the acceptance criterion.
   * Format: AC-{nanoid(16)}
   */
  id: AcceptanceCriterionIdSchema,

  /**
   * Discriminator for behavioral criteria.
   */
  type: z.literal("behavioral"),

  /**
   * Precondition or initial state.
   * Describes the context before the action occurs.
   * @minLength 5
   * @maxLength 200
   */
  given: z
    .string()
    .min(
      VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MIN,
      `Given clause must be at least ${VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MIN} characters`,
    )
    .max(
      VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MAX,
      `Given clause cannot exceed ${VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MAX} characters`,
    ),

  /**
   * Trigger event or action.
   * Describes what happens or what action is taken.
   * @minLength 5
   * @maxLength 200
   */
  when: z
    .string()
    .min(
      VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MIN,
      `When clause must be at least ${VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MIN} characters`,
    )
    .max(
      VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MAX,
      `When clause cannot exceed ${VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MAX} characters`,
    ),

  /**
   * Expected outcome or result.
   * Describes the expected state or behavior after the action.
   * @minLength 5
   * @maxLength 200
   */
  // biome-ignore lint/suspicious/noThenProperty: Required by EARS specification (given/when/then format)
  then: z
    .string()
    .min(
      VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MIN,
      `Then clause must be at least ${VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MIN} characters`,
    )
    .max(
      VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MAX,
      `Then clause cannot exceed ${VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MAX} characters`,
    ),

  /**
   * ISO 8601 timestamp of criterion creation.
   * @format date-time
   */
  created_at: DateTimeSchema,
});

/**
 * Assertion acceptance criterion for simple declarative statements.
 * This format is ideal for stating invariants, constraints, or simple requirements.
 *
 * @example
 * ```typescript
 * const criterion: AssertionAcceptanceCriterion = {
 *   id: "AC-x1y2z3w4v5",
 *   type: "assertion",
 *   statement: "All API responses must include proper CORS headers",
 *   created_at: "2025-01-30T12:00:00.000Z"
 * };
 * ```
 */
export const AssertionAcceptanceCriterionSchema = z.object({
  /**
   * Unique identifier for the acceptance criterion.
   * Format: AC-{nanoid(16)}
   */
  id: AcceptanceCriterionIdSchema,

  /**
   * Discriminator for assertion criteria.
   */
  type: z.literal("assertion"),

  /**
   * Single declarative statement describing the requirement.
   * Should be clear, testable, and unambiguous.
   * @minLength 5
   * @maxLength 200
   */
  statement: z
    .string()
    .min(
      VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MIN,
      `Statement must be at least ${VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MIN} characters`,
    )
    .max(
      VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MAX,
      `Statement cannot exceed ${VALIDATION_LIMITS.ACCEPTANCE_CRITERION_FIELD_MAX} characters`,
    ),

  /**
   * ISO 8601 timestamp of criterion creation.
   * @format date-time
   */
  created_at: DateTimeSchema,
});

/**
 * Discriminated union of acceptance criterion types.
 * Uses the `type` field as the discriminator for type safety.
 */
export const AcceptanceCriterionSchema = z.discriminatedUnion("type", [
  BehavioralAcceptanceCriterionSchema,
  AssertionAcceptanceCriterionSchema,
]);

/**
 * TypeScript types for acceptance criteria.
 */
export type BehavioralAcceptanceCriterion = z.infer<
  typeof BehavioralAcceptanceCriterionSchema
>;
export type AssertionAcceptanceCriterion = z.infer<
  typeof AssertionAcceptanceCriterionSchema
>;
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

/**
 * Type guard to check if a criterion is behavioral.
 *
 * @param criterion - The acceptance criterion to check
 * @returns True if the criterion is behavioral
 *
 * @example
 * ```typescript
 * if (isBehavioralCriterion(criterion)) {
 *   console.log(`Given: ${criterion.given}`);
 *   console.log(`When: ${criterion.when}`);
 *   console.log(`Then: ${criterion.then}`);
 * }
 * ```
 */
export function isBehavioralCriterion(
  criterion: AcceptanceCriterion,
): criterion is BehavioralAcceptanceCriterion {
  return criterion.type === "behavioral";
}

/**
 * Type guard to check if a criterion is an assertion.
 *
 * @param criterion - The acceptance criterion to check
 * @returns True if the criterion is an assertion
 *
 * @example
 * ```typescript
 * if (isAssertionCriterion(criterion)) {
 *   console.log(`Statement: ${criterion.statement}`);
 * }
 * ```
 */
export function isAssertionCriterion(
  criterion: AcceptanceCriterion,
): criterion is AssertionAcceptanceCriterion {
  return criterion.type === "assertion";
}

/**
 * Validates an acceptance criterion.
 *
 * @param data - The data to validate
 * @returns Parsed and validated acceptance criterion
 * @throws {z.ZodError} If validation fails
 */
export function validateAcceptanceCriterion(
  data: unknown,
): AcceptanceCriterion {
  return AcceptanceCriterionSchema.parse(data);
}

/**
 * Safely validates an acceptance criterion, returning a result object.
 *
 * @param data - The data to validate
 * @returns Success/failure result with parsed data or error
 */
export function safeValidateAcceptanceCriterion(
  data: unknown,
): z.util.SafeParseResult<AcceptanceCriterion> {
  return AcceptanceCriterionSchema.safeParse(data);
}
