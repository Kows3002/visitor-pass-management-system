const AppError=require('./appError');
const parseDateParts=value=>{const match=String(value||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)throw new AppError('Date is invalid',422,'INVALID_DATE');const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),0,0,0,0);if(date.getFullYear()!==Number(match[1])||date.getMonth()!==Number(match[2])-1||date.getDate()!==Number(match[3]))throw new AppError('Date is invalid',422,'INVALID_DATE');return date};
const localDateKey=(value=new Date())=>{const date=new Date(value);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`};
const localDayRange=value=>{const start=value?parseDateParts(value):parseDateParts(localDateKey());const end=new Date(start);end.setDate(end.getDate()+1);return{start,end}};
const queryDateRange=(from,to)=>{const range={};if(from)range.$gte=parseDateParts(from);if(to)range.$lt=localDayRange(to).end;return range};
module.exports={localDateKey,localDayRange,queryDateRange};
