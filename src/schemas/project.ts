/**
 * Project metadata schema for despec projects.
 * Defines the structure and validation for project-level information.
 */

import { z } from "zod";
import { DateTimeSchema, VALIDATION_LIMITS } from "./base.js";

/**
 * Project metadata schema.
 * Contains basic information about a despec project.
 *
 * @example
 * ```typescript
 * const metadata: ProjectMetadata = {
 *   name: "My Web Application",
 *   description: "A modern web application with OAuth authentication and real-time features.",
 *   created_at: "2025-01-30T12:00:00.000Z",
 *   updated_at: "2025-01-30T15:30:00.000Z"
 * };
 * ```
 */
export const ProjectMetadataSchema = z.object({
  /**
   * Human-readable project name.
   * @minLength 1
   * @maxLength 100
   */
  name: z
    .string()
    .min(1, "Project name cannot be empty")
    .max(
      VALIDATION_LIMITS.PROJECT_NAME_MAX,
      `Project name cannot exceed ${VALIDATION_LIMITS.PROJECT_NAME_MAX} characters`,
    ),

  /**
   * Detailed project description explaining purpose and scope.
   * @minLength 10
   * @maxLength 1000
   */
  description: z
    .string()
    .min(
      VALIDATION_LIMITS.PROJECT_DESCRIPTION_MIN,
      `Project description must be at least ${VALIDATION_LIMITS.PROJECT_DESCRIPTION_MIN} characters`,
    )
    .max(
      VALIDATION_LIMITS.PROJECT_DESCRIPTION_MAX,
      `Project description cannot exceed ${VALIDATION_LIMITS.PROJECT_DESCRIPTION_MAX} characters`,
    ),

  /**
   * ISO 8601 timestamp of project creation.
   * @format date-time
   */
  created_at: DateTimeSchema,

  /**
   * ISO 8601 timestamp of last project update.
   * @format date-time
   */
  updated_at: DateTimeSchema,
});

/**
 * TypeScript type for project metadata.
 */
export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

/**
 * Validates project metadata.
 *
 * @param data - The data to validate
 * @returns Parsed and validated project metadata
 * @throws {z.ZodError} If validation fails
 *
 * @example
 * ```typescript
 * const result = validateProjectMetadata({
 *   name: "My Project",
 *   description: "A comprehensive description of the project",
 *   created_at: new Date().toISOString(),
 *   updated_at: new Date().toISOString()
 * });
 * ```
 */
export function validateProjectMetadata(data: unknown): ProjectMetadata {
  return ProjectMetadataSchema.parse(data);
}

/**
 * Safely validates project metadata, returning a result object.
 *
 * @param data - The data to validate
 * @returns Success/failure result with parsed data or error
 *
 * @example
 * ```typescript
 * const result = safeValidateProjectMetadata(rawData);
 * if (result.success) {
 *   console.log("Valid metadata:", result.data);
 * } else {
 *   console.error("Validation errors:", result.error);
 * }
 * ```
 */
export function safeValidateProjectMetadata(
  data: unknown,
): z.util.SafeParseResult<ProjectMetadata> {
  return ProjectMetadataSchema.safeParse(data);
}
