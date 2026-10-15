// One vertical list: a header per non-empty group, then its accounts in order.
// Items carry display metadata only, never secrets.
export function listItems(snapshot) {
  const groups=snapshot.groups.slice().sort((a,b)=>a.order-b.order),byGroup=Object.create(null),items=[];
  for(const group of groups)byGroup[group.id.toLowerCase()]=[];
  for(const account of snapshot.accounts){const list=byGroup[account.groupID.toLowerCase()];if(list)list.push(account);}
  for(const group of groups) {
    const accounts=byGroup[group.id.toLowerCase()];
    if(accounts.length===0)continue;
    accounts.sort((a,b)=>a.order-b.order);
    items.push({id:'g-'+group.id,kind:'head',title:group.name,sub:''});
    for(const a of accounts)items.push({id:a.id,kind:'row',title:a.issuer||a.label,sub:a.issuer?a.label:''});
  }
  return items;
}
