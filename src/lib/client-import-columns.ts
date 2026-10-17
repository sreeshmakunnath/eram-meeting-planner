// Columns of the client import sheet. Shared by the downloadable template and the importer, so
// the two can't drift apart. Headers are matched loosely (case, spaces and punctuation ignored),
// and the aliases also accept the columns of the client CSV export.

export type ClientField =
  | "client"
  | "shortCode"
  | "type"
  | "industry"
  | "country"
  | "city"
  | "website"
  | "businessUnits"
  | "bdStage"
  | "targetBatch"
  | "owner"
  | "status"
  | "notes"
  | "contactName"
  | "designation"
  | "email"
  | "phone";

export const CLIENT_IMPORT_COLUMNS: { key: ClientField; header: string; aliases: string[]; width: number; max?: number; help: string }[] = [
  { key: "client", header: "Client *", aliases: ["client", "clientname", "company", "companyname", "name"], width: 30, max: 150, help: "Company name. Required. Repeat it on extra rows to add more contacts." },
  { key: "shortCode", header: "Short code", aliases: ["shortcode", "code"], width: 12, max: 10, help: "Optional abbreviation, e.g. L&T. Up to 10 characters." },
  { key: "type", header: "Type", aliases: ["type", "clienttype"], width: 12, help: "Client, Prospect, Partner or Vendor. Empty = Prospect." },
  { key: "industry", header: "Industry", aliases: ["industry", "sector"], width: 18, max: 100, help: "Free text, e.g. Oil & gas, EPC." },
  { key: "country", header: "Country *", aliases: ["country"], width: 16, max: 100, help: "Required for new clients." },
  { key: "city", header: "City", aliases: ["city", "location"], width: 16, max: 100, help: "" },
  { key: "website", header: "Website", aliases: ["website", "web", "url"], width: 26, max: 200, help: "https:// is added if missing." },
  { key: "businessUnits", header: "Business units", aliases: ["businessunits", "businessunit", "bu", "bus"], width: 26, help: "One or more, separated by ; e.g. Eram Engineering; Eram Trading." },
  { key: "bdStage", header: "BD stage", aliases: ["bdstage", "stage"], width: 14, help: "Research, MIR, Approach, Follow-up or Active client." },
  { key: "targetBatch", header: "Target batch", aliases: ["targetbatch", "batch"], width: 14, max: 50, help: "e.g. Batch 1, for the BD Target Schedule." },
  { key: "owner", header: "Account owner", aliases: ["accountowner", "owner"], width: 24, help: "A user's email, username or full name." },
  { key: "status", header: "Status", aliases: ["status"], width: 14, help: "Active, Inactive or Pending review. Empty = Active." },
  { key: "notes", header: "Notes", aliases: ["notes", "remarks", "comments"], width: 30, help: "" },
  { key: "contactName", header: "Contact name", aliases: ["contactname", "contact", "contactperson"], width: 22, max: 100, help: "One contact per row." },
  { key: "designation", header: "Designation", aliases: ["designation", "jobtitle", "position"], width: 20, max: 100, help: "" },
  { key: "email", header: "Email", aliases: ["email", "emailid", "contactemail"], width: 26, max: 150, help: "Used for meeting invites." },
  { key: "phone", header: "Phone", aliases: ["phone", "mobile", "phonenumber", "mobilenumber", "contactphone"], width: 18, max: 30, help: "" },
];
