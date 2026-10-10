import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=readdirSync('apps/band/test').filter(x=>x.endsWith('.test.mjs')).map(x=>'apps/band/test/'+x);
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
