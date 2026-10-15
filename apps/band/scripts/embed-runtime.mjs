import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
// One bundle per page: 'list' (startup path) or 'code' (TOTP view).
export async function bundleRuntime(page='list') {
  if(!['list','code'].includes(page))throw new Error('Unknown runtime');
  const result = await build({entryPoints:[fileURLToPath(new URL('../src/logic/runtime-'+page+'.js',import.meta.url))],bundle:true,write:false,format:'iife',globalName:'AuthBand',platform:'browser',target:'es2015',legalComments:'inline',minify:true});
  return result.outputFiles[0].text;
}
