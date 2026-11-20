type ModuleDestination = {text:string;group:string};

const searchable=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es-CL");

function matchesWord(content:string,word:string){
  if(content.includes(word))return true;
  // Algunos accesos usan singular: compra, proveedor e inventario.
  if(word.length>4&&word.endsWith("es")&&content.includes(word.slice(0,-2)))return true;
  return word.length>3&&word.endsWith("s")&&content.includes(word.slice(0,-1));
}

export function filterModuleDestinations<T extends ModuleDestination>(items:readonly T[],term:string):T[]{
  const words=searchable(term).trim().split(/\s+/).filter(Boolean);
  return items.filter(item=>{
    const content=searchable(`${item.text} ${item.group}`);
    return words.every(word=>matchesWord(content,word));
  }).slice(0,12);
}
