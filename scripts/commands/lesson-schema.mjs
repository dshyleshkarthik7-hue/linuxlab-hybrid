const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const requireArray = (value, name) => {
  if (!Array.isArray(value)) throw new TypeError(name + " must be an array.");
};
const requireString = (value, name) => {
  if (typeof value !== "string") throw new TypeError(name + " must be a string.");
};

export function validateCommandLessonDraft(command, draft) {
  if (!object(command) || !object(draft)) throw new TypeError("Command and lesson draft must be objects.");
  if (draft.name !== command.name) throw new TypeError("Model command identity mismatch: expected " + command.name);
  for (const key of ["definition", "explanation", "syntax"]) requireString(draft[key], command.name + ": " + key);
  for (const key of ["examples", "implementationDifferences", "safetyNotes", "sources"]) requireArray(draft[key], command.name + ": " + key);
  if (draft.examples.some((x) => !object(x) || typeof x.command !== "string" || typeof x.expectedBehavior !== "string" || typeof x.testPlan !== "string")) throw new TypeError(command.name + ": malformed example.");
  if (draft.implementationDifferences.some((x) => !object(x) || typeof x.implementation !== "string" || typeof x.notes !== "string")) throw new TypeError(command.name + ": malformed implementation difference.");
  if (draft.safetyNotes.some((x) => typeof x !== "string")) throw new TypeError(command.name + ": safety notes must be strings.");
  if (draft.sources.some((x) => !object(x) || typeof x.title !== "string" || typeof x.url !== "string")) throw new TypeError(command.name + ": malformed source candidate.");
  return true;
}

export function validateCommandResearchRecord(record) {
  if (!object(record)) throw new TypeError("Research record must be an object.");
  for (const key of ["name", "status", "definition", "explanation", "syntax"]) requireString(record[key], key);
  if (!["draft", "complete"].includes(record.status)) throw new TypeError("Research status must be draft or complete.");
  for (const key of ["examples", "implementationDifferences", "safetyNotes", "sources"]) requireArray(record[key], key);
  if (!object(record.verification)) throw new TypeError("verification must be an object.");
  for (const key of ["syntaxVerified", "examplesVerified", "busyboxTested", "humanReviewed", "provenanceVerified"]) {
    if (typeof record.verification[key] !== "boolean") throw new TypeError("verification." + key + " must be boolean.");
  }
  if (record.examples.some((x) => !object(x) || typeof x.command !== "string" || typeof x.expectedBehavior !== "string" || !Array.isArray(x.testEvidence))) throw new TypeError("Research examples must retain command, expectedBehavior and testEvidence.");
  if (record.sources.some((x) => !object(x) || typeof x.title !== "string" || typeof x.url !== "string" || typeof x.verified !== "boolean")) throw new TypeError("Research sources must retain title, URL and verified state.");
  return true;
}
