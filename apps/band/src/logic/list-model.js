// One page per group, in group order, with its accounts in order. Pages carry
// display metadata only, never secrets. `mounted` controls whether the page's
// native list exists yet; the caller decides which pages start mounted.
export function groupPages(snapshot) {
  const groups=snapshot.groups.slice().sort((a,b)=>a.order-b.order),byGroup=Object.create(null);
  for(const group of groups)byGroup[group.id.toLowerCase()]=[];
  for(const account of snapshot.accounts){const list=byGroup[account.groupID.toLowerCase()];if(list)list.push(account);}
  return groups.map(group=>({
    id:group.id,name:group.name,mounted:false,
    rows:byGroup[group.id.toLowerCase()].sort((a,b)=>a.order-b.order).map(a=>({id:a.id,title:a.issuer||a.label,sub:a.issuer?a.label:''}))
  }));
}
