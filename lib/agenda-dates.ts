export const agendaMonths=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
export const agendaIso=(date:Date)=>date.toISOString().slice(0,10);
export function agendaAddDays(date:Date,days:number){const result=new Date(date);result.setUTCDate(result.getUTCDate()+days);return result;}
const chileToday=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function validDay(value:unknown):value is string{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime())&&agendaIso(parsed)===value;
}
export function agendaPeriod(input:{inicio?:string;mes?:string;anio?:string}={},today=chileToday()){
  const month=Number(input.mes),year=Number(input.anio);
  const monthSelected=typeof input.mes==="string"&&/^\d{1,2}$/.test(input.mes)&&month>=1&&month<=12&&
    typeof input.anio==="string"&&/^\d{4}$/.test(input.anio)&&year>=1900&&year<=2100;
  const reference=monthSelected?`${year}-${String(month).padStart(2,"0")}-01`:validDay(input.inicio)?input.inicio:today;
  const date=new Date(`${reference}T12:00:00Z`),monday=agendaAddDays(date,-((date.getUTCDay()+6)%7));
  return {reference,monday,days:Array.from({length:7},(_,offset)=>agendaAddDays(monday,offset)),next:agendaAddDays(monday,7),
    month:date.getUTCMonth()+1,year:date.getUTCFullYear(),today};
}
