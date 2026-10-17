// Swiper pages for the group tabs, in group order. Every page is static: at most
// `perPage` rows and no nested scroller, like the horizontal pagers in other band
// apps. A larger group continues on the next page ("1/2", "2/2"). An empty group
// keeps one page. Pages carry display metadata only, never secrets. `mounted`
// controls whether the rows exist yet; the caller decides which pages start mounted.
export function groupPages(snapshot,perPage=6) {
  const groups=snapshot.groups.slice().sort((a,b)=>a.order-b.order),byGroup=Object.create(null),pages=[];
  for(const group of groups)byGroup[group.id.toLowerCase()]=[];
  for(const account of snapshot.accounts){const list=byGroup[account.groupID.toLowerCase()];if(list)list.push(account);}
  for(const group of groups) {
    const rows=byGroup[group.id.toLowerCase()].sort((a,b)=>a.order-b.order).map(a=>({id:a.id,title:a.issuer||a.label,sub:a.issuer?a.label:''}));
    const count=Math.max(1,Math.ceil(rows.length/perPage));
    for(let i=0;i<count;i++)pages.push({id:group.id+':'+i,groupID:group.id,name:group.name,part:count>1?(i+1)+'/'+count:'',mounted:false,rows:rows.slice(i*perPage,(i+1)*perPage)});
  }
  return pages;
}
