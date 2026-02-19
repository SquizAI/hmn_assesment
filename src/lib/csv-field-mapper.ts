// ============================================================
// HMN CASCADE - Smart CSV Field Mapper
// ============================================================

export type SystemField = "name" | "email" | "company" | "role" | "industry" | "teamSize" | "note";

export interface FieldMapping {
  systemField: SystemField;
  csvColumn: string | null;
  required: boolean;
  confidence: number; // 0-1
}

export interface NameDetection {
  type: "single" | "composite" | "none";
  columns: string[]; // e.g. ["Full Name"] or ["First Name", "Last Name"]
}

// ---- Alias Dictionaries ----

const FIELD_ALIASES: Record<SystemField, string[]> = {
  name: [
    "name", "full name", "fullname", "participant", "person",
    "contact name", "contact", "employee", "member", "attendee",
    "participant name", "employee name", "member name",
  ],
  email: [
    "email", "e-mail", "email address", "e-mail address",
    "mail", "contact email", "work email", "business email",
    "email id", "emailaddress", "participant email",
  ],
  company: [
    "company", "organization", "organisation", "org",
    "company name", "employer", "business", "firm",
    "workplace", "affiliation", "agency", "client",
    "organization name", "organisation name",
  ],
  role: [
    "role", "title", "job title", "position", "job",
    "job role", "designation", "function", "job position",
    "job function", "occupation",
  ],
  industry: [
    "industry", "sector", "vertical", "field",
    "business type", "industry type", "market",
  ],
  teamSize: [
    "team size", "teamsize", "team_size", "headcount",
    "employees", "employee count", "company size",
    "org size", "number of employees", "num employees",
    "staff count", "size", "team",
  ],
  note: [
    "note", "notes", "comment", "comments", "memo",
    "description", "additional info", "remarks", "message",
  ],
};

const FIRST_NAME_ALIASES = [
  "first name", "firstname", "first", "given name", "forename", "fname",
];

const LAST_NAME_ALIASES = [
  "last name", "lastname", "last", "surname", "family name", "lname",
];

// ---- Normalization ----

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

// ---- Scoring ----

function scoreMatch(csvHeader: string, aliases: string[]): number {
  const normalized = normalize(csvHeader);
  // Exact match
  if (aliases.includes(normalized)) return 1.0;
  // Exact match after removing extra spaces
  const compact = normalized.replace(/\s+/g, " ");
  if (aliases.includes(compact)) return 1.0;
  // Contains match
  for (const alias of aliases) {
    if (normalized.includes(alias) || alias.includes(normalized)) return 0.7;
  }
  // Starts-with match
  for (const alias of aliases) {
    if (normalized.startsWith(alias) || alias.startsWith(normalized)) return 0.5;
  }
  return 0;
}

// ---- Composite Name Detection ----

export function detectNameColumns(csvHeaders: string[]): NameDetection {
  // Check for first + last name columns
  let firstNameCol: string | null = null;
  let lastNameCol: string | null = null;

  for (const header of csvHeaders) {
    const norm = normalize(header);
    if (!firstNameCol && FIRST_NAME_ALIASES.some((a) => norm === a || norm.includes(a))) {
      firstNameCol = header;
    }
    if (!lastNameCol && LAST_NAME_ALIASES.some((a) => norm === a || norm.includes(a))) {
      lastNameCol = header;
    }
  }

  if (firstNameCol && lastNameCol) {
    return { type: "composite", columns: [firstNameCol, lastNameCol] };
  }

  // Check for single name column
  for (const header of csvHeaders) {
    if (scoreMatch(header, FIELD_ALIASES.name) >= 0.7) {
      return { type: "single", columns: [header] };
    }
  }

  return { type: "none", columns: [] };
}

// ---- Auto-Mapping ----

export function autoMapFields(csvHeaders: string[]): FieldMapping[] {
  const usedColumns = new Set<string>();
  const nameDetection = detectNameColumns(csvHeaders);

  const systemFields: Array<{ field: SystemField; required: boolean }> = [
    { field: "name", required: true },
    { field: "email", required: true },
    { field: "company", required: false },
    { field: "role", required: false },
    { field: "industry", required: false },
    { field: "teamSize", required: false },
    { field: "note", required: false },
  ];

  const mappings: FieldMapping[] = [];

  for (const { field, required } of systemFields) {
    // Special handling for name with composite detection
    if (field === "name") {
      if (nameDetection.type === "composite") {
        // Mark both columns as used
        nameDetection.columns.forEach((c) => usedColumns.add(c));
        mappings.push({
          systemField: "name",
          csvColumn: `${nameDetection.columns[0]} + ${nameDetection.columns[1]}`,
          required: true,
          confidence: 0.9,
        });
        continue;
      }
      if (nameDetection.type === "single") {
        usedColumns.add(nameDetection.columns[0]);
        mappings.push({
          systemField: "name",
          csvColumn: nameDetection.columns[0],
          required: true,
          confidence: 1.0,
        });
        continue;
      }
    }

    // Standard matching
    let bestColumn: string | null = null;
    let bestScore = 0;

    for (const header of csvHeaders) {
      if (usedColumns.has(header)) continue;
      const score = scoreMatch(header, FIELD_ALIASES[field]);
      if (score > bestScore) {
        bestScore = score;
        bestColumn = header;
      }
    }

    if (bestColumn && bestScore >= 0.5) {
      usedColumns.add(bestColumn);
      mappings.push({
        systemField: field,
        csvColumn: bestColumn,
        required,
        confidence: bestScore,
      });
    } else {
      mappings.push({
        systemField: field,
        csvColumn: null,
        required,
        confidence: 0,
      });
    }
  }

  return mappings;
}

// ---- Row Extraction ----

export function extractRowValue(
  row: Record<string, string>,
  mapping: FieldMapping,
  nameDetection: NameDetection,
): string {
  if (!mapping.csvColumn) return "";

  // Handle composite name
  if (mapping.systemField === "name" && nameDetection.type === "composite") {
    const first = (row[nameDetection.columns[0]] || "").trim();
    const last = (row[nameDetection.columns[1]] || "").trim();
    return [first, last].filter(Boolean).join(" ");
  }

  return (row[mapping.csvColumn] || "").trim();
}

// ---- Validation ----

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function getUnmappedColumns(csvHeaders: string[], mappings: FieldMapping[]): string[] {
  const mappedColumns = new Set(
    mappings
      .filter((m) => m.csvColumn)
      .flatMap((m) => {
        if (m.csvColumn?.includes(" + ")) {
          return m.csvColumn.split(" + ");
        }
        return [m.csvColumn!];
      })
  );
  return csvHeaders.filter((h) => !mappedColumns.has(h));
}
