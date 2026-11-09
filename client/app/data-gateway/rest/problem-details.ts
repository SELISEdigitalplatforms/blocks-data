export type ProblemSummary = {
  code?: string;
  title: string;
  detail?: string;
  errors: { field?: string; message: string; type?: string }[];
};

const PROBLEM_MEDIA_TYPE = "application/problem+json";

/** True when the Content-Type header names `application/problem+json`, whatever its parameters or letter case. */
export function isProblemMediaType(contentType: string): boolean {
  return contentType.split(";")[0].trim().toLowerCase() === PROBLEM_MEDIA_TYPE;
}

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const readErrors = (value: unknown): ProblemSummary["errors"] => {
  if (!Array.isArray(value)) return [];
  const errors: ProblemSummary["errors"] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    const message = asString(entry.message);
    if (message === undefined) continue;
    const field = asString(entry.field);
    const type = asString(entry.validationType);
    errors.push({
      ...(field !== undefined && { field }),
      message,
      ...(type !== undefined && { type }),
    });
  }
  return errors;
};

/** Short summary of a problem+json style error body, or null when the response isn't one. */
export function readProblem(contentType: string, bodyText: string): ProblemSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const body = parsed as Record<string, unknown>;
  const looksLikeProblem = typeof body.status === "number" && typeof body.title === "string";
  if (!isProblemMediaType(contentType) && !looksLikeProblem) return null;

  const code = asString(body.code);
  const detail = asString(body.detail);
  return {
    ...(code !== undefined && { code }),
    title: asString(body.title) ?? "",
    ...(detail !== undefined && { detail }),
    errors: readErrors(body.errors),
  };
}
