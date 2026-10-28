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
        if len(body.strip()) < 180:
            warnings.append({"file": str(file.relative_to(ROOT)), "issue": "short lesson body"})
        generic = find_generic(body)
        if len(generic) >= 2:
            warnings.append({"file": str(file.relative_to(ROOT)), "issue": "template-heavy phrases", "matches": generic})
        unsafe = find_unsafe(body)
        if unsafe:
            errors.append({"file": str(file.relative_to(ROOT)), "issue": "unsafe command pattern; manual review required", "matches": unsafe})
        normalized = norm(body)
        if normalized:
            hashes[hashlib.sha256(normalized.encode()).hexdigest()].append(file.name)
        status = obj.get("status", "")
        human_review = obj.get("humanReview") in ("approved", "reviewed") or obj.get("reviewStatus") == "reviewed"
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
            texts = []
            for file in files:
                obj = read_json(file)
                if isinstance(obj, dict) and "__parse_error__" not in obj:
                    texts.append(words_for(obj, kind))
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
                        pair = tuple(sorted((files[i].name, files[int(j)].name)))
                        if sim >= 0.88 and pair not in seen:
                            seen.add(pair)
                            pairs.append({"files": list(pair), "cosineSimilarity": round(sim, 4)})
                ml = {"available": True, "method": "TF-IDF word uni/bigrams + cosine nearest neighbors",
                      "compared": len(texts), "nearDuplicatePairs": sorted(pairs, key=lambda x: -x["cosineSimilarity"])[:200]}
        except ImportError:
            ml["note"] = "Install requirements-curriculum.txt to enable TF-IDF similarity; exact/templated checks still run."
        except Exception as exc:
            ml["note"] = "Optional similarity model unavailable: " + str(exc)[:200]
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
    ap.add_argument("--report", default=".cache/curriculum-quality-report.json")
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
    # Include every command's draft as a required identity; a stray JSON file cannot inflate coverage.
    command_dir = ROOT / "data/commands/research"
    command_audit = audit_dir("command", command_dir, len(command_records))
    expected_names = {str(r.get("name", "")) + ".json" for r in command_records}
    found_names = {p.name for p in command_dir.glob("*.json")} if command_dir.exists() else set()
    command_audit["missingDrafts"] = sorted(expected_names - found_names)
    command_audit["unexpectedDrafts"] = sorted(found_names - expected_names)
    tutorial_audit = audit_dir("tutorial", ROOT / "data/tutorial-research", len(lessons))
    tutorial_audit["missingDrafts"] = sorted({str(x.get("id", "")) + ".json" for x in lessons} - ({p.name for p in (ROOT / "data/tutorial-research").glob("*.json")} if (ROOT / "data/tutorial-research").exists() else set()))
    curriculum_audit = audit_dir("curriculum", ROOT / "data/curriculum-research", len(lessons))
    curriculum_audit["missingDrafts"] = sorted({str(x.get("id", "")) + ".json" for x in lessons} - ({p.name for p in (ROOT / "data/curriculum-research").glob("*.json")} if (ROOT / "data/curriculum-research").exists() else set()))
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
        if args.release and (audit["humanReviewed"] != audit["inventory"] or audit["sourceVerified"] != audit["inventory"] or audit["executionVerified"] != audit["inventory"]):
            problems = True
    return 1 if problems else 0

if __name__ == "__main__":
    raise SystemExit(main())
