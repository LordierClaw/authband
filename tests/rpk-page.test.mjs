import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from '../apps/band/test/page-harness.mjs';
test('packaged page adapter boots offline, changes groups and stops lifecycle timers',async()=>{
  const h=await pageHarness({rpk:'artifacts/AuthBand-capability.rpk'}),{page,connection,scrolled}=h;
  page.onInit();page.onReady();page.onShow();await h.flush();
  assert.equal(page.groups.length,8);assert.equal(h.workTimers.size,0);assert.equal('code' in page.groups[0].rows[0],false);
  page.detail(page.groups[0].rows[0].id);assert.equal(page.detailCode,'287 082');page.closeDetail();
  page.changeTab({index:1});assert.equal(page.active,1);assert.equal(h.workTimers.size,0);
  page.scroll(page.groups[1].id,{scrollY:218,scrollState:1});page.detail(page.groups[1].rows[4].id);
  assert.match(page.detailCode,/^\d{4} \d{4}$/);assert.equal(h.workTimers.size,1);page.closeDetail();
  page.onHide();assert.equal(h.workTimers.size,0);page.onShow();await h.flush();assert.equal(h.workTimers.size,0);
  assert.equal(scrolled.filter(s=>s.id==='list-'+page.groups[1].id).at(-1)?.index,2,'returning to a group requests its stored row index');
  const shared='Tai khoan '.repeat(18),labels=[shared+'Nh\u00f3m A',shared+'Nh\u00f3m B'];
  for(const label of labels){
    const row=page.groups[1].rows[4];
    const account=page._viewer.snapshot.accounts.find(a=>a.id===row.id);
    account.issuer='D\u1ecbch v\u1ee5 '.repeat(10);account.label=label;page.detail(row.id);
    const identities=flatten(h.render()).filter(n=>hasClass(n,'detail-issuer')||hasClass(n,'detail-label')).map(n=>n.options.value());
    assert.deepEqual(identities,[account.issuer,label],'native single-line identity receives full text, not arbitrary chunks');
    page.closeDetail();
  }
  page.onDestroy();assert.equal(h.workTimers.size,0);assert.equal(connection.onmessage,null);
});

function flatten(node) {
  if(Array.isArray(node))return node.flatMap(flatten);
  if(node.options.show&&node.options.show()===false)return [];
  return [node,...flatten(node.children||[])];
}
function hasClass(node,name) {
  const value=typeof node.options.classList==='function'?node.options.classList():node.options.classList;
  return value?.includes(name);
}

test('compiled template retains all bounded metadata lists and exposes code only after a row tap',async()=>{
  const h=await pageHarness({rpk:'artifacts/AuthBand-capability.rpk'}),{page}=h;
  page.onInit();page.onReady();page.onShow();await h.flush();
  let nodes=flatten(h.render());
  assert.equal(nodes.filter(n=>n.type==='list').length,8);
  assert.equal(nodes.filter(n=>n.type==='list-item').length,50);
  assert.equal(nodes.some(n=>hasClass(n,'code')),false);assert.equal(h.workTimers.size,0);
  const groups=page.groups;
  const swiper=nodes.find(n=>n.type==='swiper');
  assert.equal(swiper.options.events.swipestart,undefined,'native clicks must not depend on a paired animation-end event');
  swiper.options.events.change({index:2});
  nodes=flatten(h.render());
  const lists=nodes.filter(n=>n.type==='list'),list=lists[1];list.options.events.scroll({scrollY:218,scrollState:1});
  assert.equal(page._viewer.preferences().positions[page.groups[1].id],2);
  assert.equal(lists.length,8);
  list.children.flat(Infinity).find(n=>n.type==='list-item').options.events.click();
  assert.equal(page.mode,'detail');assert.match(page.detailCode,/^\d{4} \d{4}$/);assert.equal(h.workTimers.size,1);
  for(let second=31;second<60;second++){h.at(second*1000);h.tick();}
  assert.equal(page.groups,groups);
  nodes=flatten(h.render());assert.ok(nodes.find(n=>hasClass(n,'detail-code')));
  assert.equal(nodes.filter(n=>n.type==='input').length,0,'detail uses platform back, not redundant buttons');
  assert.equal(nodes.some(n=>n.options.value&&value(n.options.value)==='RFC TEST'),false);
  page.onBackPress();
  assert.equal(page.mode,'list');assert.equal(h.workTimers.size,0);nodes=flatten(h.render());
  assert.equal(nodes.some(n=>n.type==='image'||n.type==='input'),false);
  h.at(61000);page.changeTab({index:0});
  swiper.options.events.change({index:0});
  assert.equal(h.exits,1);assert.equal(h.timers.size,0);page.onDestroy();
});

const value=x=>typeof x==='function'?x():x;
function style(page,node) {
  const classes=value(node.options.classList)||[];
  return Object.assign({},...page.style.filter(([selectors])=>selectors.some(selector=>selector.length===2&&selector[0]===0&&classes.includes(selector[1]))).map(([,rules])=>rules));
}

test('compiled layout has no function buttons and keeps the code groups close on one line',async()=>{
  const h=await pageHarness({rpk:'artifacts/AuthBand-capability.rpk'}),{page}=h;
  page.onInit();page.onReady();await h.flush();
  let nodes=flatten(h.render()),swiper=nodes.find(n=>n.type==='swiper');
  const surface=style(page,nodes[0]),swipe=style(page,swiper);
  assert.equal(nodes[0].type,'stack','retained screens must overlap, not occupy horizontal sibling slots');
  assert.equal(swipe.width,surface.width);
  assert.equal(nodes.filter(n=>n.type==='image').length,0);
  assert.equal(nodes.filter(n=>n.type==='input').length,0);
  for(const index of [0,1]) {
    page.changeTab({index});page.detail(page.groups[index].rows[0].id);nodes=flatten(h.render());
    const block=nodes.find(n=>hasClass(n,'detail-code')),parts=nodes.filter(n=>hasClass(n,'code-part'));
    assert.equal(style(page,block).flexDirection,'row');assert.equal(parts.length,2);
    assert.match(parts.map(n=>value(n.options.value)).join(' '),index===0?/^\d{3} \d{3}$/:/^\d{4} \d{4}$/);
    for(const part of parts) {
      const rules=style(page,part);
      assert.equal(rules.lines,1);assert.ok(parseFloat(rules.height)>=parseFloat(rules.lineHeight));
      assert.ok(parseFloat(rules.lineHeight)>=parseFloat(rules.fontSize)*1.5,'allow native font ascent/descent instead of clipping a second line');
    }
    const width=parts.reduce((sum,n)=>sum+parseFloat(style(page,n).width),0)+parseFloat(style(page,nodes.find(n=>hasClass(n,'code-gap'))).width);
    assert.ok(width<=parseFloat(style(page,block).width));
    assert.ok(width<=148,'remove excess whitespace between OTP groups');
    assert.equal(nodes.find(n=>n.type==='progress').options.percent(),100);
    page.closeDetail();
  }
  page.onDestroy();
});

test('compiled cold-start surface has an identity before native vault reads complete',async()=>{
  const h=await pageHarness({rpk:'artifacts/AuthBand-capability.rpk',deferReads:true}),{page}=h;
  page.onInit();page.onReady();
  assert.ok(flatten(h.render()).some(n=>n.type==='text'&&value(n.options.value)==='AuthBand'));
  page.exit();page.onDestroy();
});
