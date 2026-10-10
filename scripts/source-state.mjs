import {spawnSync} from 'node:child_process';
export function sourceState() {
  const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
  const status=spawnSync('git',['status','--porcelain'],{encoding:'utf8'});
  if(head.status!==0 || status.status!==0 || !/^[0-9a-f]{40}$/.test(head.stdout.trim()))throw new Error('Build requires a Git source revision');
  return {sourceCommit:head.stdout.trim(),dirty:status.stdout.trim().length>0};
}
