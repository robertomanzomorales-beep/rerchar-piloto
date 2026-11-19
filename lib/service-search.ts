import type {Company} from "./companies";

// Coincide con el folio visible sin convertir números grandes a Number o bigint SQL.
export function serviceSearch(input:string){
  const term=input.trim().slice(0,100),match=term.match(/^(?:(RER|EYJ|PIL)\s*-\s*)?(\d{1,20})$/i);
  const prefixes:Record<string,Company|"pendiente">={RER:"rerchar",EYJ:"e_y_j",PIL:"pendiente"};
  return {term,folio:match?match[2].replace(/^0+(?=\d)/,""):"",company:match?.[1]?prefixes[match[1].toUpperCase()]:""};
}
