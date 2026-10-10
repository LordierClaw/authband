import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from '../apps/band/test/page-harness.mjs';
test('packaged native page boots offline, changes groups and stops lifecycle timers',async()=>{
  const h=await pageHarness({rpk:'artifacts/AuthBand-capability.rpk'}),{page,timers,connection,scrolled}=h;
  page.onInit();page.onReady();page.onShow();await h.flush();
  assert.equal(page.groups.length,8);assert.match(page.groups[0].rows[0].code,/^\d{3} \d{3}$/);
  page.changeTab({index:1});assert.equal(page.active,1);assert.match(page.groups[1].rows[0].code,/^\d{4} \d{4}$/);
  page.scroll(page.groups[1].id,{scrollY:544,scrollState:1});assert.match(page.groups[1].rows[4].code,/^\d{4} \d{4}$/);
  assert.equal(timers.size,1);page.onHide();assert.equal(timers.size,0);page.onShow();await h.flush();assert.equal(timers.size,1);
  assert.equal(scrolled.at(-1)?.index,4,'native list must restore the same viewport used to compute codes');
  const shared='Tai khoan '.repeat(18),labels=[shared+'Nh\u00f3m A',shared+'Nh\u00f3m B'];
  for(const label of labels){
    const row=page.groups[1].rows[4];
    row.issuer='D\u1ecbch v\u1ee5 '.repeat(10);row.label=label;page.detail(row.id);
    assert.ok(Array.isArray(page.detailIdentity),'detail must expose scrollable full identity rows');
    assert.equal(page.detailIdentity.filter(r=>r.kind==='issuer').map(r=>r.text).join(''),row.issuer);
    assert.equal(page.detailIdentity.filter(r=>r.kind==='label').map(r=>r.text).join(''),label);
    assert.ok(page.detailIdentity.every(r=>Array.from(r.text).length<=8),'each row fits the narrow band');
    page.closeDetail();
  }
  page.onDestroy();assert.equal(timers.size,0);assert.equal(connection.onmessage,null);
});

function flatten(node) {
  if(Array.isArray(node))return node.flatMap(flatten);
  return [node,...flatten(node.children||[])];
}

test('compiled template mounts only one account list and binds scrolling/exit to the correct controls',async()=>{
  const h=await pageHarness({rpk:'artifacts/AuthBand-capability.rpk'}),{page}=h;
  page.onInit();page.onReady();page.onShow();await h.flush();
  let nodes=flatten(h.render());
  assert.equal(nodes.filter(n=>n.type==='list').length,1,'inactive swiper tabs must not mount lists');
  assert.equal(nodes.filter(n=>n.type==='list-item').length,7,'not all 50 account rows');
  const groups=page.groups;
  const swiper=nodes.find(n=>n.type==='swiper');swiper.options.events.change({index:1});
  nodes=flatten(h.render());
  const list=nodes.find(n=>n.type==='list');list.options.events.scroll({scrollY:544,scrollState:1});
  assert.equal(page._viewer.preferences().positions[page.groups[1].id],4);
  assert.equal(nodes.filter(n=>n.type==='list').length,1);
  for(let second=31;second<60;second++){h.at(second*1000);h.tick();}
  assert.equal(page.groups,groups);
  const header=nodes.find(n=>n.options.classList?.includes('header'));
  assert.ok(header,'a non-tab swipe exit area must be compiled');
  header.options.events.swipe({direction:'left'});
  assert.equal(h.exits,1);assert.equal(h.timers.size,0);page.onDestroy();
});
