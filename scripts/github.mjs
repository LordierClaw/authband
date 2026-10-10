// Uses Git's configured credential helper, never stores or prints credentials.
import {spawnSync} from 'node:child_process';
const result=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\npath=LordierClaw/authband.git\n\n',encoding:'utf8',stdio:['pipe','pipe','pipe']});
if(result.status!==0)throw new Error('GitHub credential helper unavailable');
const credentials=Object.fromEntries(result.stdout.trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
if(!credentials.password)throw new Error('GitHub credential missing');
const path=process.argv[2]||'actions/runs?per_page=3';
if(!/^(actions\/|commits\/)/.test(path))throw new Error('Only repository CI reads allowed');
const response=await fetch('https://api.github.com/repos/LordierClaw/authband/'+path,{headers:{Authorization:'Bearer '+credentials.password,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
credentials.password='';
if(!response.ok)throw new Error('GitHub CI read failed: '+response.status);
const data=await response.text();
if(path.endsWith('/logs')) console.log(data);
else {
  const value=JSON.parse(data);
  if(value.workflow_runs)console.log(JSON.stringify(value.workflow_runs.map(x=>({id:x.id,status:x.status,conclusion:x.conclusion,head_sha:x.head_sha,url:x.html_url})),null,2));
  else if(value.jobs)console.log(JSON.stringify(value.jobs.map(x=>({id:x.id,name:x.name,status:x.status,conclusion:x.conclusion,steps:x.steps})),null,2));
  else console.log(JSON.stringify(value,null,2));
}
