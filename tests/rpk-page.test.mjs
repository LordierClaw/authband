import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from '../apps/band/test/page-harness.mjs';
const rpk='artifacts/AuthBand-capability.rpk';

function flatten(node) {
  if(Array.isArray(node))return node.flatMap(flatten);
  if(node.options.show&&node.options.show()===false)return [];
  return [node,...flatten(node.children||[])];
}
const value=x=>typeof x==='function'?x():x;
function hasClass(node,name) {return (value(node.options.classList)||[]).includes(name);}
function style(page,node) {
  const classes=value(node.options.classList)||[];
  return Object.assign({},...page.style.filter(([selectors])=>selectors.some(selector=>selector.length===2&&selector[0]===0&&classes.includes(selector[1]))).map(([,rules])=>rules));
}

test('compiled list page: skeleton, one screenful, then every group as one vertical list',async()=>{
  const h=await pageHarness({rpk,deferReads:true}),{page}=h;
  page.onInit();page.onReady();
  let nodes=flatten(h.render());
  assert.equal(nodes.filter(n=>hasClass(n,'bone-row')).length,5);assert.equal(nodes.some(n=>n.type==='list'),false);
  h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();
  nodes=flatten(h.render());
  assert.equal(nodes.filter(n=>n.type==='list').length,1);
  assert.equal(nodes.filter(n=>n.type==='list-item').length,12,'title, ten items, bottom spacer');
  await h.settle();nodes=flatten(h.render());
  assert.equal(nodes.filter(n=>hasClass(n,'row')).length,50);assert.equal(nodes.filter(n=>hasClass(n,'head')).length,8);
  assert.equal(nodes.some(n=>['swiper','image','input'].includes(n.type)),false,'no swiper, buttons or icons');
  const row=nodes.find(n=>hasClass(n,'row'));
  assert.equal(row.options.events.click,undefined,'rows decide tap versus swipe from touch start/end');
  assert.equal(style(page,nodes[0]).width,'212px');
  page.onDestroy();
});

test('compiled list page: a row tap pushes the code page and a swipe does not',async()=>{
  const h=await pageHarness({rpk}),{page}=h;page.onInit();page.onReady();await h.flush();await h.settle();
  const row=flatten(h.render()).find(n=>hasClass(n,'row'));
  row.options.events.touchstart({touches:[{clientX:30,clientY:200}]});row.options.events.touchend({changedTouches:[{clientX:180,clientY:200}]});
  assert.deepEqual(h.app.pushes,[]);
  row.options.events.touchstart({touches:[{clientX:100,clientY:200}]});row.options.events.touchend({changedTouches:[{clientX:101,clientY:201}]});
  assert.deepEqual(h.app.pushes,['pages/code']);assert.equal(h.shared.selected,page.items.find(i=>i.kind==='row').id);
  page.onDestroy();
});

test('compiled code page keeps both digit groups on one line at a readable size',async()=>{
  const fixture=(await import('../apps/band/scripts/capability-fixture.mjs')).capabilityFixture();
  for(const index of [0,1]) {
    const h=await pageHarness({rpk,page:'code',shared:{snapshot:fixture,time:{offset:0,uncertainty:0,wallMs:30000},selected:fixture.accounts[index].id,idleDeadline:330000}}),{page}=h;
    page.onInit();const nodes=flatten(h.render());
    const block=nodes.find(n=>hasClass(n,'code')),parts=nodes.filter(n=>hasClass(n,'part'));
    assert.equal(style(page,block).flexDirection,'row');assert.equal(parts.length,2);
    assert.match(parts.map(n=>value(n.options.value)).join(' '),index===0?/^\d{3} \d{3}$/:/^\d{4} \d{4}$/);
    const width=parts.reduce((sum,n)=>sum+parseFloat(style(page,n).width),0)+parseFloat(style(page,nodes.find(n=>hasClass(n,'gap'))).width);
    assert.ok(width<=parseFloat(style(page,block).width));
    for(const part of parts){const rules=style(page,part);assert.equal(rules.lines,1);assert.ok(parseFloat(rules.lineHeight)>=parseFloat(rules.fontSize)*1.5);}
    assert.equal(nodes.find(n=>n.type==='progress').options.percent(),100);
    assert.equal(nodes.some(n=>['image','input'].includes(n.type)),false);
    page.onDestroy();assert.equal(h.timers.size,0);
  }
});
