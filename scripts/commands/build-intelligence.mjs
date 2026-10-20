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
const byFamily=new Map();
for(const r of canonical.records){const f=family(r.name,r.category);(byFamily.get(f)||byFamily.set(f,[]).get(f)).push(r);}
const related=r=>(byFamily.get(family(r.name,r.category))||[]).filter(x=>x.name!==r.name).slice(0,5).map(x=>x.name);
const records={};
for(const r of canonical.records){
  const f=family(r.name,r.category);
  const summary=String(r.summary||"").trim()&&!/^Catalog entry/i.test(String(r.summary||""))?String(r.summary).trim():"";
  const example=String(r.example||"").trim()&&String(r.example).trim()!==r.name?String(r.example).trim():"";
  records[r.name]={
    id:r.id,name:r.name,url:r.url,status:"draft",version:3,
    verification:{syntax_verified:false,examples_verified:false,busybox_tested:false,human_reviewed:false,provenance_verified:false,quality_score:null},
    tagline:summary ? "Draft lesson for "+r.name+"; pending source verification." : "Catalogue record for "+r.name+"; lesson content not yet researched.",
    definition:summary,
    explanation:"Not yet researched or verified. Populate from authoritative command documentation before publishing.",
    syntax:"",
    options:[],
    examples:example ? [example] : [],
    internals:[],
    mistakes:[],
    concepts:[],
    related:related(r),
    distroNotes:[],
    lesson:{family:f,learningPath:[]}
  };
}
const out={schemaVersion:2,generatedFrom:"data/commands/canonical.json",records};
await mkdir(path.join(root,".cache"),{recursive:true});
await writeFile(path.join(root,".cache/command-intelligence.json"),JSON.stringify(out,null,2)+"\n");
const draftCount=Object.values(records).filter(r=>r.status==="draft").length;
console.log("[command-intelligence] generated "+Object.keys(records).length+" build-time lesson drafts outside the public web root ("+draftCount+" pending evidence-based validation; 0 self-certified complete)");
