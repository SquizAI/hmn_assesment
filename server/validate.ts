// ============================================================
// Lightweight Input Validation — No dependencies
// ============================================================

export function validateString(value: unknown, minLen = 1, maxLen = 500): string | null {
  if (typeof value !== "string") return "must be a string";
  if (value.trim().length < minLen) return `must be at least ${minLen} character(s)`;
  if (value.length > maxLen) return `must be at most ${maxLen} characters`;
  return null;
}

export function validateEmail(value: unknown): string | null {
  if (typeof value !== "string") return "must be a string";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "must be a valid email address";
  if (value.length > 254) return "email is too long";
  return null;
}

export function validateUrl(value: unknown): string | null {
  if (typeof value !== "string") return "must be a string";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "must use http or https";
  } catch {
    return "must be a valid URL";
  }
  return null;
}

export function validateEnum(value: unknown, allowed: string[]): string | null {
  if (typeof value !== "string") return "must be a string";
  if (!allowed.includes(value)) return `must be one of: ${allowed.join(", ")}`;
  return null;
}

export function validatePhone(value: unknown): string | null {
  if (typeof value !== "string") return "must be a string";
  const digits = value.replace(/[\s\-\(\)\.\+]/g, "");
  if (digits.length < 7 || digits.length > 15) return "must be a valid phone number";
  return null;
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validateBody(
  body: Record<string, unknown>,
  rules: Record<string, (value: unknown) => string | null>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const [field, check] of Object.entries(rules)) {
    const error = check(body[field]);
    if (error) errors.push({ field, message: error });
  }
  return errors;
}
