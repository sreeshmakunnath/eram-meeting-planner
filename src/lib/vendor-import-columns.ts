// Columns of the vendor registration import sheet, shared by the template and the importer. Headers are matched
// loosely (case, spaces and punctuation ignored). Portal passwords are left out on purpose: they are typed on the
// registration itself, where they are stored encrypted, not passed around in spreadsheets.

export type VendorField = "client" | "title" | "status" | "assignee" | "dueDate" | "portalUrl" | "portalUsername" | "vendorCode" | "notes";

export const VENDOR_IMPORT_COLUMNS: { key: VendorField; header: string; aliases: string[]; width: number; max?: number; help: string }[] = [
  { key: "client", header: "Client *", aliases: ["client", "clientname", "clientcode", "company", "name"], width: 30, help: "Client code (e.g. ENG-0012) or exact client name. Required." },
  { key: "title", header: "Registration", aliases: ["registration", "title", "registrationname"], width: 26, max: 150, help: 'Empty = "Vendor registration". The same client and registration updates the existing one.' },
  { key: "status", header: "Status", aliases: ["status"], width: 16, help: "Not started, In progress, Mailed, Hold, Submitted, Portal created or Completed. Empty = Not started (new)." },
  { key: "assignee", header: "Assigned to", aliases: ["assignedto", "assignee", "owner", "responsible"], width: 24, help: "A user's email, username or full name. Must be a member of the client's business unit." },
  { key: "dueDate", header: "Due date", aliases: ["duedate", "due", "deadline"], width: 14, help: "A date, or text as YYYY-MM-DD or DD/MM/YYYY." },
  { key: "portalUrl", header: "Portal URL", aliases: ["portalurl", "portal", "url", "link"], width: 30, max: 500, help: "https:// is added if missing." },
  { key: "portalUsername", header: "Portal username", aliases: ["portalusername", "username", "login", "userid"], width: 20, max: 200, help: "No passwords here: add them on the registration in the planner." },
  { key: "vendorCode", header: "Vendor code", aliases: ["vendorcode", "vendornumber", "suppliercode", "suppliernumber", "vendorno"], width: 16, max: 100, help: "The vendor / supplier number the client gave." },
  { key: "notes", header: "Notes", aliases: ["notes", "remarks", "comments"], width: 30, help: "" },
];
