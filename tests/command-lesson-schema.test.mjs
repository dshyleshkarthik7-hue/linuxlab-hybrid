import assert from "node:assert/strict";
import { validateCommandLesson } from "../scripts/commands/lesson-schema.mjs";
const lesson = {
  title:"Find files by name and type",
  objective:"Learn to construct a safe find expression and interpret its traversal scope.",
  difficulty:"intermediate",
  prerequisites:["Basic shell navigation and absolute versus relative paths."],
  learningOutcomes:["Choose a starting path and explain traversal scope.","Combine name and type predicates.","Explain how predicates affect matched paths."],
  steps:["Choose a narrow starting directory that you are allowed to inspect.","Add a name predicate to select the target filename pattern.","Add a type predicate and inspect matching paths before further action."],
  workedExample:"From a disposable practice directory, use find . -type f -name logfiles to list regular files in the selected scope. The starting dot keeps traversal inside the practice directory.",
  expectedResult:"The command prints matching pathnames, one per line; no output means no path matched or the directory was not readable.",
  commonMistakes:["Quoting the pattern incorrectly so the shell expands it before find receives it.","Starting from an unexpectedly broad directory.","Confusing -name matching with content searching."],
  exercise:"Create a practice directory with empty files and list only regular files ending in .txt. Confirm that directories are excluded.",
  challenge:"Extend the practice query with a second filename pattern while keeping the search confined to the practice directory.",
  quiz:Array.from({length:5},(_,i)=>({question:"Which predicate restricts matches to regular files? "+(i+1),options:["-type f","-name","-mtime","-user"],answerIndex:0,explanation:"The -type f predicate selects regular files; the other predicates test different properties."})),
  reflection:"Explain why choosing the starting directory is as important as choosing the predicates."
};
assert.deepEqual(validateCommandLesson(lesson),[]);
for (const key of ["objective","workedExample","expectedResult","exercise","challenge","reflection"]) {
  assert.ok(validateCommandLesson({...lesson,[key]:"short"}).length>0,key);
}
assert.ok(validateCommandLesson({...lesson,quiz:lesson.quiz.slice(0,4)}).some(x=>x.includes("five questions")));
assert.ok(validateCommandLesson({...lesson,quiz:[{...lesson.quiz[0],answerIndex:9},...lesson.quiz.slice(1)]}).some(x=>x.includes("malformed")));
assert.ok(validateCommandLesson({...lesson,steps:["one"]}).some(x=>x.includes("three ordered steps")));
console.log("Command lesson schema tests passed.");
