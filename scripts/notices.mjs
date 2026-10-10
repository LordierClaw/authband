import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
export async function bandNotices() {
  const chunks=['AuthBand third-party runtime notices\n'];
  for(const name of (await readdir('node_modules/@stablelib')).sort()) {
    chunks.push('\n@stablelib/'+name+'\n'+await readFile('node_modules/@stablelib/'+name+'/LICENSE','utf8'));
  }
  chunks.push('\njsSHA\n'+await readFile('node_modules/jssha/LICENSE','utf8'));
  await mkdir('apps/band/src/common',{recursive:true});
  await writeFile('apps/band/src/common/THIRD_PARTY_LICENSES.txt',chunks.join('\n'));
}
