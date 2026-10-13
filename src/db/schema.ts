// ERAM Meeting Planner — Phase 1 schema (Drizzle ORM, PostgreSQL)
// Users, roles, branches, business units, groups, client master, auth tokens, audit log.
import { relations } from "drizzle-orm";
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
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["ADMIN", "USER"]);
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
    businessUnitId: integer("business_unit_id").references(() => businessUnits.id),
    designation: varchar("designation", { length: 100 }),
    mobile: varchar("mobile", { length: 20 }),
    managerId: integer("manager_id").references((): AnyPgColumn => users.id),
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
    status: clientStatusEnum("status").default("ACTIVE").notNull(),
    notes: text("notes"),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clients_status_idx").on(t.status)],
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
  clients: many(clientBusinessUnits),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  branch: one(branches, { fields: [users.branchId], references: [branches.id] }),
  businessUnit: one(businessUnits, { fields: [users.businessUnitId], references: [businessUnits.id] }),
  manager: one(users, { fields: [users.managerId], references: [users.id], relationName: "manager" }),
  memberships: many(groupMembers),
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
}));

export const clientBusinessUnitsRelations = relations(clientBusinessUnits, ({ one }) => ({
  client: one(clients, { fields: [clientBusinessUnits.clientId], references: [clients.id] }),
  businessUnit: one(businessUnits, { fields: [clientBusinessUnits.businessUnitId], references: [businessUnits.id] }),
}));

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, { fields: [clientContacts.clientId], references: [clients.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Client = typeof clients.$inferSelect;
