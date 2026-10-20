import fs from 'node:fs/promises';
import XLSX from 'xlsx';
const url='https://archivo-estandares-derecho.floot.app/_cdn/static/2dfbb453-86c7-498d-87a9-a08101e4a66e-matriz-gab-derecho.xlsx';
const res=await fetch(url);if(!res.ok)throw Error('No se pudo descargar la matriz Excel: '+res.status);
const workbook=XLSX.read(Buffer.from(await res.arrayBuffer()),{type:'buffer'});
const trim=v=>String(v??'').replace(/\s+/g,' ').trim();
const standards=Array.from({length:18},(_,index)=>{
 const n=index+1, sheet=workbook.Sheets['E'+n];if(!sheet)throw Error('Falta hoja E'+n);
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
 const header=rows.find(row=>new RegExp('ESTÁNDAR\\s*'+n+'\\s*[.:]','i').test(String(row[1]||'')))||[];
 const title=String(header[1]||'').split('\n')[0].replace(new RegExp('^.*?ESTÁNDAR\\s*'+n+'\\s*[.:]\\s*','i'),'').trim();
 const points=[],lookup={};
 for(const row of rows){
  const raw=trim(row[0]),ml=trim(row[2]);
  if(new RegExp('^'+n+'\\.\\d+$').test(raw)){lookup[raw]={id:raw,criterion:trim(row[1]),items:[]};points.push(lookup[raw])}
  const m=ml.match(new RegExp('^('+n+'\\.\\d+\\.\\d+)\\s*[.):-]?\\s*'));
  if(m||(new RegExp('^'+n+'\\.\\d+$').test(raw)&&ml)){
   const id=m?m[1]:raw, pid=id.split('.').slice(0,2).join('.');
   if(!lookup[pid]){lookup[pid]={id:pid,criterion:'',items:[]};points.push(lookup[pid])}
   lookup[pid].items.push({id,text:m?ml.slice(m[0].length):ml,type:trim(row[3]),scope:trim(row[4]),matrix:trim(row[5]),responsible:trim(row[6]),manager:trim(row[7]),gap:trim(row[9])||trim(row[10]),action:trim(row[8])});
  }
 }
// Preserve empty requirements and normalize duplicate point headings from the source.
 const seen=new Map();
 for(const p of points){const prior=seen.get(p.id);if(prior){prior.criterion ||= p.criterion;prior.items.push(...p.items)}else seen.set(p.id,p)}
 points.splice(0,points.length,...seen.values());
 for(const p of points){if(!p.items.length)p.items.push({id:p.id,text:'Punto sin subpunto numerado en la matriz',type:'',scope:'',matrix:'',responsible:'',manager:'',gap:'',action:''})}
 return{id:n,title,points};
});
const points=standards.reduce((n,s)=>n+s.points.length,0);
const items=standards.reduce((n,s)=>n+s.points.reduce((m,p)=>m+p.items.length,0),0);
if(points!==89||items!==167)throw Error('Conteos inesperados: '+points+' puntos y '+items+' medios');
await fs.writeFile(new URL('../lib/matriz.json',import.meta.url),JSON.stringify(standards));
console.log('Matriz incorporada: 18 estándares,',points,'puntos,',items,'medios');
