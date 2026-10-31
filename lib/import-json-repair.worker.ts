import {repairJsonCore} from './import-json-repair-core';
self.onmessage=async(e:MessageEvent<string>)=>{self.postMessage(await repairJsonCore(e.data));};
