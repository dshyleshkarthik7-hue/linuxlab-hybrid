import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(fileURLToPath(new URL("../..",import.meta.url)));
const canonical=JSON.parse(await readFile(path.join(root,"data/commands/canonical.json"),"utf8"));
const family=(n,c)=>{const s=String(n).toLowerCase();
if(/^(ls|cd|pwd|find|tree|which)$/.test(s))return"filesystem-navigation";
if(/^(cp|mv|rm|mkdir|chmod|chown)$/.test(s))return"filesystem-management";
if(/^(cat|head|tail|wc|sort)$/.test(s))return"text-inspection";
if(/^(grep|sed|awk)$/.test(s))return"text-processing";
if(/^(ps|kill|top|jobs)$/.test(s))return"process-control";
if(/^(ip|ping|ss)$/.test(s))return"networking";
if(/^(curl|wget|ssh|scp)$/.test(s))return"network-transfer";
if(/^(tar|gzip|zip)$/.test(s))return"archives";
if(/^(apt|apk|dnf|rpm)$/.test(s))return"package-management";
if(/^systemctl|journalctl/.test(s))return"systemd";
if(/^(df|du|free|uptime)$/.test(s))return"observability";
if(/^git/.test(s))return"git";
return c||"system-tool";};
const concepts=["arguments","stdin/stdout","exit status","implementation differences"];
const steps=["The shell expands the command line.","The program validates arguments and context.","It performs its Linux/library operation.","It writes output and returns an exit status."];
const byFamily=new Map();
for(const r of canonical.records){const f=family(r.name,r.category);(byFamily.get(f)||byFamily.set(f,[]).get(f)).push(r);}
const related=r=>(byFamily.get(family(r.name,r.category))||[]).filter(x=>x.name!==r.name).slice(0,5).map(x=>x.name);
const records={};
for(const r of canonical.records){
  const f=family(r.name,r.category);
  const summary=String(r.summary||"").trim()&&!/^Catalog entry/i.test(String(r.summary||""))?String(r.summary).trim():("Practice "+r.name+" safely on Linux.");
  const example=String(r.example||"").trim()&&String(r.example).trim()!==r.name?String(r.example).trim():(r.name+" --help");
  records[r.name]={
    id:r.id,name:r.name,url:r.url,status:"draft",version:3,
    verification:{syntax_verified:false,examples_verified:false,busybox_tested:false,human_reviewed:false,provenance_verified:false,quality_score:null},
    tagline:"Learn "+r.name+" as a complete Linux lesson.",
    definition:r.name+" is a Linux utility in the "+f.replace(/-/g," ")+" family. "+summary,
    explanation:"Use "+r.name+" when you need "+concepts.slice(0,3).join(", ")+" behavior. Confirm the installed implementation with command -v "+r.name+" because BusyBox, GNU, and distribution packages can differ.",
    syntax:r.name+" [OPTIONS] [ARGUMENTS]",
    options:[["--help","Show usage when supported."],["--version","Show version when supported."],["[ARGUMENTS]","Operands for "+r.name+"; check the local manual."]],
    examples:["command -v "+r.name,example,"man "+r.name+" 2>/dev/null || "+r.name+" --help"],
    internals:steps,
    mistakes:["Do not assume identical options across BusyBox, GNU, and BSD.","Read local --help before scripting.","Verify targets before changing real system data.","Remember shell expansion happens before "+r.name+" runs."],
    concepts,related:related(r),
    distroNotes:["Alpine may use BusyBox for "+r.name+".","Debian/Ubuntu availability depends on installed packages.","Kali follows Debian packaging with a security focus."],
    lesson:{family:f,learningPath:["Check command -v "+r.name+".","Read help text.","Run a reversible example.","Compare implementations you deploy."]}
  };
}
const out={schemaVersion:2,generatedFrom:"data/commands/canonical.json",records};
await mkdir(path.join(root,".cache"),{recursive:true});
await writeFile(path.join(root,".cache/command-intelligence.json"),JSON.stringify(out,null,2)+"\n");
const draftCount=Object.values(records).filter(r=>r.status==="draft").length;
console.log("[command-intelligence] generated "+Object.keys(records).length+" build-time lesson drafts outside the public web root ("+draftCount+" pending evidence-based validation; 0 self-certified complete)");
