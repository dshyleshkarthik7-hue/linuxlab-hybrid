#!/usr/bin/env python3
"""Audit AI-authored LinuxTerminal curriculum drafts without publishing them.

Uses Python stdlib only. Optional scikit-learn TF-IDF similarity is enabled when
installed; the deterministic lexical audit always runs. The report explicitly
separates inventory coverage from reviewed/publishable content.
"""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERIC = [
    re.compile(r"using the observable behavior of the example", re.I),
    re.compile(r"what important claim does it not establish", re.I),
    re.compile(r"it does not prove broader system state", re.I),
    re.compile(r"record the actual output and compare it with this expectation", re.I),
    re.compile(r"check the installed command's help or manual because implementations", re.I),
    re.compile(r"perform the command-specific operation using the operating system", re.I),
]
UNSAFE = [
    re.compile(r"\brm\s+-rf\s+/(?:\s|$|\*)", re.I),
    re.compile(r"\bmkfs(?:\.[a-z0-9]+)?\s+/dev/", re.I),
    re.compile(r"\bdd\b[^\n]*\bof=/dev/(?:sd[a-z]|nvme|vd[a-z])", re.I),
    re.compile(r"curl[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash)", re.I),
    re.compile(r"chmod\s+-R\s+777\s+/", re.I),
]
WORD = re.compile(r"[a-z0-9_./+-]{2,}", re.I)

def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except Exception as exc:
        return {"__parse_error__": str(exc)}

def norm(s: str) -> str:
    return " ".join(WORD.findall(s.lower()))

def words_for(item, kind):
    if kind == "command":
        vals = [item.get(k, "") for k in ("definition", "explanation", "syntax")]
        for example in item.get("examples", []):
            if isinstance(example, dict):
                vals.extend(example.get(k, "") for k in ("command", "expectedBehavior", "testPlan"))
        vals.extend(item.get("safetyNotes", []) if isinstance(item.get("safetyNotes"), list) else [])
        return " ".join(str(v) for v in vals)
    content = item.get("content", item)
    if not isinstance(content, dict):
        return ""
    keys = ("title", "objective", "prerequisites", "explanation", "workedExample",
            "expectedResult", "commonMistakes", "exercise", "challenge", "reflection")
    vals = [content.get(k, "") for k in keys]
    vals.extend(content.get("steps", []) if isinstance(content.get("steps"), list) else [])
    quiz = content.get("quiz", content.get("knowledgeCheck", []))
    if isinstance(quiz, list):
        for q in quiz:
            if isinstance(q, dict):
                vals.extend(q.get(k, "") for k in ("question", "explanation", "answer"))
    return " ".join(str(v) for v in vals)

def find_generic(text):
    return [p.pattern for p in GENERIC if p.search(text)]

def find_unsafe(text):
    return [p.pattern for p in UNSAFE if p.search(text)]

def find_factual_red_flags(text, kind, filename):
    """Deterministic high-confidence contradictions; never claim this replaces review."""
    flags = []
    if re.search(r"\bID\s*=\s*['\"]?ubuntu\b", text, re.I) and re.search(r"\bNAME\s*=\s*['\"]Fedora['\"]", text, re.I):
        flags.append("contradictory os-release example: ID=ubuntu paired with NAME=Fedora")
    if kind == "command" and filename == "tree.json" and re.search(
        r"exit status.{0,100}2.{0,100}(some|files).{0,40}(listed|printed)", text, re.I | re.S
    ):
        flags.append("unsupported tree exit-status claim; require implementation-specific manual verification")
    return flags

def validate_record(kind, obj, file):
    """Return deterministic schema/content issues without treating drafts as verified."""
    issues, warnings = [], []
    if kind == "command":
        for key in ("name", "definition", "explanation", "syntax"):
            if not isinstance(obj.get(key), str) or not obj[key].strip():
                issues.append("missing or empty required field: " + key)
        if obj.get("name") and obj.get("name") != file.stem:
            issues.append("command name does not match filename")
        for key in ("examples", "implementationDifferences", "safetyNotes", "sources"):
            if not isinstance(obj.get(key), list):
                issues.append("required array missing or invalid: " + key)
        examples = obj.get("examples", [])
        for i, example in enumerate(examples if isinstance(examples, list) else []):
            if not isinstance(example, dict) or any(not isinstance(example.get(k), str) or not example[k].strip() for k in ("command", "expectedBehavior", "testPlan")):
                issues.append(f"malformed example at index {i}")
        sources = obj.get("sources", [])
    else:
        content = obj.get("content", obj)
        if not isinstance(content, dict):
            issues.append("content must be a JSON object")
            content = {}
        if kind == "tutorial":
            for key in ("title", "objective", "explanation", "workedExample", "expectedResult", "exercise", "knowledgeCheck"):
                if not isinstance(content.get(key), str) or not content[key].strip():
                    issues.append("missing or empty content field: " + key)
            sources = content.get("sources", [])
            safety = content.get("safetyNotes", [])
            if not isinstance(safety, list) or not safety:
                issues.append("content safetyNotes must be a non-empty array")
        else:
            for key in ("title", "objective", "prerequisites", "explanation", "workedExample", "expectedResult", "commonMistakes", "exercise", "challenge", "reflection"):
                if not isinstance(content.get(key), str) or len(content[key].strip()) < 25:
                    issues.append("missing or shallow content field: " + key)
            steps = content.get("steps")
            if not isinstance(steps, list) or len(steps) < 3:
                issues.append("content steps must contain at least three steps")
            quiz = content.get("quiz")
            if not isinstance(quiz, list) or len(quiz) < 5:
                issues.append("content quiz must contain at least five questions")
            else:
                for i, q in enumerate(quiz):
                    if not isinstance(q, dict) or not isinstance(q.get("question"), str) or not isinstance(q.get("options"), list) or len(q["options"]) < 3 or not isinstance(q.get("answerIndex"), int) or isinstance(q.get("answerIndex"), bool) or q["answerIndex"] < 0 or q["answerIndex"] >= len(q["options"]) or not isinstance(q.get("explanation"), str) or not q["explanation"].strip():
                        issues.append(f"malformed quiz question at index {i}")
            sources = content.get("sources", [])
            safety = content.get("safetyNotes", [])
            if not isinstance(safety, list) or not safety:
                issues.append("content safetyNotes must be a non-empty array")
        if not isinstance(sources, list) or not sources:
            issues.append("candidate sources must be a non-empty array")
    if isinstance(sources, list):
        for i, source in enumerate(sources):
            url = source.get("url", "") if isinstance(source, dict) else ""
            title = source.get("title", "") if isinstance(source, dict) else ""
            if not isinstance(title, str) or not title.strip():
                issues.append(f"source {i} has no title")
            if not isinstance(url, str) or not re.match(r"^https://[A-Za-z0-9.-]+(?::[0-9]+)?(?:/[^\s]*)?$", url):
                warnings.append(f"source {i} URL is malformed or not HTTPS")
    return issues, warnings

def audit_dir(kind, directory, expected_items):
    files = sorted(directory.glob("*.json")) if directory.exists() else []
    entries, errors, warnings = [], [], []
    hashes = defaultdict(list)
    for file in files:
        obj = read_json(file)
        if not isinstance(obj, dict) or "__parse_error__" in obj:
            errors.append({"file": str(file.relative_to(ROOT)), "issue": "invalid JSON"})
            continue
        body = words_for(obj, kind)
        schema_issues, source_warnings = validate_record(kind, obj, file)
        for issue in schema_issues:
            errors.append({"file": str(file.relative_to(ROOT)), "issue": issue})
        for issue in source_warnings:
            warnings.append({"file": str(file.relative_to(ROOT)), "issue": issue})
        if len(body.strip()) < 180:
            warnings.append({"file": str(file.relative_to(ROOT)), "issue": "short lesson body"})
        generic = find_generic(body)
        if len(generic) >= 2:
            warnings.append({"file": str(file.relative_to(ROOT)), "issue": "template-heavy phrases", "matches": generic})
        unsafe = find_unsafe(body)
        if unsafe:
            errors.append({"file": str(file.relative_to(ROOT)), "issue": "unsafe command pattern; manual review required", "matches": unsafe})
        factual_flags = find_factual_red_flags(body, kind, file.name)
        for flag in factual_flags:
            errors.append({"file": str(file.relative_to(ROOT)), "issue": flag})
        normalized = norm(body)
        if normalized:
            hashes[hashlib.sha256(normalized.encode()).hexdigest()].append(file.name)
        status = obj.get("status", "")
        human_review = (obj.get("humanReview") in ("approved", "reviewed") or obj.get("reviewStatus") == "reviewed" or (isinstance(obj.get("verification"), dict) and obj["verification"].get("humanReviewed") is True))
        source_verified = obj.get("sourceVerification") == "verified" or obj.get("verification", {}).get("provenanceVerified") is True
        execution_verified = obj.get("executionVerification") == "passed" or obj.get("exampleExecutionStatus") == "passed"
        entries.append({"file": file.name, "status": status, "humanReviewed": human_review,
                        "sourceVerified": source_verified, "executionVerified": execution_verified,
                        "wordCount": len(WORD.findall(body))})
    duplicates = [{"files": names} for names in hashes.values() if len(names) > 1]
    if duplicates:
        warnings.append({"issue": "exact duplicate normalized lesson bodies", "groups": duplicates[:100], "groupCount": len(duplicates)})
    # Optional ML-assisted near-duplicate screening. Keep it sparse and bounded.
    ml = {"available": False, "compared": 0, "nearDuplicatePairs": []}
    if len(entries) >= 2:
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.neighbors import NearestNeighbors
            texts, text_files = [], []
            for file in files:
                obj = read_json(file)
                if isinstance(obj, dict) and "__parse_error__" not in obj:
                    texts.append(words_for(obj, kind))
                    text_files.append(file)
            if len(texts) >= 2:
                vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=60000, stop_words="english")
                matrix = vectorizer.fit_transform(texts)
                nn = NearestNeighbors(n_neighbors=min(3, len(texts)), metric="cosine", algorithm="brute")
                nn.fit(matrix)
                distances, indices = nn.kneighbors(matrix)
                pairs, seen = [], set()
                for i in range(len(texts)):
                    for dist, j in zip(distances[i][1:], indices[i][1:]):
                        sim = 1.0 - float(dist)
                        pair = tuple(sorted((text_files[i].name, text_files[int(j)].name)))
                        if sim >= (0.72 if kind == "command" else 0.58) and pair not in seen:
                            seen.add(pair)
                            pairs.append({"files": list(pair), "cosineSimilarity": round(sim, 4)})
                ml = {"available": True, "method": "TF-IDF word uni/bigrams + cosine nearest neighbors",
                      "threshold": 0.72 if kind == "command" else 0.58,
                      "compared": len(texts), "nearDuplicatePairs": sorted(pairs, key=lambda x: -x["cosineSimilarity"])[:200]}
        except ImportError:
            ml["note"] = "Install requirements-curriculum.txt to enable TF-IDF similarity; exact/templated checks still run."
        except Exception as exc:
            ml["note"] = "Optional similarity model unavailable: " + str(exc)[:200]
    if ml.get("nearDuplicatePairs"):
        warnings.append({"issue": "semantic near-duplicate lesson candidates; compare learning objectives and exercises", 
                         "groups": ml["nearDuplicatePairs"][:100], "groupCount": len(ml["nearDuplicatePairs"])})
    return {
        "inventory": expected_items, "draftFiles": len(entries),
        "coveragePercent": round(100 * len(entries) / expected_items, 2) if expected_items else 100,
        "humanReviewed": sum(x["humanReviewed"] for x in entries),
        "sourceVerified": sum(x["sourceVerified"] for x in entries),
        "executionVerified": sum(x["executionVerified"] for x in entries),
        "errors": errors, "warnings": warnings, "similarity": ml,
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true", help="fail when any inventory item lacks a valid draft or duplicates/template warnings exist")
    ap.add_argument("--release", action="store_true", help="also require each item to be reviewed, source-verified, and execution-verified")
    ap.add_argument("--strict-quality", action="store_true", help="fail on audit errors or quality warnings without requiring the full inventory")
    ap.add_argument("--report", default=".cache/curriculum-quality-report.json")
    ap.add_argument("--pilot-label", help="audit isolated pilot drafts under artifacts/ai-pilot/<label>")
    args = ap.parse_args()
    canonical = read_json(ROOT / "data/commands/canonical.json")
    curriculum = read_json(ROOT / "learn/curriculum.json")
    if not isinstance(canonical, dict) or not isinstance(canonical.get("records"), list):
        print("ERROR: canonical command inventory missing or invalid", file=sys.stderr); return 2
    if not isinstance(curriculum, dict) or not isinstance(curriculum.get("lessons"), list):
        print("ERROR: curriculum inventory missing or invalid", file=sys.stderr); return 2
    command_records = canonical["records"]
    if len(command_records) != canonical.get("recordCount"):
        print("ERROR: canonical count mismatch", file=sys.stderr); return 2
    lessons = curriculum["lessons"]
    if len(lessons) != curriculum.get("lessonCount"):
        print("ERROR: curriculum count mismatch", file=sys.stderr); return 2
    # Pilot drafts intentionally live outside production queues. Audit only the bounded
    # pilot identities; otherwise a successful pilot is incorrectly reported as 0/full inventory.
    if args.pilot_label and not re.fullmatch(r"[a-z0-9-]{1,48}", args.pilot_label):
        print("ERROR: --pilot-label must be a lowercase slug (1-48 characters)", file=sys.stderr)
        return 2
    if args.pilot_label:
        pilot_root = ROOT / "artifacts/ai-pilot" / args.pilot_label
        expected_commands = command_records[:5]
        expected_lessons = lessons[:2]
        command_dir = pilot_root / "commands"
        tutorial_dir = pilot_root / "tutorials"
        curriculum_dir = pilot_root / "curriculum"
    else:
        expected_commands = command_records
        expected_lessons = lessons
        command_dir = ROOT / "data/commands/research"
        tutorial_dir = ROOT / "data/tutorial-research"
        curriculum_dir = ROOT / "data/curriculum-research"

    # Compare filenames against required inventory identities so stray files cannot inflate coverage.
    command_audit = audit_dir("command", command_dir, len(expected_commands))
    expected_names = {str(r.get("name", "")) + ".json" for r in expected_commands}
    found_names = {p.name for p in command_dir.glob("*.json")} if command_dir.exists() else set()
    command_audit["missingDrafts"] = sorted(expected_names - found_names)
    command_audit["unexpectedDrafts"] = sorted(found_names - expected_names)

    tutorial_audit = audit_dir("tutorial", tutorial_dir, len(expected_lessons))
    expected_tutorial_names = {str(x.get("id", "")) + ".json" for x in expected_lessons}
    found_tutorial_names = {p.name for p in tutorial_dir.glob("*.json")} if tutorial_dir.exists() else set()
    tutorial_audit["missingDrafts"] = sorted(expected_tutorial_names - found_tutorial_names)
    tutorial_audit["unexpectedDrafts"] = sorted(found_tutorial_names - expected_tutorial_names)

    # The current pilot exercises commands and tutorials only, not structured curriculum.
    curriculum_expected = [] if args.pilot_label else lessons
    curriculum_audit = audit_dir("curriculum", curriculum_dir, len(curriculum_expected))
    expected_curriculum_names = {str(x.get("id", "")) + ".json" for x in curriculum_expected}
    found_curriculum_names = {p.name for p in curriculum_dir.glob("*.json")} if curriculum_dir.exists() else set()
    curriculum_audit["missingDrafts"] = sorted(expected_curriculum_names - found_curriculum_names)
    curriculum_audit["unexpectedDrafts"] = sorted(found_curriculum_names - expected_curriculum_names)

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelDraftsAreNotPublishedContent": True,
        "commandLessons": command_audit,
        "detailedTutorials": tutorial_audit,
        "structuredCurriculum": curriculum_audit,
        "disclaimer": "Counts show inventory and draft files only. AI-generated drafts are not complete lessons until sources, factual claims, examples, quiz keys, portability, and safety are independently verified and human-reviewed."
    }
    out = ROOT / args.report
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": args.report, "commandDrafts": f'{command_audit["draftFiles"]}/{command_audit["inventory"]}',
                      "tutorialDrafts": f'{tutorial_audit["draftFiles"]}/{tutorial_audit["inventory"]}',
                      "curriculumDrafts": f'{curriculum_audit["draftFiles"]}/{curriculum_audit["inventory"]}',
                      "tfidfAvailable": any(x["similarity"].get("available") for x in (command_audit, tutorial_audit, curriculum_audit))}, indent=2))
    problems = False
    for audit in (command_audit, tutorial_audit, curriculum_audit):
        if audit["errors"] or audit.get("missingDrafts") or audit.get("unexpectedDrafts"):
            problems = True
        if args.strict and (audit["draftFiles"] != audit["inventory"] or audit["warnings"]):
            problems = True
        if args.strict_quality and audit["warnings"]:
            problems = True
        if args.release and (audit["humanReviewed"] != audit["inventory"] or audit["sourceVerified"] != audit["inventory"] or audit["executionVerified"] != audit["inventory"]):
            problems = True
    return 1 if problems else 0

if __name__ == "__main__":
    raise SystemExit(main())
