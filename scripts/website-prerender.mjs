import {build} from 'esbuild';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

/** The real website component, rendered at build time, stays visible before app JS loads. */
export async function websiteMarkup(){
  const root=fileURLToPath(new URL('../',import.meta.url));
  await mkdir(path.join(root,'work'),{recursive:true});
  const outfile=path.join(root,'work/website-prerender.mjs');
  await build({stdin:{contents:"import React from 'react';import {renderToString} from 'react-dom/server';import Website from './components/website-view';export default renderToString(React.createElement(Website,{navigate:()=>{}}));",resolveDir:root,loader:'tsx'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',alias:{'@':root}});
  return (await import(pathToFileURL(outfile).href+'?v='+Date.now())).default.replaceAll('src="/learning-penguin.png"','src="./learning-penguin.png"');
}
