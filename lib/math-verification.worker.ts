import {verifyMathCore,type MathVerificationOptions} from './math-verification-core';
self.onmessage=async(e:MessageEvent<{student:string;reference:string;options:MathVerificationOptions}>)=>{self.postMessage(await verifyMathCore(e.data.student,e.data.reference,e.data.options));};
