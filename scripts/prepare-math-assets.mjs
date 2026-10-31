import {cp,mkdir} from 'node:fs/promises';
await mkdir('public/vendor/mathlive',{recursive:true});
await cp('node_modules/mathlive/fonts','public/vendor/mathlive/fonts',{recursive:true});
await mkdir('public/licenses',{recursive:true});
for(const [pkg,name]of [['mathlive','mathlive-MIT'],['@cortex-js/compute-engine','compute-engine-MIT'],['jsonrepair','jsonrepair-ISC']]){
 try{await cp('node_modules/'+pkg+'/LICENSE','public/licenses/'+name+'.txt');}catch{try{await cp('node_modules/'+pkg+'/LICENSE.txt','public/licenses/'+name+'.txt');}catch{try{await cp('node_modules/'+pkg+'/LICENSE.md','public/licenses/'+name+'.txt');}catch{console.warn('License path needs review:',pkg);}}}
}
console.log('MathLive fonts prepared for local deployment.');
