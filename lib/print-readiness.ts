export type PrintImage={complete:boolean;naturalWidth:number;decode:()=>Promise<void>};
export async function waitForPrintAssets(fontsReady:Promise<unknown>,images:PrintImage[],timeoutMs=8000){
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([Promise.all([fontsReady,...images.map(image=>image.complete&&image.naturalWidth>0?Promise.resolve():image.decode())]),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("La preparación del documento demoró demasiado. Intente nuevamente.")),timeoutMs);})]);}
  catch(error){throw new Error(error instanceof Error&&error.message.includes("demoró demasiado")?error.message:"No se pudieron cargar todos los elementos del documento. Espere un momento e intente nuevamente.");}
  finally{if(timer)clearTimeout(timer);}
}
