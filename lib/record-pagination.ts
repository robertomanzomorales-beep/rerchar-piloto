export const recordsPerPage=100;
export function recordPage(value:unknown){
  const page=Number(value);
  return Number.isSafeInteger(page)&&page>=1&&page<=10_000?page:1;
}
export function lastRecordPage(total:number){return Math.max(1,Math.ceil(total/recordsPerPage));}
export function recordWindow(limit:number,offset:number){
  return {limit:Number.isSafeInteger(limit)?Math.max(1,Math.min(500,limit)):100,
    offset:Number.isSafeInteger(offset)?Math.max(0,Math.min(1_000_000,offset)):0};
}
