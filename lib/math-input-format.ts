export type MathAnswerFormat='text'|'latex'|'mixed';
/** DOM-producing TeX commands and user-defined executable expansion are not accepted. */
export function mathInputProblem(value:string){
 if(value.length>4000)return '公式最多 4000 个字符';
 if(/\\(?:html\w*|href|url|includegraphics|class|style|css\w*|def|gdef|edef|newcommand|renewcommand|input|include|write\d*|catcode|csname|endcsname|special|unicode)\b/i.test(value))return '公式含不支持的链接、样式或自定义指令';
 let depth=0;for(const c of value){if(c==='{')depth++;if(c==='}')depth--;if(depth>32)return '公式嵌套过深';}return '';
}
export function supportsMathInput(subject:string,type:string){return ['math','physics'].includes(subject)&&['blank','subjective'].includes(type);}
