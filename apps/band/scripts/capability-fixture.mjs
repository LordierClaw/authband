export function capabilityFixture() {
  const uuid=n=>'00000000-0000-4000-8000-0000000000'+String(n).padStart(2,'0');
  const names=['Cá nhân','Công việc','Email','Tài chính','Lưu trữ','Máy chủ','Dự phòng','Kiểm thử'];
  const groups=names.map((name,i)=>({id:uuid(i+2),name,order:i,isDefault:i===0}));
  const accounts=Array.from({length:50},(_,i)=>({id:uuid(i+20),issuer:i===0?'RFC 6238':'RFC '+(i+1),label:i===1?'Tài khoản tiếng Việt rất dài để kiểm tra':'public-fixture-'+(i+1),secret:'MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=',parameters:{algorithm:'sha1',digits:i%2?8:6,period:30},groupID:groups[i%8].id,order:i,onBand:true}));
  return {schema:1,vaultID:uuid(1),revision:'1',groups,accounts};
}
