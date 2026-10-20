#!/usr/bin/env python3
"""Create unreviewed command-lesson drafts; never publish or mark them complete."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORE = set("pwd ls cd mkdir cp mv rm cat less head tail wc sort grep sed awk find locate which whereis man help history echo printf chmod chown umask touch ln stat file du df mount ps top kill jobs bg fg env export printenv uname whoami id groups date cal clear reset xargs tee cut tr uniq diff cmp tar gzip zip unzip curl wget ping ip ss dig nslookup ssh scp rsync git gcc make apk add del update upgrade systemctl journalctl free uptime lsof pgrep pkill".split())
INTERMEDIATE = set("useradd usermod userdel passwd sudo su groupadd groupmod groupdel visudo crontab at batch fdisk lsblk blkid mkfs fsck swapon swapoff chroot mount umount lsof strace ltrace tcpdump nft iptables ufw firewalld docker podman kubectl helm terraform ansible rsync openssl gpg sha256sum md5sum dd sed awk perl python3 ruby node npm pip3 journalctl systemctl service dmesg modprobe lsmod lspci lsusb ethtool nmcli resolvectl dig host traceroute tracepath nc netcat socat curl wget openssl s_client".split())

def slug(name):
    return re.sub(r"[^a-z0-9._+-]+", "-", name.lower()).strip("-") or "command"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--tier", choices=("core", "intermediate", "long-tail"), default="core")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--llm", action="store_true", help="reserved; LLM enrichment is not configured in this offline draft generator")
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 1000:
        parser.error("--limit must be between 1 and 1000")
    if args.llm:
        parser.error("--llm is not implemented in this repository version; do not assume draft generation calls an AI provider")
    source = ROOT / "data/commands/canonical.json"
    catalog = json.loads(source.read_text(encoding="utf-8"))
    records = catalog.get("records", [])
    if args.tier == "core":
        chosen = [r for r in records if r.get("name") in CORE]
    elif args.tier == "intermediate":
        chosen = [r for r in records if r.get("name") in INTERMEDIATE and r.get("name") not in CORE]
    else:
        chosen = [r for r in records if r.get("name") not in CORE and r.get("name") not in INTERMEDIATE]
    chosen = chosen[:args.limit]
    out = ROOT / ".cache/content-factory"
    if not args.dry_run:
        out.mkdir(parents=True, exist_ok=True)
    for record in chosen:
        name = record["name"]
        draft = {
            "schemaVersion": 1,
            "id": record.get("id"),
            "name": name,
            "tier": args.tier,
            "status": "draft",
            "requiresHumanReview": True,
            "source": "data/commands/canonical.json",
            "editorialChecklist": ["verify the command exists and identify its package", "write a command-specific definition and syntax", "test every example on a disposable Linux environment", "document implementation and distribution differences", "review destructive-operation safety", "review quiz and challenge answers"],
            "definition": "",
            "syntax": "",
            "examples": [],
            "internals": [],
            "quizSeed": {"question": "", "choices": [], "correctAnswer": "", "explanation": ""},
            "challengeSeed": {"prompt": "", "setup": [], "expectedBehavior": "", "safetyNotes": []},
        }
        if not args.dry_run:
            (out / (slug(name) + ".json")).write_text(json.dumps(draft, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    action = "would draft" if args.dry_run else "wrote drafts to"
    print(f"content-factory: {action} {len(chosen)} {args.tier} entries; every entry remains draft and requires human review")
    if args.tier == "core" and not chosen:
        raise SystemExit("No matching core commands found in canonical catalog")

if __name__ == "__main__":
    main()
