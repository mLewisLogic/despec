/**
 * xdd schemas module.
 * Comprehensive Zod schemas for the specification-driven development system.
 *
 * This module provides:
 * - Runtime validation with Zod
 * - TypeScript type inference
 * - JSON Schema generation
 * - Collision-resistant ID generation
 * - Event sourcing support
 */

// Acceptance criteria
export * from "./acceptance-criteria.js";
// Base schemas and constants
export * from "./base.js";
// Changelog with indexes and metadata
export * from "./changelog.js";
// Changelog events (8 event types)
export * from "./changelog-events.js";
// ID generation utilities
export * from "./id-generator.js";
// JSON Schema generation
export * from "./json-schema.js";
// Project metadata
export * from "./project.js";
// Requirements
export * from "./requirement.js";
// Snapshots for state reconstruction
export * from "./snapshot.js";
// Complete specification
export * from "./specification.js";
