import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from '../apps/band/test/page-harness.mjs';
test('packaged native page boots offline, changes groups and stops lifecycle timers',async()=>{
  const h=await pageHarness({rpk:'artifacts/AuthBand-capability.rpk'}),{page,timers,connection,scrolled}=h;
  page.onInit();page.onReady();page.onShow();await h.flush();
  assert.equal(page.groups.length,8);assert.equal(timers.size,0);assert.equal('code' in page.groups[0].rows[0],false);
  page.detail(page.groups[0].rows[0].id);assert.equal(page.detailCode,'287\n082');page.closeDetail();
  page.changeTab({index:1});assert.equal(page.active,1);assert.equal(timers.size,0);
  page.scroll(page.groups[1].id,{scrollY:218,scrollState:1});page.detail(page.groups[1].rows[4].id);
  assert.match(page.detailCode,/^\d{4}\n\d{4}$/);assert.equal(timers.size,1);page.closeDetail();
  page.onHide();assert.equal(timers.size,0);page.onShow();await h.flush();assert.equal(timers.size,0);
  assert.equal(scrolled.filter(s=>s.id==='list-'+page.groups[1].id).at(-1)?.index,2,'returning to a group requests its stored row index');
  const shared='Tai khoan '.repeat(18),labels=[shared+'Nh\u00f3m A',shared+'Nh\u00f3m B'];
  for(const label of labels){
    const row=page.groups[1].rows[4];
    const account=page._viewer.snapshot.accounts.find(a=>a.id===row.id);
    account.issuer='D\u1ecbch v\u1ee5 '.repeat(10);account.label=label;page.detail(row.id);
    assert.ok(Array.isArray(page.detailIdentity),'detail must expose scrollable full identity rows');
    assert.equal(page.detailIdentity.filter(r=>r.kind==='issuer').map(r=>r.text).join(''),account.issuer);
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
function hasClass(node,name) {
  const value=typeof node.options.classList==='function'?node.options.classList():node.options.classList;
  return value?.includes(name);
}

test('compiled template preloads adjacent metadata lists and exposes code only after a row tap',async()=>{
  const h=await pageHarness({rpk:'artifacts/AuthBand-capability.rpk'}),{page}=h;
  page.onInit();page.onReady();page.onShow();await h.flush();
  let nodes=flatten(h.render());
  assert.equal(nodes.filter(n=>n.type==='list').length,2,'initial and next tab are ready before swiping');
  assert.equal(nodes.filter(n=>n.type==='list-item').length,14,'not all 50 account rows');
  assert.equal(nodes.some(n=>hasClass(n,'code')),false);assert.equal(h.timers.size,0);
  const groups=page.groups;
  const swiper=nodes.find(n=>n.type==='swiper');swiper.options.events.change({index:1});
  nodes=flatten(h.render());
  const lists=nodes.filter(n=>n.type==='list'),list=lists[1];list.options.events.scroll({scrollY:218,scrollState:1});
  assert.equal(page._viewer.preferences().positions[page.groups[1].id],2);
  assert.equal(lists.length,3);
  list.children.flat(Infinity).find(n=>n.type==='list-item').options.events.click();
  assert.equal(page.mode,'detail');assert.match(page.detailCode,/^\d{4}\n\d{4}$/);assert.equal(h.timers.size,1);
  for(let second=31;second<60;second++){h.at(second*1000);h.tick();}
  assert.equal(page.groups,groups);
  nodes=flatten(h.render());assert.ok(nodes.find(n=>hasClass(n,'detail-code')));
  nodes.find(n=>hasClass(n,'back')).options.events.click();
  assert.equal(page.mode,'list');assert.equal(h.timers.size,0);nodes=flatten(h.render());
  const header=nodes.find(n=>hasClass(n,'header'));
  assert.ok(header,'a non-tab swipe exit area must be compiled');
  header.options.events.swipe({direction:'left'});
  assert.equal(h.exits,1);assert.equal(h.timers.size,0);page.onDestroy();
});
