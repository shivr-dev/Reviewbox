import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('public/vendor/rdkit',{recursive:true});await mkdir('public/vendor/molstar',{recursive:true});await mkdir('public/licenses/science',{recursive:true});
for(const file of ['RDKit_minimal.js','RDKit_minimal.wasm'])await cp('node_modules/@rdkit/rdkit/dist/'+file,'public/vendor/rdkit/'+file);
await cp('node_modules/molstar/build/viewer/molstar.css','public/vendor/molstar/molstar.css');
for(const [pkg,id]of [['3dmol','3dmol'],['molstar','molstar'],['ketcher-react','ketcher'],['ketcher-standalone','ketcher-standalone'],['indigo-ketcher','indigo']]){
 for(const name of ['LICENSE','LICENSE.txt','LICENSE.md','license.txt'])try{await cp('node_modules/'+pkg+'/'+name,'public/licenses/science/'+id+'.txt');break;}catch{}
}
// MinimalLib's npm package omits the license file. Keep the core BSD notice beside its WASM.
for(const file of ['rdkit','ketcher','ketcher-NOTICE','molstar','3dmol','indigo'])await readFile('public/licenses/science/'+file+'.txt','utf8');
console.log('Science engines prepared as on-demand same-origin assets.');
