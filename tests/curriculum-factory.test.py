#!/usr/bin/env python3
import json, subprocess, sys, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class FactoryTests(unittest.TestCase):
    def test_inventory_counts_and_authoring_queue_contracts(self):
        canonical=json.loads((ROOT/"data/commands/canonical.json").read_text())
        curriculum=json.loads((ROOT/"learn/curriculum.json").read_text())
        self.assertEqual(canonical["recordCount"], len(canonical["records"]))
        self.assertEqual(curriculum["lessonCount"], len(curriculum["lessons"]))
        cmd=(ROOT/"scripts/commands/author-qwen-lessons.mjs").read_text()
        tut=(ROOT/"scripts/author-qwen-tutorials.mjs").read_text()
        cur=(ROOT/"scripts/author-qwen-curriculum.mjs").read_text()
        self.assertIn("orchestrateDraft",cmd); self.assertIn("status: \"draft\"",cmd)
        self.assertIn("humanReview: \"pending\"",tut)
        self.assertIn("humanReview:\"pending\"",cur)
        self.assertIn("data/commands/research",cmd)
        self.assertIn("data/tutorial-research",tut)
        self.assertIn("data/curriculum-research",cur)
        adapter=(ROOT/"scripts/lib/ai-provider.mjs").read_text()
        self.assertIn("arcee-ai/trinity-large-preview:free",adapter)
        self.assertIn("arcee-ai/trinity-mini:free",adapter)
        self.assertIn("ROLE_DEFAULTS",adapter)
        orchestrator=(ROOT/"scripts/lib/ai-orchestrator.mjs").read_text()
        self.assertIn("SKEPTICAL VERIFIER AND REPAIRER",orchestrator)
        self.assertIn("FINAL QUALITY EDITOR",orchestrator)
        self.assertIn("three-stage-free-v1",orchestrator)
        self.assertIn("gemini-3.1-flash-lite",adapter)
        self.assertIn("AI_ALLOW_HF_ROUTER",adapter)
        self.assertIn("AI_DRAFT_LABEL",cmd); self.assertIn("AI_DRAFT_LABEL",tut); self.assertIn("AI_DRAFT_LABEL",cur)
        gate=(ROOT/"scripts/curriculum-quality-gate.py").read_text()
        workflow=(ROOT/".github/workflows/curriculum-factory.yml").read_text()
        self.assertIn("--pilot-label",gate)
        self.assertIn("artifacts/ai-pilot",gate)
        self.assertIn("--pilot-label",workflow)
        self.assertIn("--strict-quality",gate)
        self.assertIn("--strict-quality",workflow)
        self.assertIn("Existing draft lessons in this batch",tut)
    def test_quality_gate_flags_known_factual_contradictions(self):
        import importlib.util
        spec=importlib.util.spec_from_file_location("quality_gate", ROOT/"scripts/curriculum-quality-gate.py")
        gate=importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
        self.assertTrue(gate.find_factual_red_flags('ID=ubuntu NAME="Fedora"', "tutorial", "lesson.json"))
        self.assertTrue(gate.find_factual_red_flags("tree exit status 2 means some files were listed", "command", "tree.json"))
        self.assertFalse(gate.find_factual_red_flags('ID=ubuntu NAME="Ubuntu"', "tutorial", "lesson.json"))
    def test_quality_gate_validates_schemas_sources_and_quiz_keys(self):
        import importlib.util
        spec=importlib.util.spec_from_file_location("quality_gate", ROOT/"scripts/curriculum-quality-gate.py")
        gate=importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
        from pathlib import Path
        command={"name":"pwd","definition":"Print the working directory.","explanation":"Reports the current working directory.","syntax":"pwd","examples":[{"command":"pwd","expectedBehavior":"Prints a path.","testPlan":"Run in a disposable shell."}],"implementationDifferences":[],"safetyNotes":["Read-only command."],"sources":[{"title":"pwd manual","url":"https://www.gnu.org/software/coreutils/manual/html_node/pwd-invocation.html"}]}
        errors,warnings=gate.validate_record("command",command,Path("pwd.json"))
        self.assertEqual(errors,[])
        self.assertEqual(warnings,[])
        bad={**command,"sources":[{"title":"fake","url":"javascript:alert(1)"}]}
        errors,warnings=gate.validate_record("command",bad,Path("pwd.json"))
        self.assertEqual(errors,[])
        self.assertTrue(any("not HTTPS" in warning for warning in warnings))
        bad_url={**command,"sources":[{"title":"bad URL","url":"https://example.com/path with spaces"}]}
        _,warnings=gate.validate_record("command",bad_url,Path("pwd.json"))
        self.assertTrue(any("not HTTPS" in warning for warning in warnings))
        curriculum={"content":{"title":"A sufficiently long title for a Linux lesson","objective":"An objective that is more than twenty five characters","prerequisites":"Prerequisites are sufficiently described for this lesson","explanation":"An explanation that is long enough to satisfy the curriculum contract and give the learner useful context.","workedExample":"A worked example that explains a safe Linux command and its expected behavior in enough detail.","expectedResult":"Expected results are described with enough detail for a learner to compare their own output.","commonMistakes":"Common mistakes are described in sufficient detail to help learners debug errors.","exercise":"A hands-on exercise with clear steps and completion criteria for the learner.","challenge":"A follow-up challenge that adds a useful variation and asks for reasoning.","reflection":"A reflection prompt that asks the learner to explain what they observed and why it matters.","steps":["step one","step two","step three"],"quiz":[{"question":"Question?","options":["A","B","C"],"answerIndex":9,"explanation":"Because this is invalid."}],"safetyNotes":["Use a disposable environment."],"sources":[{"title":"Linux manual","url":"https://man7.org/linux/man-pages/man1/ls.1.html"}]}}
        errors,warnings=gate.validate_record("curriculum",curriculum,Path("lesson.json"))
        self.assertTrue(any("malformed quiz question" in error for error in errors))
    def test_quality_audit_reports_missing_drafts_without_claiming_completion(self):
        result=subprocess.run([sys.executable,str(ROOT/"scripts/curriculum-quality-gate.py"),"--report",".cache/test-curriculum-quality-report.json"],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(result.returncode,0, "bounded/default audit must not fail just because unprocessed inventory items have no draft yet")
        report=json.loads((ROOT/".cache/test-curriculum-quality-report.json").read_text())
        self.assertTrue(report["modelDraftsAreNotPublishedContent"])
        self.assertEqual(report["commandLessons"]["inventory"],6161)
        self.assertEqual(report["structuredCurriculum"]["inventory"],520)
        self.assertIn("disclaimer",report)
        (ROOT/".cache/test-curriculum-quality-report.json").unlink(missing_ok=True)
if __name__=="__main__": unittest.main()
