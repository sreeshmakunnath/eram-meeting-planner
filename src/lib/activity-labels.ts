/** Readable names for the form fields listed in "changed …" activity entries (tasks, meetings). */
const FIELD_LABEL: Record<string, string> = {
  clientId: "client",
  meetingId: "meeting",
  businessUnitId: "business unit",
  organiserId: "organiser",
  accountOwnerId: "account owner",
  accountGroupId: "account group",
  parentTaskId: "main task",
  dueDate: "due date",
  startDate: "start date",
  startAt: "start time",
  endAt: "end time",
  followUpDate: "follow-up date",
  nextActionOwnerId: "next action owner",
  clientContactsText: "client contacts",
  bdStage: "BD stage",
};

export const fieldLabel = (key: string) =>
  FIELD_LABEL[key] ??
  key
    .replace(/Id$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();

/** "changed due date, client" */
export const changedText = (d: Record<string, unknown>) => `changed ${((d.changed as string[]) ?? []).map(fieldLabel).join(", ")}`;

/**
 * People in an activity entry: names as saved, or (older task entries) user ids looked up in `names`. Unknown ids
 * (deleted users) show as "a removed user".
 */
export const people = (v: unknown, names: Map<number, string>) =>
  ((v as (string | number)[] | undefined) ?? []).map((x) => (typeof x === "number" ? (names.get(x) ?? "a removed user") : x));

/** All user ids saved in task "assignees changed" entries, to look their names up in one query. */
export const assigneeIdsIn = (entries: { action: string; details: unknown }[]) =>
  [
    ...new Set(
      entries
        .filter((e) => e.action === "ASSIGNEES_CHANGED")
        .flatMap((e) => {
          const d = (e.details ?? {}) as { added?: unknown[]; removed?: unknown[] };
          return [...(d.added ?? []), ...(d.removed ?? [])];
        })
        .filter((x): x is number => typeof x === "number"),
    ),
  ];
