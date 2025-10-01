/**
 * Snapshot schema for efficient state reconstruction.
 * Snapshots capture the complete state at a point in time to avoid replaying all events.
 */

import { z } from "zod";
import { DateTimeSchema } from "./base.js";
import { ProjectMetadataSchema } from "./project.js";
import { RequirementSchema } from "./requirement.js";

/**
 * Complete state snapshot at a point in time.
 * Contains all requirements and project metadata reconstructed from events.
 *
 * @example
 * ```typescript
 * const snapshot: Snapshot = {
 *   version: "1.0.0",
 *   timestamp: "2025-01-30T12:00:00.000Z",
 *   event_count: 150,
 *   state: {
 *     project: projectMetadata,
 *     requirements: [req1, req2, req3]
 *   }
 * };
 * ```
 */
export const SnapshotSchema = z.object({
  /**
   * Semantic version of the snapshot format.
   * Should match the changelog version.
   */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, {
    message: "Version must follow semantic versioning (e.g., 1.0.0)",
  }),

  /**
   * ISO 8601 timestamp when the snapshot was created.
   * @format date-time
   */
  timestamp: DateTimeSchema,

  /**
   * Number of events that were processed to create this snapshot.
   * Helps verify snapshot integrity and identify which events to replay.
   */
  event_count: z.number().int().min(0),

  /**
   * The complete state at this point in time.
   */
  state: z.object({
    /**
     * Project metadata at the time of the snapshot.
     */
    project: ProjectMetadataSchema,

    /**
     * All requirements at the time of the snapshot.
     * Includes all acceptance criteria.
     */
    requirements: z.array(RequirementSchema),
  }),
});

/**
 * TypeScript type for snapshots.
 */
export type Snapshot = z.infer<typeof SnapshotSchema>;

/**
 * Validates a snapshot.
 *
 * @param data - The data to validate
 * @returns Parsed and validated snapshot
 * @throws {z.ZodError} If validation fails
 */
export function validateSnapshot(data: unknown): Snapshot {
  return SnapshotSchema.parse(data);
}

/**
 * Safely validates a snapshot, returning a result object.
 *
 * @param data - The data to validate
 * @returns Success/failure result with parsed data or error
 */
export function safeValidateSnapshot(
  data: unknown,
): z.util.SafeParseResult<Snapshot> {
  return SnapshotSchema.safeParse(data);
}

/**
 * Creates a snapshot from current state.
 *
 * @param version - The semantic version for the snapshot
 * @param eventCount - Number of events processed
 * @param project - Current project metadata
 * @param requirements - Current requirements
 * @returns A new snapshot
 *
 * @example
 * ```typescript
 * const snapshot = createSnapshot(
 *   "1.0.0",
 *   150,
 *   projectMetadata,
 *   requirements
 * );
 * ```
 */
export function createSnapshot(
  version: string,
  eventCount: number,
  project: z.infer<typeof ProjectMetadataSchema>,
  requirements: z.infer<typeof RequirementSchema>[],
): Snapshot {
  return {
    version,
    timestamp: new Date().toISOString(),
    event_count: eventCount,
    state: {
      project,
      requirements,
    },
  };
}
