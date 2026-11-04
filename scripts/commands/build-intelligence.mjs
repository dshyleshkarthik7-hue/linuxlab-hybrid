import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPublishableResearch } from "./research-publication-policy.mjs";
const root=path.resolve(fileURLToPath(new URL("../..",import.meta.url)));
const readJson=async file=>JSON.parse(await readFile(file,"utf8"));
const canonical=await readJson(path.join(root,"data/commands/canonical.json"));
if(!Array.isArray(canonical.records)||canonical.records.length!==canonical.recordCount)throw new Error("Canonical command inventory failed its count contract.");
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
if(/^(systemctl|journalctl)$/.test(s))return"systemd";
if(/^(df|du|free|uptime)$/.test(s))return"observability";
if(/^git/.test(s))return"git";
return c||"system-tool";};
async function walk(dir,out=[]){let entries=[];try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code==="ENOENT")return out;throw e;}for(const entry of entries){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file,out);else if(entry.isFile()&&entry.name.endsWith(".json"))out.push(file);}return out;}
const researchFiles=await walk(path.join(root,"data/commands/research"));
const research=new Map();
for(const file of researchFiles){const record=await readJson(file);const name=String(record.name||path.basename(file,".json"));if(research.has(name))throw new Error("Duplicate research record: "+name);research.set(name,record);}
const canonicalNames=new Set(canonical.records.map(x=>x.name));
for(const name of research.keys())if(!canonicalNames.has(name))throw new Error("Research record is not canonical: "+name);
const byFamily=new Map();
for(const r of canonical.records){const f=family(r.name,r.category);if(!byFamily.has(f))byFamily.set(f,[]);byFamily.get(f).push(r);}
const records={};let approved=0;
for(const r of canonical.records){
 const f=family(r.name,r.category),related=(byFamily.get(f)||[]).filter(x=>x.name!==r.name).slice(0,5).map(x=>x.name),candidate=research.get(r.name);
 if(isPublishableResearch(candidate)){
  approved++;
  records[r.name]={id:r.id,name:r.name,url:r.url,status:"complete",version:4,verification:{syntaxVerified:true,examplesVerified:true,busyboxTested:true,humanReviewed:true,provenanceVerified:true,syntax_verified:true,examples_verified:true,busybox_tested:true,human_reviewed:true,provenance_verified:true,quality_score:Number(candidate.qualityScore??candidate.verification.qualityScore)},qualityScore:Number(candidate.qualityScore??candidate.verification.qualityScore),review:candidate.review,tagline:candidate.definition,definition:candidate.definition,explanation:candidate.explanation,syntax:candidate.syntax,options:Array.isArray(candidate.options)?candidate.options:[],examples:candidate.examples.map(x=>({command:x.command,expectedBehavior:x.expectedBehavior,testEvidence:x.testEvidence})),internals:candidate.implementationDifferences.map(x=>x.implementation+": "+x.notes),mistakes:Array.isArray(candidate.commonMistakes)?candidate.commonMistakes:[],safetyNotes:candidate.safetyNotes,concepts:Array.isArray(candidate.concepts)?candidate.concepts:[],related:Array.isArray(candidate.related)?candidate.related:related,distroNotes:candidate.implementationDifferences,sources:candidate.sources,sourceEvidence:candidate.sources,lesson:{family:f,learningPath:Array.isArray(candidate.learningPath)?candidate.learningPath:[]}};
 }else{
  const summary=String(r.summary||"").trim()&&!/^Catalog entry/i.test(String(r.summary||""))?String(r.summary).trim():"";
  const example=String(r.example||"").trim()&&String(r.example).trim()!==r.name?String(r.example).trim():"";
  records[r.name]={id:r.id,name:r.name,url:r.url,status:"draft",version:4,verification:{syntax_verified:false,examples_verified:false,busybox_tested:false,human_reviewed:false,provenance_verified:false,quality_score:null},tagline:summary?"Draft lesson for "+r.name+"; pending source verification.":"Catalogue record for "+r.name+"; lesson content not yet researched.",definition:summary,explanation:"Not yet researched or verified. Populate from authoritative command documentation before publishing.",syntax:"",options:[],examples:example?[example]:[],internals:[],mistakes:[],concepts:[],related,distroNotes:[],lesson:{family:f,learningPath:[]}};
 }
}
const out={schemaVersion:3,generatedFrom:"data/commands/canonical.json",researchDirectory:"data/commands/research",approvedResearchLessons:approved,records};
await mkdir(path.join(root,".cache"),{recursive:true});
await writeFile(path.join(root,".cache/command-intelligence.json"),JSON.stringify(out,null,2)+"\n");
console.log("[command-intelligence] "+Object.keys(records).length+" catalog entries; "+approved+" research records passed every publication gate; "+(Object.keys(records).length-approved)+" remain noindex drafts.");
