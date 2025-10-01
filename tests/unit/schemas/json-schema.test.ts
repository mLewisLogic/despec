/**
 * Unit tests for JSON Schema generation from Zod schemas.
 */

import { describe, expect, it } from "bun:test";
import {
  exportAllJsonSchemas,
  exportJsonSchema,
  getAcceptanceCriterionJsonSchema,
  getAllJsonSchemas,
  getChangelogEventJsonSchema,
  getChangelogJsonSchema,
  getProjectMetadataJsonSchema,
  getRequirementJsonSchema,
  getSnapshotJsonSchema,
  getSpecificationJsonSchema,
} from "../../../src/schemas/json-schema.js";

describe("JSON Schema Generation", () => {
  describe("Individual schema generation", () => {
    it("generates ProjectMetadata JSON Schema", () => {
      const schema = getProjectMetadataJsonSchema();

      expect(schema).toBeDefined();
      expect(typeof schema).toBe("object");

      // Verify it's a valid JSON Schema
      const schemaObj = schema as Record<string, unknown>;
      expect(schemaObj.type).toBe("object");
      expect(schemaObj.properties).toBeDefined();

      const properties = schemaObj.properties as Record<string, unknown>;
      expect(properties.name).toBeDefined();
      expect(properties.description).toBeDefined();
      expect(properties.created_at).toBeDefined();
      expect(properties.updated_at).toBeDefined();
    });

    it("generates AcceptanceCriterion JSON Schema", () => {
      const schema = getAcceptanceCriterionJsonSchema();

      expect(schema).toBeDefined();
      expect(typeof schema).toBe("object");

      const schemaObj = schema as Record<string, unknown>;
      // Should be a discriminated union
      expect(schemaObj.anyOf || schemaObj.oneOf).toBeDefined();
    });

    it("generates Requirement JSON Schema", () => {
      const schema = getRequirementJsonSchema();

      expect(schema).toBeDefined();
      expect(typeof schema).toBe("object");

      const schemaObj = schema as Record<string, unknown>;
      expect(schemaObj.type).toBe("object");

      const properties = schemaObj.properties as Record<string, unknown>;
      expect(properties.id).toBeDefined();
      expect(properties.type).toBeDefined();
      expect(properties.category).toBeDefined();
      expect(properties.description).toBeDefined();
      expect(properties.acceptance_criteria).toBeDefined();
    });

    it("generates ChangelogEvent JSON Schema", () => {
      const schema = getChangelogEventJsonSchema();

      expect(schema).toBeDefined();
      expect(typeof schema).toBe("object");

      // Should be a discriminated union of 8 event types
      const schemaObj = schema as Record<string, unknown>;
      expect(schemaObj.anyOf || schemaObj.oneOf).toBeDefined();
    });

    it("generates Changelog JSON Schema", () => {
      const schema = getChangelogJsonSchema();

      expect(schema).toBeDefined();
      expect(typeof schema).toBe("object");

      const schemaObj = schema as Record<string, unknown>;
      expect(schemaObj.type).toBe("object");

      const properties = schemaObj.properties as Record<string, unknown>;
      expect(properties.version).toBeDefined();
      expect(properties.events).toBeDefined();
      expect(properties.indexes).toBeDefined();
      expect(properties.metadata).toBeDefined();
    });

    it("generates Snapshot JSON Schema", () => {
      const schema = getSnapshotJsonSchema();

      expect(schema).toBeDefined();
      expect(typeof schema).toBe("object");

      const schemaObj = schema as Record<string, unknown>;
      expect(schemaObj.type).toBe("object");

      const properties = schemaObj.properties as Record<string, unknown>;
      expect(properties.version).toBeDefined();
      expect(properties.timestamp).toBeDefined();
      expect(properties.event_count).toBeDefined();
      expect(properties.state).toBeDefined();
    });

    it("generates Specification JSON Schema", () => {
      const schema = getSpecificationJsonSchema();

      expect(schema).toBeDefined();
      expect(typeof schema).toBe("object");

      const schemaObj = schema as Record<string, unknown>;
      expect(schemaObj.type).toBe("object");

      const properties = schemaObj.properties as Record<string, unknown>;
      expect(properties.project).toBeDefined();
      expect(properties.requirements).toBeDefined();
    });
  });

  describe("getAllJsonSchemas", () => {
    it("returns all schemas", () => {
      const schemas = getAllJsonSchemas();

      expect(schemas).toBeDefined();
      expect(typeof schemas).toBe("object");

      // Verify all expected schemas are present
      expect(schemas.ProjectMetadata).toBeDefined();
      expect(schemas.AcceptanceCriterion).toBeDefined();
      expect(schemas.Requirement).toBeDefined();
      expect(schemas.ChangelogEvent).toBeDefined();
      expect(schemas.Changelog).toBeDefined();
      expect(schemas.Snapshot).toBeDefined();
      expect(schemas.Specification).toBeDefined();
    });

    it("returns exactly 7 schemas", () => {
      const schemas = getAllJsonSchemas();
      const keys = Object.keys(schemas);
      expect(keys).toHaveLength(7);
    });
  });

  describe("exportAllJsonSchemas", () => {
    it("exports all schemas as valid JSON string", () => {
      const jsonString = exportAllJsonSchemas();

      expect(jsonString).toBeDefined();
      expect(typeof jsonString).toBe("string");

      // Should be valid JSON
      const parsed = JSON.parse(jsonString);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe("object");

      // Verify all schemas are present
      expect(parsed.ProjectMetadata).toBeDefined();
      expect(parsed.AcceptanceCriterion).toBeDefined();
      expect(parsed.Requirement).toBeDefined();
    });

    it("supports custom indentation", () => {
      const default_indent = exportAllJsonSchemas();
      const custom_indent = exportAllJsonSchemas(4);

      expect(default_indent).toBeDefined();
      expect(custom_indent).toBeDefined();
      expect(default_indent).not.toBe(custom_indent);

      // Both should be valid JSON
      expect(JSON.parse(default_indent)).toBeDefined();
      expect(JSON.parse(custom_indent)).toBeDefined();
    });
  });

  describe("exportJsonSchema", () => {
    it("exports individual schema as valid JSON string", () => {
      const jsonString = exportJsonSchema("Requirement");

      expect(jsonString).toBeDefined();
      expect(typeof jsonString).toBe("string");

      // Should be valid JSON
      const parsed = JSON.parse(jsonString);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe("object");
    });

    it("supports custom indentation", () => {
      const default_indent = exportJsonSchema("Requirement");
      const custom_indent = exportJsonSchema("Requirement", 4);

      expect(default_indent).toBeDefined();
      expect(custom_indent).toBeDefined();
      expect(default_indent).not.toBe(custom_indent);

      // Both should be valid JSON
      expect(JSON.parse(default_indent)).toBeDefined();
      expect(JSON.parse(custom_indent)).toBeDefined();
    });

    it("exports all schema types correctly", () => {
      const schemaNames = [
        "ProjectMetadata",
        "AcceptanceCriterion",
        "Requirement",
        "ChangelogEvent",
        "Changelog",
        "Snapshot",
        "Specification",
      ] as const;

      for (const schemaName of schemaNames) {
        const jsonString = exportJsonSchema(schemaName);
        expect(jsonString).toBeDefined();

        const parsed = JSON.parse(jsonString);
        expect(parsed).toBeDefined();
      }
    });
  });

  describe("Schema validation properties", () => {
    it("includes validation constraints in JSON Schema", () => {
      const schema = getProjectMetadataJsonSchema();
      const schemaObj = schema as Record<string, unknown>;
      const properties = schemaObj.properties as Record<string, unknown>;

      // Name should have maxLength constraint
      const nameSchema = properties.name as Record<string, unknown>;
      expect(nameSchema.maxLength).toBe(100);

      // Description should have min/max length constraints
      const descSchema = properties.description as Record<string, unknown>;
      expect(descSchema.minLength).toBe(10);
      expect(descSchema.maxLength).toBe(1000);
    });

    it("includes required fields in JSON Schema", () => {
      const schema = getProjectMetadataJsonSchema();
      const schemaObj = schema as Record<string, unknown>;

      expect(schemaObj.required).toBeDefined();
      const required = schemaObj.required as string[];
      expect(required).toContain("name");
      expect(required).toContain("description");
      expect(required).toContain("created_at");
      expect(required).toContain("updated_at");
    });

    it("includes enum values in JSON Schema", () => {
      const schema = getRequirementJsonSchema();
      const schemaObj = schema as Record<string, unknown>;
      const properties = schemaObj.properties as Record<string, unknown>;

      // Type field should be an enum
      const typeSchema = properties.type as Record<string, unknown>;
      expect(typeSchema.enum).toBeDefined();
      const typeEnum = typeSchema.enum as string[];
      expect(typeEnum).toContain("ubiquitous");
      expect(typeEnum).toContain("event");
      expect(typeEnum).toContain("state");
      expect(typeEnum).toContain("optional");

      // Priority field should be an enum
      const prioritySchema = properties.priority as Record<string, unknown>;
      expect(prioritySchema.enum).toBeDefined();
      const priorityEnum = prioritySchema.enum as string[];
      expect(priorityEnum).toContain("critical");
      expect(priorityEnum).toContain("high");
      expect(priorityEnum).toContain("medium");
      expect(priorityEnum).toContain("low");
    });

    it("includes pattern constraints for IDs", () => {
      const schema = getRequirementJsonSchema();
      const schemaObj = schema as Record<string, unknown>;
      const properties = schemaObj.properties as Record<string, unknown>;

      const idSchema = properties.id as Record<string, unknown>;
      expect(idSchema.pattern).toBeDefined();
      expect(typeof idSchema.pattern).toBe("string");
    });
  });
});
