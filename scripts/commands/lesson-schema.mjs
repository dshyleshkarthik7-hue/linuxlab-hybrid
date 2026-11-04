/** Structural contract for complete, command-specific learning lessons. */
const hasText = (value, min = 25) => typeof value === "string" && value.trim().length >= min;
export function validateCommandLesson(lesson) {
  const errors = [];
  if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) return ["lesson must be an object"];
  for (const key of ["title", "objective", "workedExample", "expectedResult", "exercise", "challenge", "reflection"]) {
    if (!hasText(lesson[key], key === "title" ? 8 : 45)) errors.push(key + " is missing or too shallow");
  }
  if (!["beginner", "intermediate", "advanced"].includes(lesson.difficulty)) errors.push("difficulty must be beginner, intermediate, or advanced");
  for (const key of ["prerequisites", "learningOutcomes", "steps", "commonMistakes", "quiz"]) {
    if (!Array.isArray(lesson[key])) errors.push(key + " must be an array");
  }
  for (const key of ["prerequisites", "learningOutcomes", "steps", "commonMistakes"]) {
    if (Array.isArray(lesson[key]) && lesson[key].some(item => !hasText(item, 12))) errors.push(key + " contains an empty or shallow item");
  }
  if (Array.isArray(lesson.learningOutcomes) && lesson.learningOutcomes.length < 3) errors.push("learningOutcomes must contain at least three outcomes");
  if (Array.isArray(lesson.steps) && lesson.steps.length < 3) errors.push("steps must contain at least three ordered steps");
  if (Array.isArray(lesson.commonMistakes) && lesson.commonMistakes.length < 3) errors.push("commonMistakes must contain at least three command-specific mistakes");
  if (!Array.isArray(lesson.quiz) || lesson.quiz.length < 5) errors.push("quiz must contain at least five questions");
  for (const [i, q] of (Array.isArray(lesson.quiz) ? lesson.quiz : []).entries()) {
    if (!q || typeof q !== "object" || !hasText(q.question, 12) || !Array.isArray(q.options) || q.options.length !== 4 ||
      q.options.some(option => !hasText(option, 1)) || !Number.isInteger(q.answerIndex) ||
      q.answerIndex < 0 || q.answerIndex >= q.options.length || !hasText(q.explanation, 20)) {
      errors.push("quiz question " + i + " is malformed");
    }
  }
  return errors;
}
