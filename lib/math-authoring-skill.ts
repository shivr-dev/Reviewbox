import {learningTemplate} from './import-templates';
const example=JSON.parse(learningTemplate('blank'));
example.manifest={...example.manifest,id:'math-input-example',title:'分数与代数表达式',subject:'math',version:'1.0.0'};
example.knowledge=example.knowledge.map((n:any)=>({...n,subject:'math',title:'分数与代数表达式',course:'数学',description:'分数计算与表达式等价',source:'外部 AI 原创'}));
example.questions=example.questions.map((q:any)=>({...q,subject:'math',prompt:'计算 $\\frac{1+1}{4}$，结果为 ____。',answer:'\\frac{1}{2}',answerFormat:'latex',acceptedAnswers:['0.5','1/2'],explanation:'分子为 2，分母为 4，约分得 $\\frac{1}{2}$。',source:'外部 AI 原创'}));
export const MATH_AUTHORING_SKILL=`
## 数学输入与本地核验 3.1
- 数学和物理的 blank、subjective 题支持 MathLive 编辑；KaTeX 仍负责只读公式。语文、英语、历史等文字输入不变。不要生成新的工具页面或修改已确认评分规则。
- answerFormat 可选 "text"、"latex"、"mixed"。省略时视为旧版 text，绝不要求批量迁移旧答案。latex 的 answer 为不带 $ 包裹的单个 LaTeX 表达式；mixed 的 answer 是自然语言与 $...$ 内嵌公式。prompt、explanation、solution 继续使用已有 $...$ / $$...$$ 约定；JSON 中反斜线写双反斜线。
- blank 的 acceptedAnswers 仍可提供完整的等价文本答案。不能把选择题答案改为 LaTeX：choice.answer 仍须与一个完整选项严格一致。pinyin、matching 格式完全不变。
- MathLive 可编辑分数、根式、指数、下标、方程组、不等式、希腊字母与单位；这不代表每一种表达式都能自动判分。
- Compute Engine 只为客观数学表达式提供“等价 / 不等价 / 无法确定”证据。它不会替代 Qwen 的主观过程评分，最终公式正确也不免除 Rubric 中的过程要求。
- 不用随机数代入宣称恒等。x/x 与 1 的定义域不同、sqrt(x²) 与 x 的符号条件、三角恒等式、方程增根、单位换算等须明确给出题目条件；当前保守核验若不能确定，会要求人工检查，不能标成错误或伪造 verified:true。
- 物理单位可用 \\mathrm{m} 等排版，但系统不会静默删除或换算单位。不能把单位正确性等同于数值正确性。
- 不输出 HTML、链接、宏定义、脚本、\\href、\\htmlData、\\newcommand、\\input 等指令。公式最长4000字符，自动核验最长1000字符；复杂证明与长篇推导交给已有主观评分。

### JSON 语法修复边界
- Reviewbox 在严格 JSON.parse 失败后，可在本地 Worker 用 JSONRepair 修复引号、逗号、闭合符及 Python True/False/None；修复前后都保留，学生确认后才继续既有 Schema、内容和版本检查。
- 这不是答案纠错或自动学习包生成。不要依赖修复补齐答案、评分点或资源。文字字段截断、缺失值、不确定截断会拒绝；matching.left/right 类型错误仍是 Schema 错误。ZIP 资源路径与 manifest ID、版本约定不变。

### 数学公式填空完整可导入示例
\`\`\`json
${JSON.stringify(example,null,2)}
\`\`\`
`;
