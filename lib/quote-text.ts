// Copy from Word and spreadsheets can contain nonprinting paragraph separators.
export function normalizeQuoteText(value:unknown){
  return String(value??"").normalize("NFC")
    .replace(/\r\n?|[\u000b\u000c\u0085\u2028\u2029]/g,"\n")
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g,"")
    .replace(/\t/g," ");
}
