/**
 * ID generation utilities using nanoid for collision-resistant identifiers.
 * All IDs use nanoid(16) for enterprise-grade collision resistance.
 */

import { nanoid } from "nanoid";
import {
  AcceptanceCriterionIdSchema,
  CategorySchema,
  EventIdSchema,
  RequirementIdSchema,
} from "./base.js";

/**
 * Length of the nanoid portion in all IDs.
 * With 16 characters from the default alphabet (64 chars):
 * - ~64^16 = 79,228,162,514,264,337,593,543,950,336 possible IDs
 * - At 1000 IDs/hour: ~2.4 billion years to reach 1% collision probability
 * - At 1,000,000 IDs/hour: ~2.4 million years to reach 1% collision probability
 * - Provides enterprise-grade collision resistance for high-scale systems
 */
export const ID_LENGTH = 16;

/**
 * Generates a unique requirement ID for a given category.
 *
 * @param category - The category for the requirement (will be uppercased)
 * @returns A requirement ID in format: REQ-{CATEGORY}-{nanoid(16)}
 * @throws {z.ZodError} If the category is invalid
 *
 * @example
 * ```typescript
 * const id = generateRequirementId("AUTH");
 * console.log(id); // "REQ-AUTH-a1b2c3d4e5"
 * ```
 */
export function generateRequirementId(category: string): string {
  // Validate and normalize the category
  const validatedCategory = CategorySchema.parse(category.toUpperCase());

  const id = `REQ-${validatedCategory}-${nanoid(ID_LENGTH)}`;

  // Validate the generated ID matches the expected format
  return RequirementIdSchema.parse(id);
}

/**
 * Generates a unique acceptance criterion ID.
 *
 * @returns An acceptance criterion ID in format: AC-{nanoid(16)}
 *
 * @example
 * ```typescript
 * const id = generateAcceptanceCriterionId();
 * console.log(id); // "AC-x1y2z3w4v5"
 * ```
 */
export function generateAcceptanceCriterionId(): string {
  const id = `AC-${nanoid(ID_LENGTH)}`;

  // Validate the generated ID matches the expected format
  return AcceptanceCriterionIdSchema.parse(id);
}

/**
 * Generates a unique event ID.
 *
 * @returns An event ID in format: EVT-{nanoid(16)}
 *
 * @example
 * ```typescript
 * const id = generateEventId();
 * console.log(id); // "EVT-m1n2o3p4q5"
 * ```
 */
export function generateEventId(): string {
  const id = `EVT-${nanoid(ID_LENGTH)}`;

  // Validate the generated ID matches the expected format
  return EventIdSchema.parse(id);
}

/**
 * Validates that a requirement ID format is correct.
 *
 * @param id - The ID to validate
 * @returns True if the ID is valid
 *
 * @example
 * ```typescript
 * if (isValidRequirementId("REQ-AUTH-a1b2c3d4e5")) {
 *   console.log("Valid requirement ID");
 * }
 * ```
 */
export function isValidRequirementId(id: string): boolean {
  return RequirementIdSchema.safeParse(id).success;
}

/**
 * Validates that an acceptance criterion ID format is correct.
 *
 * @param id - The ID to validate
 * @returns True if the ID is valid
 *
 * @example
 * ```typescript
 * if (isValidAcceptanceCriterionId("AC-x1y2z3w4v5")) {
 *   console.log("Valid acceptance criterion ID");
 * }
 * ```
 */
export function isValidAcceptanceCriterionId(id: string): boolean {
  return AcceptanceCriterionIdSchema.safeParse(id).success;
}

/**
 * Validates that an event ID format is correct.
 *
 * @param id - The ID to validate
 * @returns True if the ID is valid
 *
 * @example
 * ```typescript
 * if (isValidEventId("EVT-m1n2o3p4q5")) {
 *   console.log("Valid event ID");
 * }
 * ```
 */
export function isValidEventId(id: string): boolean {
  return EventIdSchema.safeParse(id).success;
}

/**
 * Extracts the category from a requirement ID.
 *
 * @param requirementId - The requirement ID to parse
 * @returns The category, or null if the ID is invalid
 *
 * @example
 * ```typescript
 * const category = extractCategory("REQ-AUTH-a1b2c3d4e5");
 * console.log(category); // "AUTH"
 * ```
 */
export function extractCategory(requirementId: string): string | null {
  if (!isValidRequirementId(requirementId)) {
    return null;
  }

  const match = requirementId.match(/^REQ-([A-Z0-9]+)-[a-zA-Z0-9_-]{16}$/);
  return match?.[1] ?? null;
}

/**
 * Generates multiple unique IDs in bulk.
 * Useful for batch operations and testing collision resistance.
 *
 * @param generator - The generator function to use
 * @param count - Number of IDs to generate
 * @returns Array of unique IDs
 *
 * @example
 * ```typescript
 * // Generate 1000 event IDs for testing
 * const ids = generateBulkIds(generateEventId, 1000);
 * console.log(new Set(ids).size === 1000); // Should be true
 * ```
 */
export function generateBulkIds(
  generator: () => string,
  count: number,
): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(generator());
  }
  return ids;
}

/**
 * Checks for collisions in a list of IDs.
 *
 * @param ids - Array of IDs to check
 * @returns Object with collision information
 *
 * @example
 * ```typescript
 * const ids = generateBulkIds(generateEventId, 1000000);
 * const result = checkForCollisions(ids);
 * console.log(`Collisions: ${result.collisionCount}`);
 * console.log(`Unique: ${result.uniqueCount}`);
 * ```
 */
export function checkForCollisions(ids: string[]): {
  totalCount: number;
  uniqueCount: number;
  collisionCount: number;
  hasCollisions: boolean;
  duplicates: string[];
} {
  const uniqueIds = new Set(ids);
  const duplicates: string[] = [];

  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.push(id);
    }
    seen.add(id);
  }

  return {
    totalCount: ids.length,
    uniqueCount: uniqueIds.size,
    collisionCount: ids.length - uniqueIds.size,
    hasCollisions: uniqueIds.size !== ids.length,
    duplicates: Array.from(new Set(duplicates)),
  };
}
