import { InBrowserLinuxEngine } from './LinuxEngine.ts';

export interface TestCase { id:number; description:string; injectedVar:{name:string;value:number}; expectedSubstring:string; forbiddenSubstring?:string; }
export interface AssessmentCheck { label:string; passed:boolean; feedback:string; }
export interface AssessmentResult { passed:number; total:number; logs:string[]; score:number; checks:AssessmentCheck[]; }

export class AssessmentRunner {
  // Keep this as an ordinary property instead of a TypeScript parameter property.
  // Node 22's strip-types test runner can erase types but intentionally does not
  // transform parameter properties, so this form keeps the source runnable in CI.
  private engine: InBrowserLinuxEngine;

  constructor(engine: InBrowserLinuxEngine) {
    this.engine = engine;
  }
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
    for(const [label,re] of structural){const passed=re.test(code);checks.push({label,passed,feedback:passed?'Structure detected.':'Required structure was not detected.'});}
    for(const tc of suite){let output='';try{output=this.engine.executeGeneralCode(code,lang,{[tc.injectedVar.name]:tc.injectedVar.value});}catch(e){output=String(e)}const hasExpected=output.includes(tc.expectedSubstring); const hasForbidden=tc.forbiddenSubstring ? output.includes(tc.forbiddenSubstring) : false; const passed=hasExpected&&!hasForbidden; const feedback=passed?'Expected output produced.':hasForbidden?`Conflicting output was also produced: ${tc.forbiddenSubstring}`:`Expected output containing: ${tc.expectedSubstring}`; checks.push({label:tc.description,passed,feedback});}
    const passed=checks.filter(c=>c.passed).length,total=checks.length,score=Math.round(passed/total*100);
    const logs=[`Assessment completed in ${(performance.now()-start).toFixed(2)} ms — ${score}% (${passed}/${total})`,...checks.map(c=>`${c.passed?'✓':'✗'} ${c.label}: ${c.feedback}`)];
    return {passed,total,score,logs,checks};
  }
}