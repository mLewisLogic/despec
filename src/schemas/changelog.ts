/**
 * Changelog schema for event sourcing with snapshots and indexes.
 * Manages the complete event log for a specification.
 */

import { z } from "zod";
import { DateTimeSchema, VALIDATION_LIMITS } from "./base.js";
import { ChangelogEventSchema, EVENT_TYPES } from "./changelog-events.js";

/**
 * Snapshot interval constant.
 * Create a snapshot every N events for efficient state reconstruction.
 */
export const SNAPSHOT_INTERVAL = 100;

/**
 * Index mapping for fast event lookups.
 */
export const ChangelogIndexesSchema = z.object({
  /**
   * Map of requirement IDs to event indices.
   * Enables fast lookup of all events affecting a specific requirement.
   * @example { "REQ-AUTH-a1b2c3d4e5": [0, 5, 12] }
   */
  by_requirement: z.record(z.string(), z.array(z.number())),

  /**
   * Map of event types to event indices.
   * Enables fast lookup of all events of a specific type.
   * @example { "requirement_created": [0, 10, 20] }
   */
  by_type: z.record(z.enum(EVENT_TYPES), z.array(z.number())),

  /**
   * Map of categories to event indices.
   * Enables fast lookup of all events affecting a specific category.
   * @example { "AUTH": [0, 5, 12, 15] }
   */
  by_category: z.record(z.string(), z.array(z.number())),
});

/**
 * Changelog metadata for monitoring and optimization.
 */
export const ChangelogMetadataSchema = z.object({
  /**
   * Total number of events in the changelog.
   */
  total_events: z
    .number()
    .int()
    .min(0)
    .max(VALIDATION_LIMITS.CHANGELOG_EVENTS_MAX),

  /**
   * Number of events since the last snapshot.
   * Used to determine when to create a new snapshot.
   */
  events_since_snapshot: z.number().int().min(0),

  /**
   * Count of events by type for analytics.
   * @example { "requirement_created": 10, "requirement_modified": 5 }
   */
  events_by_type: z.record(z.enum(EVENT_TYPES), z.number().int().min(0)),
});

/**
 * Complete changelog schema with events, indexes, and metadata.
 *
 * @example
 * ```typescript
 * const changelog: Changelog = {
 *   version: "1.0.0",
 *   events: [event1, event2, event3],
 *   last_snapshot: "2025-01-30T10:00:00.000Z",
 *   indexes: {
 *     by_requirement: { "REQ-AUTH-a1b2c3d4e5": [0, 2] },
 *     by_type: { "requirement_created": [0], "requirement_modified": [2] },
 *     by_category: { "AUTH": [0, 2] }
 *   },
 *   metadata: {
 *     total_events: 3,
 *     events_since_snapshot: 3,
 *     events_by_type: {
 *       "requirement_created": 1,
 *       "requirement_modified": 2,
 *       // ... other types
 *     }
 *   }
 * };
 * ```
 */
export const ChangelogSchema = z.object({
  /**
   * Semantic version of the changelog format.
   * Follows semver (e.g., "1.0.0").
   */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, {
    message: "Version must follow semantic versioning (e.g., 1.0.0)",
  }),

  /**
   * Append-only list of all events.
   * Events are never modified or deleted, only appended.
   * @maxItems 10000
   */
  events: z
    .array(ChangelogEventSchema)
    .max(
      VALIDATION_LIMITS.CHANGELOG_EVENTS_MAX,
      `Cannot exceed ${VALIDATION_LIMITS.CHANGELOG_EVENTS_MAX} events`,
    ),

  /**
   * ISO 8601 timestamp of the last snapshot creation.
   * @format date-time
   */
  last_snapshot: DateTimeSchema,

  /**
   * Fast-lookup indexes for querying events.
   */
  indexes: ChangelogIndexesSchema,

  /**
   * Metadata about the changelog for monitoring and optimization.
   */
  metadata: ChangelogMetadataSchema,
});

/**
 * TypeScript types for changelog components.
 */
export type ChangelogIndexes = z.infer<typeof ChangelogIndexesSchema>;
export type ChangelogMetadata = z.infer<typeof ChangelogMetadataSchema>;
export type Changelog = z.infer<typeof ChangelogSchema>;

/**
 * Validates a changelog.
 *
 * @param data - The data to validate
 * @returns Parsed and validated changelog
 * @throws {z.ZodError} If validation fails
 */
export function validateChangelog(data: unknown): Changelog {
  return ChangelogSchema.parse(data);
}

/**
 * Safely validates a changelog, returning a result object.
 *
 * @param data - The data to validate
 * @returns Success/failure result with parsed data or error
 */
export function safeValidateChangelog(
  data: unknown,
): z.util.SafeParseResult<Changelog> {
  return ChangelogSchema.safeParse(data);
}

/**
 * Creates an empty changelog with initial values.
 *
 * @param version - The semantic version for the changelog (default: "1.0.0")
 * @returns A new empty changelog
 *
 * @example
 * ```typescript
 * const changelog = createEmptyChangelog();
 * ```
 */
export function createEmptyChangelog(version = "1.0.0"): Changelog {
  const now = new Date().toISOString();

  return {
    version,
    events: [],
    last_snapshot: now,
    indexes: {
      by_requirement: {},
      by_type: {
        requirement_created: [],
        requirement_deleted: [],
        requirement_modified: [],
        requirement_recategorized: [],
        acceptance_criterion_added: [],
        acceptance_criterion_modified: [],
        acceptance_criterion_deleted: [],
        project_metadata_updated: [],
      },
      by_category: {},
    },
    metadata: {
      total_events: 0,
      events_since_snapshot: 0,
      events_by_type: {
        requirement_created: 0,
        requirement_deleted: 0,
        requirement_modified: 0,
        requirement_recategorized: 0,
        acceptance_criterion_added: 0,
        acceptance_criterion_modified: 0,
        acceptance_criterion_deleted: 0,
        project_metadata_updated: 0,
      },
    },
  };
}

/**
 * Checks if a snapshot should be created based on event count.
 *
 * @param changelog - The changelog to check
 * @returns True if a snapshot should be created
 *
 * @example
 * ```typescript
 * if (shouldCreateSnapshot(changelog)) {
 *   await createSnapshot(changelog);
 * }
 * ```
 */
export function shouldCreateSnapshot(changelog: Changelog): boolean {
  return changelog.metadata.events_since_snapshot >= SNAPSHOT_INTERVAL;
}
