export function encodeDownloadFilename(filename:string){
  return encodeURIComponent(filename).replace(/['()*]/g,character=>
    "%"+character.charCodeAt(0).toString(16).toUpperCase());
}
