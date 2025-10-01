/**
 * JSON Schema generation from Zod schemas.
 * Enables schema documentation, validation tools, and integration with other systems.
 */

import { z } from "zod";
import { AcceptanceCriterionSchema } from "./acceptance-criteria.js";
import { ChangelogSchema } from "./changelog.js";
import { ChangelogEventSchema } from "./changelog-events.js";
import { ProjectMetadataSchema } from "./project.js";
import { RequirementSchema } from "./requirement.js";
import { SnapshotSchema } from "./snapshot.js";
import { SpecificationSchema } from "./specification.js";

/**
 * Type for JSON Schema objects (Draft 2020-12).
 * This represents the native Zod v4 JSON Schema output format.
 */
export type JSONSchemaType = Record<string, unknown> & {
  type?: string | string[];
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean | Record<string, unknown>;
};

/**
 * Generates JSON Schema for the ProjectMetadata schema.
 *
 * @returns JSON Schema object
 *
 * @example
 * ```typescript
 * const jsonSchema = getProjectMetadataJsonSchema();
 * console.log(JSON.stringify(jsonSchema, null, 2));
 * ```
 */
export function getProjectMetadataJsonSchema(): JSONSchemaType {
  return z.toJSONSchema(ProjectMetadataSchema, {
    target: "draft-7",
  });
}

/**
 * Generates JSON Schema for the AcceptanceCriterion schema.
 *
 * @returns JSON Schema object
 */
export function getAcceptanceCriterionJsonSchema(): JSONSchemaType {
  return z.toJSONSchema(AcceptanceCriterionSchema, {
    target: "draft-7",
  });
}

/**
 * Generates JSON Schema for the Requirement schema.
 *
 * @returns JSON Schema object
 */
export function getRequirementJsonSchema(): JSONSchemaType {
  return z.toJSONSchema(RequirementSchema, {
    target: "draft-7",
  });
}

/**
 * Generates JSON Schema for the ChangelogEvent schema.
 *
 * @returns JSON Schema object
 */
export function getChangelogEventJsonSchema(): JSONSchemaType {
  return z.toJSONSchema(ChangelogEventSchema, {
    target: "draft-7",
  });
}

/**
 * Generates JSON Schema for the Changelog schema.
 *
 * @returns JSON Schema object
 */
export function getChangelogJsonSchema(): JSONSchemaType {
  return z.toJSONSchema(ChangelogSchema, {
    target: "draft-7",
  });
}

/**
 * Generates JSON Schema for the Snapshot schema.
 *
 * @returns JSON Schema object
 */
export function getSnapshotJsonSchema(): JSONSchemaType {
  return z.toJSONSchema(SnapshotSchema, {
    target: "draft-7",
  });
}

/**
 * Generates JSON Schema for the Specification schema.
 *
 * @returns JSON Schema object
 */
export function getSpecificationJsonSchema(): JSONSchemaType {
  return z.toJSONSchema(SpecificationSchema, {
    target: "draft-7",
  });
}

/**
 * Generates all JSON Schemas as a collection.
 *
 * @returns Object containing all JSON Schemas
 *
 * @example
 * ```typescript
 * const schemas = getAllJsonSchemas();
 * console.log(Object.keys(schemas)); // All schema names
 * ```
 */
export function getAllJsonSchemas(): Record<string, JSONSchemaType> {
  return {
    ProjectMetadata: getProjectMetadataJsonSchema(),
    AcceptanceCriterion: getAcceptanceCriterionJsonSchema(),
    Requirement: getRequirementJsonSchema(),
    ChangelogEvent: getChangelogEventJsonSchema(),
    Changelog: getChangelogJsonSchema(),
    Snapshot: getSnapshotJsonSchema(),
    Specification: getSpecificationJsonSchema(),
  };
}

/**
 * Exports all JSON Schemas as formatted JSON string.
 *
 * @param indent - Number of spaces for indentation (default: 2)
 * @returns Formatted JSON string containing all schemas
 *
 * @example
 * ```typescript
 * const json = exportAllJsonSchemas();
 * await fs.writeFile("schemas.json", json);
 * ```
 */
export function exportAllJsonSchemas(indent = 2): string {
  return JSON.stringify(getAllJsonSchemas(), null, indent);
}

/**
 * Exports a single JSON Schema as formatted JSON string.
 *
 * @param schemaName - Name of the schema to export
 * @param indent - Number of spaces for indentation (default: 2)
 * @returns Formatted JSON string
 *
 * @example
 * ```typescript
 * const json = exportJsonSchema("Requirement");
 * await fs.writeFile("requirement-schema.json", json);
 * ```
 */
export function exportJsonSchema(
  schemaName: keyof ReturnType<typeof getAllJsonSchemas>,
  indent = 2,
): string {
  const schemas = getAllJsonSchemas();
  return JSON.stringify(schemas[schemaName], null, indent);
}
