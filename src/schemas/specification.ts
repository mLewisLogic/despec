/**
 * Complete specification schema combining project metadata and requirements.
 * This represents the current state of a specification.
 */

import { z } from "zod";
import { VALIDATION_LIMITS } from "./base.js";
import { ProjectMetadataSchema } from "./project.js";
import { RequirementSchema } from "./requirement.js";

/**
 * Complete specification schema.
 * Combines project metadata with all requirements.
 *
 * @example
 * ```typescript
 * const specification: Specification = {
 *   project: {
 *     name: "My Web Application",
 *     description: "A modern web application with OAuth authentication",
 *     created_at: "2025-01-30T12:00:00.000Z",
 *     updated_at: "2025-01-30T15:30:00.000Z"
 *   },
 *   requirements: [req1, req2, req3]
 * };
 * ```
 */
export const SpecificationSchema = z.object({
  /**
   * Project-level metadata.
   */
  project: ProjectMetadataSchema,

  /**
   * List of all requirements in the specification.
   * @maxItems 1000
   */
  requirements: z
    .array(RequirementSchema)
    .max(
      VALIDATION_LIMITS.REQUIREMENTS_MAX,
      `Cannot exceed ${VALIDATION_LIMITS.REQUIREMENTS_MAX} requirements`,
    ),
});

/**
 * TypeScript type for specifications.
 */
export type Specification = z.infer<typeof SpecificationSchema>;

/**
 * Validates a specification.
 *
 * @param data - The data to validate
 * @returns Parsed and validated specification
 * @throws {z.ZodError} If validation fails
 */
export function validateSpecification(data: unknown): Specification {
  return SpecificationSchema.parse(data);
}

/**
 * Safely validates a specification, returning a result object.
 *
 * @param data - The data to validate
 * @returns Success/failure result with parsed data or error
 */
export function safeValidateSpecification(
  data: unknown,
): z.util.SafeParseResult<Specification> {
  return SpecificationSchema.safeParse(data);
}

/**
 * Creates an empty specification with initial project metadata.
 *
 * @param name - Project name
 * @param description - Project description
 * @returns A new empty specification
 *
 * @example
 * ```typescript
 * const spec = createEmptySpecification(
 *   "My Project",
 *   "A comprehensive project description"
 * );
 * ```
 */
export function createEmptySpecification(
  name: string,
  description: string,
): Specification {
  const now = new Date().toISOString();

  return {
    project: {
      name,
      description,
      created_at: now,
      updated_at: now,
    },
    requirements: [],
  };
}

/**
 * Gets all unique categories from a specification.
 *
 * @param specification - The specification to analyze
 * @returns Array of unique category names
 *
 * @example
 * ```typescript
 * const categories = getCategories(specification);
 * console.log(categories); // ["AUTH", "API", "UI"]
 * ```
 */
export function getCategories(specification: Specification): string[] {
  const categories = new Set(
    specification.requirements.map((req) => req.category),
  );
  return Array.from(categories).sort();
}

/**
 * Gets all requirements for a specific category.
 *
 * @param specification - The specification to search
 * @param category - The category to filter by
 * @returns Array of requirements in the category
 *
 * @example
 * ```typescript
 * const authRequirements = getRequirementsByCategory(specification, "AUTH");
 * ```
 */
export function getRequirementsByCategory(
  specification: Specification,
  category: string,
): z.infer<typeof RequirementSchema>[] {
  return specification.requirements.filter((req) => req.category === category);
}

/**
 * Finds a requirement by ID.
 *
 * @param specification - The specification to search
 * @param requirementId - The requirement ID to find
 * @returns The requirement, or undefined if not found
 *
 * @example
 * ```typescript
 * const requirement = findRequirementById(specification, "REQ-AUTH-a1b2c3d4e5");
 * if (requirement) {
 *   console.log(requirement.description);
 * }
 * ```
 */
export function findRequirementById(
  specification: Specification,
  requirementId: string,
): z.infer<typeof RequirementSchema> | undefined {
  return specification.requirements.find((req) => req.id === requirementId);
}

/**
 * Validates that all requirement IDs are unique.
 *
 * @param specification - The specification to validate
 * @returns True if all IDs are unique
 *
 * @example
 * ```typescript
 * if (!hasUniqueRequirementIds(specification)) {
 *   throw new Error("Duplicate requirement IDs detected");
 * }
 * ```
 */
export function hasUniqueRequirementIds(specification: Specification): boolean {
  const ids = specification.requirements.map((req) => req.id);
  return ids.length === new Set(ids).size;
}

/**
 * Validates that all acceptance criterion IDs are unique across the specification.
 *
 * @param specification - The specification to validate
 * @returns True if all acceptance criterion IDs are unique
 *
 * @example
 * ```typescript
 * if (!hasUniqueAcceptanceCriterionIds(specification)) {
 *   throw new Error("Duplicate acceptance criterion IDs detected");
 * }
 * ```
 */
export function hasUniqueAcceptanceCriterionIds(
  specification: Specification,
): boolean {
  const ids = specification.requirements.flatMap((req) =>
    req.acceptance_criteria.map((ac) => ac.id),
  );
  return ids.length === new Set(ids).size;
}
