import { InBrowserLinuxEngine } from './LinuxEngine.ts';

export type CheckState = 'passed' | 'failed' | 'unable-to-verify';
export interface TestCase { id:number; description:string; injectedVar:{name:string;value:number}; expectedSubstring:string; forbiddenSubstring?:string; }
export interface AssessmentCheck { label:string; state:CheckState; passed:boolean; feedback:string; evidence?:string; }
export interface AssessmentResult { passed:number; failed:number; unableToVerify:number; total:number; logs:string[]; score:number; checks:AssessmentCheck[]; educationalOnly:true; executionVerified:boolean; verificationMode:'simulator-runtime'|'source-only'; }

export class AssessmentRunner {
  constructor(private readonly engine: InBrowserLinuxEngine) {}
  public runCTestSuite(sourceCode:string):AssessmentResult {
    const suite:TestCase[]=[
      {id:1,description:'Table num=5 (Step 1)',injectedVar:{name:'num',value:5},expectedSubstring:'5 x 1 = 5'},
      {id:2,description:'Table num=5 (Step 10)',injectedVar:{name:'num',value:5},expectedSubstring:'5 x 10 = 50'},
      {id:3,description:'Table num=9 (Step 5)',injectedVar:{name:'num',value:9},expectedSubstring:'9 x 5 = 45'},
      {id:4,description:'Table num=12 (Step 10)',injectedVar:{name:'num',value:12},expectedSubstring:'12 x 10 = 120'},
      {id:5,description:'Edge case num=0',injectedVar:{name:'num',value:0},expectedSubstring:'0 x 10 = 0'},
      {id:6,description:'Negative input num=-3',injectedVar:{name:'num',value:-3},expectedSubstring:'-3 x 10 = -30'}];
    return this.evaluateSuite(sourceCode,'c',suite,[['C main function',/\bmain\s*\(/],['C output statement',/printf\s*\(/],['Iteration construct',/\b(for|while)\s*\(/]]);
  }
  public runJavaTestSuite(sourceCode:string):AssessmentResult {
    const suite:TestCase[]=[
      {id:1,description:'Prime test for 7',injectedVar:{name:'num',value:7},expectedSubstring:'7 is a Prime Number',forbiddenSubstring:'7 is not a Prime Number'},
      {id:2,description:'Composite test for 8',injectedVar:{name:'num',value:8},expectedSubstring:'8 is not a Prime Number',forbiddenSubstring:'8 is a Prime Number'},
      {id:3,description:'Prime test for 13',injectedVar:{name:'num',value:13},expectedSubstring:'13 is a Prime Number',forbiddenSubstring:'13 is not a Prime Number'},
      {id:4,description:'Small prime 2',injectedVar:{name:'num',value:2},expectedSubstring:'2 is a Prime Number',forbiddenSubstring:'2 is not a Prime Number'},
      {id:5,description:'Small non-prime 1',injectedVar:{name:'num',value:1},expectedSubstring:'1 is not a Prime Number',forbiddenSubstring:'1 is a Prime Number'}];
    return this.evaluateSuite(sourceCode,'java',suite,[['Java class declaration',/\bclass\s+\w+/],['Java main method',/static\s+void\s+main\s*\(/],['Java console output',/System\.out\.(print|println)\s*\(/]]);
  }
  private evaluateSuite(code:string,lang:'c'|'java',suite:TestCase[],structural:Array<[string,RegExp]>):AssessmentResult {
    const start=performance.now(); const checks:AssessmentCheck[]=[];
    for(const [label,re] of structural){const passed=re.test(code);checks.push({label,passed,state:passed?'passed':'failed',feedback:passed?'Required structure detected.':'Required structure was not detected.'});}
    const unsupported=this.detectUnsupported(code,lang);
    for(const tc of suite){
      if(unsupported){checks.push({label:tc.description,passed:false,state:'unable-to-verify',feedback:unsupported});continue;}
      try{
        const output=this.engine.executeGeneralCode(code,lang,{[tc.injectedVar.name]:tc.injectedVar.value});
        const hasExpected=output.includes(tc.expectedSubstring); const hasForbidden=Boolean(tc.forbiddenSubstring&&output.includes(tc.forbiddenSubstring)); const passed=hasExpected&&!hasForbidden;
        checks.push({label:tc.description,passed,state:passed?'passed':'failed',evidence:output.slice(0,4000),feedback:passed?'Simulator execution produced the expected evidence.':hasForbidden?`Conflicting output was produced: ${tc.forbiddenSubstring}`:`Expected output containing: ${tc.expectedSubstring}`});
      }catch(error){checks.push({label:tc.description,passed:false,state:'unable-to-verify',feedback:`Simulator could not execute this case: ${error instanceof Error?error.message:String(error)}`});}
    }
    const passed=checks.filter(c=>c.state==='passed').length,failed=checks.filter(c=>c.state==='failed').length,unableToVerify=checks.filter(c=>c.state==='unable-to-verify').length,total=checks.length,score=total?Math.round(passed/total*100):0;
    return {passed,failed,unableToVerify,total,score,checks,educationalOnly:true,executionVerified:passed>0&&unableToVerify===0,verificationMode:'simulator-runtime',logs:[`Assessment completed in ${(performance.now()-start).toFixed(2)} ms — ${score}% (${passed}/${total} passed)`,'NOTICE: execution evidence comes from Engine A, the educational simulator; it is not native GCC/JVM verification.',...checks.map(c=>`${c.state==='passed'?'✓':c.state==='failed'?'✗':'?'} ${c.label}: ${c.feedback}`)]};
  }
  private detectUnsupported(code:string,lang:'c'|'java'):string|null {
    if(!code.trim()) return 'No source code was supplied.';
    if(lang==='c'&&!/\bint\s+main\s*\(/.test(code)) return 'C entry point could not be verified.';
    if(lang==='java'&&!/static\s+void\s+main\s*\(/.test(code)) return 'Java entry point could not be verified.';
    if(/\b(system|exec|fork|popen|Runtime\.getRuntime|ProcessBuilder)\s*\(/.test(code)) return 'Program uses host-process features that Engine A deliberately does not emulate.';
    return null;
  }
}
