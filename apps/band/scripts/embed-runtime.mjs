import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
export async function bundleRuntime() {
  const result = await build({entryPoints:[fileURLToPath(new URL('../src/logic/runtime.js',import.meta.url))],bundle:true,write:false,format:'iife',globalName:'AuthBand',platform:'browser',target:'es2015',legalComments:'inline',minify:true});
  return result.outputFiles[0].text;
}
