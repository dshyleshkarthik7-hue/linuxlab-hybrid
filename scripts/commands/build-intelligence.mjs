import {readFile,writeFile,mkdir,readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(fileURLToPath(new URL("../..",import.meta.url)));
const canonical=JSON.parse(await readFile(path.join(root,"data/commands/canonical.json"),"utf8"));
const researchRoot=path.join(root,"data/commands/research");
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
if(/^git/.test(s))return"git"; return c||"system-tool";};
const byFamily=new Map();
for(const r of canonical.records){const f=family(r.name,r.category);(byFamily.get(f)||byFamily.set(f,[]).get(f)).push(r);}
const related=r=>(byFamily.get(family(r.name,r.category))||[]).filter(x=>x.name!==r.name).slice(0,5).map(x=>x.name);
const research=new Map();
try { for(const file of await readdir(researchRoot)){if(!file.endsWith(".json"))continue;try{const item=JSON.parse(await readFile(path.join(researchRoot,file),"utf8"));research.set(item.name||file.slice(0,-5),item);}catch{}} } catch(error) { if(error.code!=="ENOENT") throw error; }
const records={}; let promoted=0;
for(const r of canonical.records){
 const f=family(r.name,r.category), draft=research.get(r.name), v=draft?.verification||{};
 const ready=draft?.status==="complete" && ["syntaxVerified","examplesVerified","busyboxTested","humanReviewed","provenanceVerified"].every(k=>v[k]===true) &&
  typeof draft.definition==="string" && draft.definition.trim() && typeof draft.explanation==="string" && draft.explanation.trim() &&
  typeof draft.syntax==="string" && draft.syntax.trim() && Array.isArray(draft.examples) && draft.examples.length>0 &&
  draft.examples.every(e=>e && typeof e.command==="string" && e.command.trim()) &&
  Array.isArray(draft.lesson?.steps) && draft.lesson.steps.length>=3 && Array.isArray(draft.lesson?.quiz) && draft.lesson.quiz.length>=5 &&
  Array.isArray(draft.sources) && draft.sources.length>0 && draft.sources.every(s=>s.verified===true);
 if(ready) promoted++;
 records[r.name]=ready ? {
  id:r.id,name:r.name,url:r.url,status:"complete",version:4,
  verification:{syntax_verified:true,examples_verified:true,busybox_tested:true,human_reviewed:true,provenance_verified:true,quality_score:draft.qualityScore??null},
  tagline:draft.lesson.title,definition:draft.definition,explanation:draft.explanation,syntax:draft.syntax,
  options:Array.isArray(draft.options)?draft.options.map(o=>[o.flag,o.description]):[],
  examples:draft.examples.map(e=>e.command),internals:draft.lesson.steps,mistakes:draft.lesson.commonMistakes,
  concepts:draft.lesson.learningOutcomes,related:related(r),
  distroNotes:draft.implementationDifferences.map(x=>x.implementation+": "+x.notes),
  lesson:{family:f,learningPath:draft.lesson.prerequisites,content:draft.lesson,sources:draft.sources}
 } : {
  id:r.id,name:r.name,url:r.url,status:"draft",version:4,
  verification:{syntax_verified:false,examples_verified:false,busybox_tested:false,human_reviewed:false,provenance_verified:false,quality_score:null},
  tagline:"Catalogue entry for "+r.name+"; a complete evidence-approved lesson is not yet available.",
  definition:"",explanation:"Not yet researched or verified.",syntax:"",options:[],examples:[],internals:[],mistakes:[],concepts:[],
  related:related(r),distroNotes:[],lesson:{family:f,learningPath:[]}
 };
}
const out={schemaVersion:4,generatedFrom:"data/commands/canonical.json",records};
await mkdir(path.join(root,".cache"),{recursive:true});
await writeFile(path.join(root,".cache/command-intelligence.json"),JSON.stringify(out,null,2)+"\n");
console.log("[command-intelligence] "+canonical.records.length+" commands; "+promoted+" evidence-complete lessons promoted; "+(canonical.records.length-promoted)+" pending.");
