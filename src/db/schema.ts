// ERAM Meeting Planner — Phase 1 schema (Drizzle ORM, PostgreSQL)
// Users, roles, branches, business units, groups, client master, auth tokens, audit log.
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// SUPER_ADMIN: the parent company (Eram Holding), sees everything. ADMIN: manages the business units they belong to.
export const roleEnum = pgEnum("role", ["SUPER_ADMIN", "ADMIN", "USER"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "INACTIVE"]);
export const groupTypeEnum = pgEnum("group_type", ["DEPARTMENT", "BRANCH", "PROJECT", "CLIENT_ACCOUNT", "OTHER"]);
export const groupStatusEnum = pgEnum("group_status", ["ACTIVE", "ARCHIVED"]);
export const clientTypeEnum = pgEnum("client_type", ["CLIENT", "PROSPECT", "PARTNER", "VENDOR"]);
export const clientStatusEnum = pgEnum("client_status", ["ACTIVE", "INACTIVE", "PENDING_REVIEW"]);
export const bdStageEnum = pgEnum("bd_stage", ["RESEARCH", "MIR", "APPROACH", "FOLLOW_UP", "ACTIVE_CLIENT"]);
export const tokenTypeEnum = pgEnum("token_type", ["SET_PASSWORD", "RESET_PASSWORD"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  active: boolean("active").default(true).notNull(),
  createdAt: createdAt(),
});

export const businessUnits = pgTable("business_units", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  active: boolean("active").default(true).notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    fullName: varchar("full_name", { length: 100 }).notNull(),
    username: varchar("username", { length: 50 }).notNull().unique(),
    email: varchar("email", { length: 150 }).notNull().unique(),
    employeeId: varchar("employee_id", { length: 20 }).unique(),
    role: roleEnum("role").default("USER").notNull(),
    branchId: integer("branch_id")
      .notNull()
      .references(() => branches.id),
    /** Primary (home) business unit. Access covers every unit in user_business_units, which always includes this one. */
    businessUnitId: integer("business_unit_id")
      .notNull()
      .references(() => businessUnits.id),
    designation: varchar("designation", { length: 100 }),
    mobile: varchar("mobile", { length: 20 }),
    status: userStatusEnum("status").default("ACTIVE").notNull(),
    passwordHash: text("password_hash"),
    failedLogins: integer("failed_logins").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdById: integer("created_by_id"),
    updatedById: integer("updated_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("users_branch_idx").on(t.branchId), index("users_status_idx").on(t.status)],
);

/** Business units a user (or admin) has access to. Users see clients and meetings of these units. */
export const userBusinessUnits = pgTable(
  "user_business_units",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessUnitId: integer("business_unit_id")
      .notNull()
      .references(() => businessUnits.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.businessUnitId] }), index("user_business_units_bu_idx").on(t.businessUnitId)],
);

/**
 * Reporting lines: a user can have several managers. Managers see the tasks and meetings of everyone under
 * them (reportees' reportees too). No separate role: anyone with reportees is a manager.
 */
export const userManagers = pgTable(
  "user_managers",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    managerId: integer("manager_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.managerId] }), index("user_managers_manager_idx").on(t.managerId)],
);

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 500 }),
  type: groupTypeEnum("type").notNull(),
  leadUserId: integer("lead_user_id").references(() => users.id),
  status: groupStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("group_members_user_idx").on(t.userId)],
);

export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 150 }).notNull().unique(),
    shortCode: varchar("short_code", { length: 10 }),
    type: clientTypeEnum("type").default("PROSPECT").notNull(),
    industry: varchar("industry", { length: 100 }),
    country: varchar("country", { length: 100 }).notNull(),
    city: varchar("city", { length: 100 }),
    website: varchar("website", { length: 200 }),
    accountOwnerId: integer("account_owner_id").references(() => users.id),
    accountGroupId: integer("account_group_id").references(() => groups.id),
    bdStage: bdStageEnum("bd_stage"),
    targetBatch: varchar("target_batch", { length: 50 }), // e.g. "Batch 1" on the BD Target Schedule
    status: clientStatusEnum("status").default("ACTIVE").notNull(),
    notes: text("notes"),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // One client per name, ignoring case: "SABIC" and "sabic" can't both exist.
  (t) => [index("clients_status_idx").on(t.status), uniqueIndex("clients_name_lower_idx").on(sql`lower(${t.name})`)],
);

export const clientBusinessUnits = pgTable(
  "client_business_units",
  {
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    businessUnitId: integer("business_unit_id")
      .notNull()
      .references(() => businessUnits.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.clientId, t.businessUnitId] })],
);

export const clientContacts = pgTable(
  "client_contacts",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    designation: varchar("designation", { length: 100 }),
    email: varchar("email", { length: 150 }),
    phone: varchar("phone", { length: 30 }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    /** Who added the contact. Private contacts are seen only by the owner, the client's account owner and Admins. */
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Shared: everyone who can see the client sees the contact. */
    shared: boolean("shared").default(false).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("client_contacts_client_idx").on(t.clientId)],
);

export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: tokenTypeEnum("type").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    action: varchar("action", { length: 50 }).notNull(),
    entity: varchar("entity", { length: 50 }).notNull(),
    entityId: integer("entity_id"),
    details: jsonb("details"),
    ip: varchar("ip", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

// ---------- relations (for db.query.* with nested reads) ----------
export const branchesRelations = relations(branches, ({ many }) => ({ users: many(users) }));
export const businessUnitsRelations = relations(businessUnits, ({ many }) => ({
  users: many(users),
  members: many(userBusinessUnits),
  clients: many(clientBusinessUnits),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  branch: one(branches, { fields: [users.branchId], references: [branches.id] }),
  businessUnit: one(businessUnits, { fields: [users.businessUnitId], references: [businessUnits.id] }),
  memberships: many(groupMembers),
  businessUnits: many(userBusinessUnits),
}));

export const userBusinessUnitsRelations = relations(userBusinessUnits, ({ one }) => ({
  user: one(users, { fields: [userBusinessUnits.userId], references: [users.id] }),
  businessUnit: one(businessUnits, { fields: [userBusinessUnits.businessUnitId], references: [businessUnits.id] }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  lead: one(users, { fields: [groups.leadUserId], references: [users.id] }),
  members: many(groupMembers),
  clients: many(clients),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  user: one(users, { fields: [groupMembers.userId], references: [users.id] }),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  accountOwner: one(users, { fields: [clients.accountOwnerId], references: [users.id] }),
  accountGroup: one(groups, { fields: [clients.accountGroupId], references: [groups.id] }),
  createdBy: one(users, { fields: [clients.createdById], references: [users.id] }),
  contacts: many(clientContacts),
  businessUnits: many(clientBusinessUnits),
  meetings: many(meetings),
  tasks: many(tasks),
}));

export const clientBusinessUnitsRelations = relations(clientBusinessUnits, ({ one }) => ({
  client: one(clients, { fields: [clientBusinessUnits.clientId], references: [clients.id] }),
  businessUnit: one(businessUnits, { fields: [clientBusinessUnits.businessUnitId], references: [businessUnits.id] }),
}));

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, { fields: [clientContacts.clientId], references: [clients.id] }),
  owner: one(users, { fields: [clientContacts.ownerId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

// =====================================================================
// Phase 2 — Meetings (fields follow the ERAM Holdings Client Meeting Planner sheet)
// =====================================================================
export const priorityEnum = pgEnum("priority", ["HIGH", "MEDIUM", "LOW"]);
export const meetingStatusEnum = pgEnum("meeting_status", [
  "TO_BE_SCHEDULED",
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "POSTPONED",
  "CANCELLED",
]);
export const meetingTypeEnum = pgEnum("meeting_type", ["CLIENT_MEETING", "INTERNAL", "FOLLOW_UP", "PRESENTATION", "SITE_VISIT"]);
export const meetingModeEnum = pgEnum("meeting_mode", ["IN_PERSON", "TEAMS", "ZOOM", "PHONE"]);
export const briefStatusEnum = pgEnum("brief_status", ["DRAFT", "SUBMITTED"]);

export const meetings = pgTable(
  "meetings",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    priority: priorityEnum("priority").default("MEDIUM").notNull(),
    clientId: integer("client_id").references(() => clients.id),
    location: varchar("location", { length: 150 }), // Country / Location
    mode: meetingModeEnum("mode").default("IN_PERSON").notNull(), // Location / Platform
    venue: varchar("venue", { length: 300 }), // address or meeting link
    clientContactsText: varchar("client_contacts_text", { length: 500 }), // contacts not in the client master
    type: meetingTypeEnum("type").default("CLIENT_MEETING").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }), // blank while To Be Scheduled
    endAt: timestamp("end_at", { withTimezone: true }),
    status: meetingStatusEnum("status").default("TO_BE_SCHEDULED").notNull(),
    objective: text("objective").notNull(), // Meeting Objective / Agenda
    documents: text("documents"), // Presentation / Documents
    nextAction: text("next_action"),
    followUpDate: timestamp("follow_up_date", { mode: "string", withTimezone: false }),
    notes: text("notes"),
    organiserId: integer("organiser_id")
      .notNull()
      .references(() => users.id),
    parentMeetingId: integer("parent_meeting_id").references((): AnyPgColumn => meetings.id), // follow-up of
    icsSequence: integer("ics_sequence").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("meetings_start_idx").on(t.startAt), index("meetings_client_idx").on(t.clientId), index("meetings_status_idx").on(t.status)],
);

/** ERAM attendees. Group members are copied in at save time (viaGroupId set); past meetings keep their list. */
export const meetingAttendees = pgTable(
  "meeting_attendees",
  {
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    viaGroupId: integer("via_group_id").references(() => groups.id, { onDelete: "set null" }),
    attended: boolean("attended"),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.userId] }), index("meeting_attendees_user_idx").on(t.userId)],
);

export const meetingGroups = pgTable(
  "meeting_groups",
  {
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.groupId] })],
);

export const meetingContacts = pgTable(
  "meeting_contacts",
  {
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => clientContacts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.contactId] })],
);

export const meetingBusinessUnits = pgTable(
  "meeting_business_units",
  {
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    businessUnitId: integer("business_unit_id")
      .notNull()
      .references(() => businessUnits.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.businessUnitId] })],
);

/** Action owner(s) for the meeting's Next Action. */
export const meetingActionOwners = pgTable(
  "meeting_action_owners",
  {
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.userId] }), index("meeting_action_owners_user_idx").on(t.userId)],
);

/** Meeting Brief — one per meeting, fields from the ERAM Holdings Meeting Brief sheet. */
export const meetingBriefs = pgTable("meeting_briefs", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id")
    .notNull()
    .unique()
    .references(() => meetings.id, { onDelete: "cascade" }),
  clientAttendees: text("client_attendees"),
  discussionPoints: text("discussion_points"),
  outcomes: text("outcomes"), // Key Outcomes / Opportunities
  documentsUsed: text("documents_used"),
  nextFollowUpDate: timestamp("next_follow_up_date", { mode: "string", withTimezone: false }),
  status: briefStatusEnum("status").default("DRAFT").notNull(),
  version: integer("version").default(1).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedById: integer("submitted_by_id").references(() => users.id),
  followUpMeetingId: integer("follow_up_meeting_id").references(() => meetings.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Agreed Actions rows on the brief (action, owner, deadline). Become tasks in Phase 3. */
export const briefActions = pgTable("brief_actions", {
  id: serial("id").primaryKey(),
  briefId: integer("brief_id")
    .notNull()
    .references(() => meetingBriefs.id, { onDelete: "cascade" }),
  position: integer("position").default(0).notNull(),
  action: text("action").notNull(),
  ownerUserId: integer("owner_user_id").references(() => users.id),
  ownerGroupId: integer("owner_group_id").references(() => groups.id),
  deadline: timestamp("deadline", { mode: "string", withTimezone: false }),
});

/** Everything that happens to a meeting: created, rescheduled, attendees changed, status, brief… */
export const meetingActivity = pgTable(
  "meeting_activity",
  {
    id: serial("id").primaryKey(),
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id),
    action: varchar("action", { length: 50 }).notNull(),
    details: jsonb("details"),
    createdAt: createdAt(),
  },
  (t) => [index("meeting_activity_idx").on(t.meetingId, t.createdAt)],
);

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  client: one(clients, { fields: [meetings.clientId], references: [clients.id] }),
  organiser: one(users, { fields: [meetings.organiserId], references: [users.id] }),
  attendees: many(meetingAttendees),
  groups: many(meetingGroups),
  contacts: many(meetingContacts),
  businessUnits: many(meetingBusinessUnits),
  actionOwners: many(meetingActionOwners),
  brief: one(meetingBriefs, { fields: [meetings.id], references: [meetingBriefs.meetingId] }),
}));
export const meetingAttendeesRelations = relations(meetingAttendees, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingAttendees.meetingId], references: [meetings.id] }),
  user: one(users, { fields: [meetingAttendees.userId], references: [users.id] }),
  viaGroup: one(groups, { fields: [meetingAttendees.viaGroupId], references: [groups.id] }),
}));
export const meetingGroupsRelations = relations(meetingGroups, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingGroups.meetingId], references: [meetings.id] }),
  group: one(groups, { fields: [meetingGroups.groupId], references: [groups.id] }),
}));
export const meetingContactsRelations = relations(meetingContacts, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingContacts.meetingId], references: [meetings.id] }),
  contact: one(clientContacts, { fields: [meetingContacts.contactId], references: [clientContacts.id] }),
}));
export const meetingBusinessUnitsRelations = relations(meetingBusinessUnits, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingBusinessUnits.meetingId], references: [meetings.id] }),
  businessUnit: one(businessUnits, { fields: [meetingBusinessUnits.businessUnitId], references: [businessUnits.id] }),
}));
export const meetingActionOwnersRelations = relations(meetingActionOwners, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingActionOwners.meetingId], references: [meetings.id] }),
  user: one(users, { fields: [meetingActionOwners.userId], references: [users.id] }),
}));
export const meetingBriefsRelations = relations(meetingBriefs, ({ one, many }) => ({
  meeting: one(meetings, { fields: [meetingBriefs.meetingId], references: [meetings.id] }),
  actions: many(briefActions),
  submittedBy: one(users, { fields: [meetingBriefs.submittedById], references: [users.id] }),
}));
export const briefActionsRelations = relations(briefActions, ({ one }) => ({
  brief: one(meetingBriefs, { fields: [briefActions.briefId], references: [meetingBriefs.id] }),
  owner: one(users, { fields: [briefActions.ownerUserId], references: [users.id] }),
  ownerGroup: one(groups, { fields: [briefActions.ownerGroupId], references: [groups.id] }),
}));
export const meetingActivityRelations = relations(meetingActivity, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingActivity.meetingId], references: [meetings.id] }),
  user: one(users, { fields: [meetingActivity.userId], references: [users.id] }),
}));

// =====================================================================
// Phase 3 — Task planner
// =====================================================================
export const taskStatusEnum = pgEnum("task_status", ["NOT_STARTED", "STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]);
export const taskCategoryEnum = pgEnum("task_category", ["MARKET_RESEARCH", "MIR_REPORT", "APPROACH", "FOLLOW_UP", "PRESENTATION", "GENERAL"]);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    category: taskCategoryEnum("category").default("GENERAL").notNull(),
    meetingId: integer("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** Set on a subtask: the task it belongs to (one level only). Deleting the task deletes its subtasks. */
    parentTaskId: integer("parent_task_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    /** The one business unit the task belongs to: drives BU filters, dashboards and BU Admin visibility. */
    businessUnitId: integer("business_unit_id")
      .notNull()
      .references(() => businessUnits.id),
    priority: priorityEnum("priority").default("MEDIUM").notNull(),
    startDate: timestamp("start_date", { mode: "string", withTimezone: false }),
    dueDate: timestamp("due_date", { mode: "string", withTimezone: false }),
    status: taskStatusEnum("status").default("NOT_STARTED").notNull(),
    percent: integer("percent").default(0).notNull(),
    /** Set when the task came from an agreed action on a Meeting Brief (brief + row position). */
    sourceBriefId: integer("source_brief_id").references(() => meetingBriefs.id, { onDelete: "set null" }),
    sourcePosition: integer("source_position"),
    /** The brief_actions row this task came from — stays the same when the brief is edited. */
    sourceActionId: integer("source_action_id").references(() => briefActions.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_due_idx").on(t.dueDate),
    index("tasks_status_idx").on(t.status),
    index("tasks_client_idx").on(t.clientId),
    index("tasks_source_idx").on(t.sourceBriefId, t.sourcePosition),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_bu_idx").on(t.businessUnitId),
  ],
);

/** People on a task. Group members are copied in when the task is saved (viaGroupId set). */
export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    viaGroupId: integer("via_group_id").references(() => groups.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("task_assignees_user_idx").on(t.userId)],
);

export const taskGroups = pgTable(
  "task_groups",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.groupId] })],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId)],
);

export const taskActivity = pgTable(
  "task_activity",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id),
    action: varchar("action", { length: 50 }).notNull(),
    details: jsonb("details"),
    createdAt: createdAt(),
  },
  (t) => [index("task_activity_idx").on(t.taskId, t.createdAt)],
);

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  meeting: one(meetings, { fields: [tasks.meetingId], references: [meetings.id] }),
  client: one(clients, { fields: [tasks.clientId], references: [clients.id] }),
  createdBy: one(users, { fields: [tasks.createdById], references: [users.id] }),
  assignees: many(taskAssignees),
  groups: many(taskGroups),
  parent: one(tasks, { fields: [tasks.parentTaskId], references: [tasks.id], relationName: "subtasks" }),
  businessUnit: one(businessUnits, { fields: [tasks.businessUnitId], references: [businessUnits.id] }),
  subtasks: many(tasks, { relationName: "subtasks" }),
  comments: many(taskComments),
}));
export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAssignees.userId], references: [users.id] }),
  viaGroup: one(groups, { fields: [taskAssignees.viaGroupId], references: [groups.id] }),
}));
export const taskGroupsRelations = relations(taskGroups, ({ one }) => ({
  task: one(tasks, { fields: [taskGroups.taskId], references: [tasks.id] }),
  group: one(groups, { fields: [taskGroups.groupId], references: [groups.id] }),
}));
export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskComments.userId], references: [users.id] }),
}));
export const taskActivityRelations = relations(taskActivity, ({ one }) => ({
  task: one(tasks, { fields: [taskActivity.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskActivity.userId], references: [users.id] }),
}));

export type Task = typeof tasks.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Client = typeof clients.$inferSelect;

/** In-app notifications: saved for every event that also emails a user, so nothing depends on SMTP. */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 40 }).notNull(), // e.g. MEETING_INVITE, TASK_ASSIGNED, MENTION
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    href: varchar("href", { length: 300 }), // where clicking it goes
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }), // who caused it
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), index("notifications_unread_idx").on(t.userId, t.readAt)],
);
