'use client';

import {useEffect, useRef, useState} from 'react';
import {AlertCircle, FileSpreadsheet, FileText, LoaderCircle} from 'lucide-react';

type OfficeKind = 'word' | 'excel';
type SheetView = {
  name: string;
  totalRows: number;
  totalColumns: number;
  rows: string[][];
};

const MAX_PREVIEW_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 200;
const MAX_COLUMNS = 25;

export function OfficePreview({url,kind}:{url:string;kind:OfficeKind}) {
  const wordContainer = useRef<HTMLDivElement>(null);
  const wordStyles = useRef<HTMLDivElement>(null);
  const [busy,setBusy] = useState(true);
  const [error,setError] = useState('');
  const [sheets,setSheets] = useState<SheetView[]>([]);
  const [activeSheet,setActiveSheet] = useState(0);

  useEffect(()=>{
    const controller = new AbortController();
    let active = true;
    setBusy(true);
    setError('');
    setSheets([]);
    setActiveSheet(0);
    if(wordContainer.current) wordContainer.current.replaceChildren();
    if(wordStyles.current) wordStyles.current.replaceChildren();

    async function renderFile(){
      try {
        // El archivo privado se obtiene con la URL temporal emitida por Supabase.
        // El procesamiento de Word y Excel se realiza en el navegador del usuario.
        const response = await fetch(url,{signal:controller.signal,cache:'no-store'});
        if(!response.ok) throw new Error('No se pudo leer el archivo almacenado.');
        const advertisedSize = Number(response.headers.get('content-length')||0);
        if(advertisedSize > MAX_PREVIEW_BYTES) {
          throw new Error('El archivo es demasiado grande para la vista previa. Descárgalo para abrirlo.');
        }
        const data = await response.arrayBuffer();
        if(!active) return;
        if(data.byteLength > MAX_PREVIEW_BYTES) {
          throw new Error('El archivo es demasiado grande para la vista previa. Descárgalo para abrirlo.');
        }

        if(kind==='word'){
          const {renderAsync} = await import('docx-preview');
          if(!active || !wordContainer.current) return;
          await renderAsync(data,wordContainer.current,wordStyles.current||undefined,{
            // No interpretar fragmentos HTML externos embebidos en documentos no confiables.
            renderAltChunks:false,
            renderComments:false,
            breakPages:true,
            ignoreWidth:false,
            ignoreHeight:false,
          });
        } else {
          const excel = await import('exceljs');
          if(!active)return;
          const workbook = new excel.Workbook();
          await workbook.xlsx.load(data as unknown as Buffer);
          if(!active)return;
          const parsed:SheetView[] = workbook.worksheets.map(sheet=>{
            const totalRows=sheet.rowCount;
            const totalColumns=sheet.columnCount;
            const rowsCount=Math.min(MAX_ROWS,totalRows);
            const columnsCount=Math.min(MAX_COLUMNS,Math.max(totalColumns,1));
            const rows:string[][]=[];
            for(let row=1;row<=rowsCount;row++){
              const values:string[]=[];
              for(let column=1;column<=columnsCount;column++){
                // El contenido se muestra solo como texto, nunca se ejecutan fórmulas.
                values.push(sheet.getRow(row).getCell(column).text??'');
              }
              rows.push(values);
            }
            return {name:sheet.name,totalRows,totalColumns,rows};
          });
          if(!parsed.length) throw new Error('El archivo no contiene hojas visibles.');
          setSheets(parsed);
        }
      }catch(reason){
        if(!active || controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'No se pudo generar la vista previa.');
      }finally{
        if(active)setBusy(false);
      }
    }
    void renderFile();
    return ()=>{
      active=false;
      controller.abort();
      wordContainer.current?.replaceChildren();
      wordStyles.current?.replaceChildren();
    };
  },[url,kind]);

  const sheet=sheets[activeSheet];
  return (
    <div className="office-preview">
      {busy && (
        <div className="office-preview-status" role="status">
          <LoaderCircle size={24} className="office-preview-spinner"/>
          <strong>Preparando vista previa…</strong>
          <span>{kind==='word'?'Organizando las páginas de Word.':'Leyendo las hojas de Excel.'}</span>
        </div>
      )}
      {error && (
        <div className="office-preview-status is-error" role="alert">
          <AlertCircle size={24}/>
          <strong>No se pudo mostrar este archivo</strong>
          <span>{error}</span>
          <small>Puedes descargar el documento original con el botón inferior.</small>
        </div>
      )}
      {kind==='word' && !error && (
        <div className="office-word-viewport" style={{display:busy?'none':undefined}}>
          <div ref={wordStyles}/>
          <div ref={wordContainer} className="office-word-pages"/>
        </div>
      )}
      {kind==='excel' && !error && !busy && sheet && (
        <div className="office-excel">
          <div className="office-sheet-tabs" role="tablist" aria-label="Hojas del archivo">
            {sheets.map((value,index)=>(
              <button type="button" role="tab" key={index}
                aria-selected={index===activeSheet}
                className={index===activeSheet?'is-active':''}
                onClick={()=>setActiveSheet(index)}>{value.name}</button>
            ))}
          </div>
          <div className="office-sheet-info"><FileSpreadsheet size={16}/>
            <span>{sheet.totalRows} filas · {sheet.totalColumns} columnas</span>
            {(sheet.totalRows>MAX_ROWS || sheet.totalColumns>MAX_COLUMNS) && (
              <span>Vista limitada a {MAX_ROWS} filas y {MAX_COLUMNS} columnas. Descarga el original para ver todo.</span>
            )}
          </div>
          <div className="office-excel-scroll" role="region" tabIndex={0} aria-label={`Vista previa de hoja ${sheet.name}`}>
            <table className="office-excel-table">
              <thead><tr><th aria-label="Número de fila">#</th>
                {(sheet.rows[0]||[]).map((_,i)=><th key={i}>{columnLabel(i+1)}</th>)}
              </tr></thead>
              <tbody>{sheet.rows.map((values,row)=>(
                <tr key={row}><th scope="row">{row+1}</th>
                  {values.map((value,col)=><td key={col} title={value}>{value}</td>)}
                </tr>
              ))}</tbody>
            </table>
            {!sheet.rows.length && <div className="office-preview-status"><FileText size={22}/>Esta hoja está vacía.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function columnLabel(n:number){
  let label='';
  while(n>0){
    n--;
    label=String.fromCharCode(65+n%26)+label;
    n=Math.floor(n/26);
  }
  return label;
}
