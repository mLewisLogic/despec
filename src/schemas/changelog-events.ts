/**
 * Changelog event schemas for event sourcing.
 * Defines 8 event types for tracking all changes to specifications.
 */

import { z } from "zod";
import { AcceptanceCriterionSchema } from "./acceptance-criteria.js";
import {
  AcceptanceCriterionIdSchema,
  CategorySchema,
  DateTimeSchema,
  EARSTypeSchema,
  EventIdSchema,
  PrioritySchema,
  RequirementIdSchema,
} from "./base.js";
import { RequirementSchema } from "./requirement.js";

/**
 * Base event schema with common fields for all event types.
 */
const BaseEventSchema = z.object({
  /**
   * Unique identifier for this event.
   * Format: EVT-{nanoid(16)}
   */
  id: EventIdSchema,

  /**
   * ISO 8601 timestamp when the event occurred.
   * @format date-time
   */
  timestamp: DateTimeSchema,

  /**
   * Optional metadata about the event source or context.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Event: Requirement created.
 * Emitted when a new requirement is added to the specification.
 *
 * @example
 * ```typescript
 * const event: RequirementCreatedEvent = {
 *   id: "EVT-m1n2o3p4q5",
 *   type: "requirement_created",
 *   timestamp: "2025-01-30T12:00:00.000Z",
 *   requirement: requirement
 * };
 * ```
 */
export const RequirementCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal("requirement_created"),
  /**
   * The complete requirement that was created.
   */
  requirement: RequirementSchema,
});

/**
 * Event: Requirement deleted.
 * Emitted when a requirement is removed from the specification.
 *
 * @example
 * ```typescript
 * const event: RequirementDeletedEvent = {
 *   id: "EVT-m1n2o3p4q5",
 *   type: "requirement_deleted",
 *   timestamp: "2025-01-30T12:00:00.000Z",
 *   requirement_id: "REQ-AUTH-a1b2c3d4e5",
 *   reason: "Requirement superseded by REQ-AUTH-x1y2z3w4v5"
 * };
 * ```
 */
export const RequirementDeletedEventSchema = BaseEventSchema.extend({
  type: z.literal("requirement_deleted"),
  /**
   * ID of the requirement that was deleted.
   */
  requirement_id: RequirementIdSchema,
  /**
   * Optional reason for deletion.
   */
  reason: z.string().max(500).optional(),
});

/**
 * Field-level changes for requirement modification.
 */
const RequirementFieldChangesSchema = z.object({
  /**
   * Changes to the requirement type.
   */
  type: z
    .object({
      old_value: EARSTypeSchema,
      new_value: EARSTypeSchema,
    })
    .optional(),
  /**
   * Changes to the description.
   */
  description: z
    .object({
      old_value: z.string(),
      new_value: z.string(),
    })
    .optional(),
  /**
   * Changes to the rationale.
   */
  rationale: z
    .object({
      old_value: z.string(),
      new_value: z.string(),
    })
    .optional(),
  /**
   * Changes to the priority.
   */
  priority: z
    .object({
      old_value: PrioritySchema,
      new_value: PrioritySchema,
    })
    .optional(),
});

/**
 * Event: Requirement modified.
 * Emitted when one or more fields of a requirement are updated.
 *
 * @example
 * ```typescript
 * const event: RequirementModifiedEvent = {
 *   id: "EVT-m1n2o3p4q5",
 *   type: "requirement_modified",
 *   timestamp: "2025-01-30T12:00:00.000Z",
 *   requirement_id: "REQ-AUTH-a1b2c3d4e5",
 *   changes: {
 *     priority: {
 *       old_value: "medium",
 *       new_value: "critical"
 *     }
 *   }
 * };
 * ```
 */
export const RequirementModifiedEventSchema = BaseEventSchema.extend({
  type: z.literal("requirement_modified"),
  /**
   * ID of the requirement that was modified.
   */
  requirement_id: RequirementIdSchema,
  /**
   * Field-level changes that were made.
   */
  changes: RequirementFieldChangesSchema,
});

/**
 * Event: Requirement recategorized.
 * Emitted when a requirement's category changes, resulting in a new ID.
 * This is treated as an identity change requiring special handling.
 *
 * @example
 * ```typescript
 * const event: RequirementRecategorizedEvent = {
 *   id: "EVT-m1n2o3p4q5",
 *   type: "requirement_recategorized",
 *   timestamp: "2025-01-30T12:00:00.000Z",
 *   old_requirement_id: "REQ-AUTH-a1b2c3d4e5",
 *   new_requirement_id: "REQ-SECURITY-x1y2z3w4v5",
 *   old_category: "AUTH",
 *   new_category: "SECURITY"
 * };
 * ```
 */
export const RequirementRecategorizedEventSchema = BaseEventSchema.extend({
  type: z.literal("requirement_recategorized"),
  /**
   * Original requirement ID before recategorization.
   */
  old_requirement_id: RequirementIdSchema,
  /**
   * New requirement ID after recategorization.
   */
  new_requirement_id: RequirementIdSchema,
  /**
   * Original category.
   */
  old_category: CategorySchema,
  /**
   * New category.
   */
  new_category: CategorySchema,
});

/**
 * Event: Acceptance criterion added.
 * Emitted when a new acceptance criterion is added to a requirement.
 *
 * @example
 * ```typescript
 * const event: AcceptanceCriterionAddedEvent = {
 *   id: "EVT-m1n2o3p4q5",
 *   type: "acceptance_criterion_added",
 *   timestamp: "2025-01-30T12:00:00.000Z",
 *   requirement_id: "REQ-AUTH-a1b2c3d4e5",
 *   criterion: criterion
 * };
 * ```
 */
export const AcceptanceCriterionAddedEventSchema = BaseEventSchema.extend({
  type: z.literal("acceptance_criterion_added"),
  /**
   * ID of the requirement this criterion belongs to.
   */
  requirement_id: RequirementIdSchema,
  /**
   * The acceptance criterion that was added.
   */
  criterion: AcceptanceCriterionSchema,
});

/**
 * Field-level changes for acceptance criterion modification.
 */
const AcceptanceCriterionFieldChangesSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("behavioral"),
    given: z
      .object({
        old_value: z.string(),
        new_value: z.string(),
      })
      .optional(),
    when: z
      .object({
        old_value: z.string(),
        new_value: z.string(),
      })
      .optional(),
    // biome-ignore lint/suspicious/noThenProperty: Required by EARS specification (given/when/then format)
    then: z
      .object({
        old_value: z.string(),
        new_value: z.string(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("assertion"),
    statement: z
      .object({
        old_value: z.string(),
        new_value: z.string(),
      })
      .optional(),
  }),
]);

/**
 * Event: Acceptance criterion modified.
 * Emitted when an existing acceptance criterion is updated.
 *
 * @example
 * ```typescript
 * const event: AcceptanceCriterionModifiedEvent = {
 *   id: "EVT-m1n2o3p4q5",
 *   type: "acceptance_criterion_modified",
 *   timestamp: "2025-01-30T12:00:00.000Z",
 *   requirement_id: "REQ-AUTH-a1b2c3d4e5",
 *   criterion_id: "AC-x1y2z3w4v5",
 *   changes: {
 *     type: "behavioral",
 *     then: {
 *       old_value: "system creates session",
 *       new_value: "system creates secure session with 2FA"
 *     }
 *   }
 * };
 * ```
 */
export const AcceptanceCriterionModifiedEventSchema = BaseEventSchema.extend({
  type: z.literal("acceptance_criterion_modified"),
  /**
   * ID of the requirement this criterion belongs to.
   */
  requirement_id: RequirementIdSchema,
  /**
   * ID of the criterion that was modified.
   */
  criterion_id: AcceptanceCriterionIdSchema,
  /**
   * Field-level changes that were made.
   */
  changes: AcceptanceCriterionFieldChangesSchema,
});

/**
 * Event: Acceptance criterion deleted.
 * Emitted when an acceptance criterion is removed from a requirement.
 *
 * @example
 * ```typescript
 * const event: AcceptanceCriterionDeletedEvent = {
 *   id: "EVT-m1n2o3p4q5",
 *   type: "acceptance_criterion_deleted",
 *   timestamp: "2025-01-30T12:00:00.000Z",
 *   requirement_id: "REQ-AUTH-a1b2c3d4e5",
 *   criterion_id: "AC-x1y2z3w4v5",
 *   reason: "Criterion merged into AC-a1b2c3d4e5"
 * };
 * ```
 */
export const AcceptanceCriterionDeletedEventSchema = BaseEventSchema.extend({
  type: z.literal("acceptance_criterion_deleted"),
  /**
   * ID of the requirement this criterion belongs to.
   */
  requirement_id: RequirementIdSchema,
  /**
   * ID of the criterion that was deleted.
   */
  criterion_id: AcceptanceCriterionIdSchema,
  /**
   * Optional reason for deletion.
   */
  reason: z.string().max(500).optional(),
});

/**
 * Field-level changes for project metadata modification.
 */
const ProjectMetadataFieldChangesSchema = z.object({
  /**
   * Changes to the project name.
   */
  name: z
    .object({
      old_value: z.string(),
      new_value: z.string(),
    })
    .optional(),
  /**
   * Changes to the project description.
   */
  description: z
    .object({
      old_value: z.string(),
      new_value: z.string(),
    })
    .optional(),
});

/**
 * Event: Project metadata updated.
 * Emitted when project-level information is modified.
 *
 * @example
 * ```typescript
 * const event: ProjectMetadataUpdatedEvent = {
 *   id: "EVT-m1n2o3p4q5",
 *   type: "project_metadata_updated",
 *   timestamp: "2025-01-30T12:00:00.000Z",
 *   changes: {
 *     description: {
 *       old_value: "A web application",
 *       new_value: "A comprehensive web application with OAuth and real-time features"
 *     }
 *   }
 * };
 * ```
 */
export const ProjectMetadataUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal("project_metadata_updated"),
  /**
   * Field-level changes that were made.
   */
  changes: ProjectMetadataFieldChangesSchema,
});

/**
 * Discriminated union of all changelog event types.
 * Uses the `type` field as the discriminator for type safety.
 */
export const ChangelogEventSchema = z.discriminatedUnion("type", [
  RequirementCreatedEventSchema,
  RequirementDeletedEventSchema,
  RequirementModifiedEventSchema,
  RequirementRecategorizedEventSchema,
  AcceptanceCriterionAddedEventSchema,
  AcceptanceCriterionModifiedEventSchema,
  AcceptanceCriterionDeletedEventSchema,
  ProjectMetadataUpdatedEventSchema,
]);

/**
 * TypeScript types for all event variants.
 */
export type RequirementCreatedEvent = z.infer<
  typeof RequirementCreatedEventSchema
>;
export type RequirementDeletedEvent = z.infer<
  typeof RequirementDeletedEventSchema
>;
export type RequirementModifiedEvent = z.infer<
  typeof RequirementModifiedEventSchema
>;
export type RequirementRecategorizedEvent = z.infer<
  typeof RequirementRecategorizedEventSchema
>;
export type AcceptanceCriterionAddedEvent = z.infer<
  typeof AcceptanceCriterionAddedEventSchema
>;
export type AcceptanceCriterionModifiedEvent = z.infer<
  typeof AcceptanceCriterionModifiedEventSchema
>;
export type AcceptanceCriterionDeletedEvent = z.infer<
  typeof AcceptanceCriterionDeletedEventSchema
>;
export type ProjectMetadataUpdatedEvent = z.infer<
  typeof ProjectMetadataUpdatedEventSchema
>;
export type ChangelogEvent = z.infer<typeof ChangelogEventSchema>;

/**
 * Event type enumeration for indexing and filtering.
 */
export const EVENT_TYPES = [
  "requirement_created",
  "requirement_deleted",
  "requirement_modified",
  "requirement_recategorized",
  "acceptance_criterion_added",
  "acceptance_criterion_modified",
  "acceptance_criterion_deleted",
  "project_metadata_updated",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Type guard helpers for event types.
 */
export function isRequirementCreatedEvent(
  event: ChangelogEvent,
): event is RequirementCreatedEvent {
  return event.type === "requirement_created";
}

export function isRequirementDeletedEvent(
  event: ChangelogEvent,
): event is RequirementDeletedEvent {
  return event.type === "requirement_deleted";
}

export function isRequirementModifiedEvent(
  event: ChangelogEvent,
): event is RequirementModifiedEvent {
  return event.type === "requirement_modified";
}

export function isRequirementRecategorizedEvent(
  event: ChangelogEvent,
): event is RequirementRecategorizedEvent {
  return event.type === "requirement_recategorized";
}

export function isAcceptanceCriterionAddedEvent(
  event: ChangelogEvent,
): event is AcceptanceCriterionAddedEvent {
  return event.type === "acceptance_criterion_added";
}

export function isAcceptanceCriterionModifiedEvent(
  event: ChangelogEvent,
): event is AcceptanceCriterionModifiedEvent {
  return event.type === "acceptance_criterion_modified";
}

export function isAcceptanceCriterionDeletedEvent(
  event: ChangelogEvent,
): event is AcceptanceCriterionDeletedEvent {
  return event.type === "acceptance_criterion_deleted";
}

export function isProjectMetadataUpdatedEvent(
  event: ChangelogEvent,
): event is ProjectMetadataUpdatedEvent {
  return event.type === "project_metadata_updated";
}

/**
 * Validates a changelog event.
 *
 * @param data - The data to validate
 * @returns Parsed and validated changelog event
 * @throws {z.ZodError} If validation fails
 */
export function validateChangelogEvent(data: unknown): ChangelogEvent {
  return ChangelogEventSchema.parse(data);
}

/**
 * Safely validates a changelog event, returning a result object.
 *
 * @param data - The data to validate
 * @returns Success/failure result with parsed data or error
 */
export function safeValidateChangelogEvent(
  data: unknown,
): z.util.SafeParseResult<ChangelogEvent> {
  return ChangelogEventSchema.safeParse(data);
}
