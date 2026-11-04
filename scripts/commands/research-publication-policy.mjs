const FLAGS = ["syntaxVerified", "examplesVerified", "busyboxTested", "humanReviewed", "provenanceVerified"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function researchPublicationErrors(record) {
  const errors = [];
  if (!record || record.status !== "complete") errors.push("status must be complete");
  for (const key of ["definition", "explanation", "syntax"]) {
    if (typeof record?.[key] !== "string" || !record[key].trim()) errors.push(key);
  }
  if (!Array.isArray(record?.safetyNotes) || !record.safetyNotes.some((x) => typeof x === "string" && x.trim())) errors.push("safetyNotes");
  if (!Array.isArray(record?.implementationDifferences) || !record.implementationDifferences.some((x) => x && typeof x.implementation === "string" && x.implementation.trim() && typeof x.notes === "string" && x.notes.trim())) errors.push("implementationDifferences");
  if (!Array.isArray(record?.sources) || !record.sources.length || !record.sources.every((x) => x && typeof x.title === "string" && x.title.trim() && typeof x.url === "string" && /^https:\/\//.test(x.url) && x.verified === true && typeof x.accessedAt === "string" && DATE.test(x.accessedAt))) errors.push("verified sources with title, HTTPS URL and access date");
  if (!Array.isArray(record?.examples) || !record.examples.length || !record.examples.every((x) => x && typeof x.command === "string" && x.command.trim() && typeof x.expectedBehavior === "string" && x.expectedBehavior.trim() && Array.isArray(x.testEvidence) && x.testEvidence.length && x.testEvidence.every((e) => e && typeof e.environment === "string" && e.environment.trim() && e.result === "passed" && typeof e.executedAt === "string" && Number.isFinite(Date.parse(e.executedAt))))) errors.push("examples with timestamped passing execution evidence");
  if (!record?.verification || FLAGS.some((key) => record.verification[key] !== true)) errors.push("all verification flags");
  const score = Number(record?.qualityScore ?? record?.verification?.qualityScore);
  if (!Number.isFinite(score) || score < 90 || score > 100) errors.push("qualityScore >= 90");
  if (!record?.review || typeof record.review.reviewer !== "string" || !record.review.reviewer.trim() || typeof record.review.reviewedAt !== "string" || !Number.isFinite(Date.parse(record.review.reviewedAt)) || typeof record.review.notes !== "string" || !record.review.notes.trim()) errors.push("named human review with timestamp and notes");
  return errors;
}
export function isPublishableResearch(record) {
  return researchPublicationErrors(record).length === 0;
}
