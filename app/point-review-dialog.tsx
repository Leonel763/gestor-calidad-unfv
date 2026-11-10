'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {Check, CheckCheck, CheckCircle2, ClipboardCheck, Save, X} from 'lucide-react';

type ReviewPoint = {id:string; criterion:string};

type Props = {
  standardId:number;
  standardTitle:string;
  points:ReviewPoint[];
  savedIds:string[];
  onSave:(ids:string[])=>void;
  onClose:()=>void;
};

export function PointReviewDialog({standardId,standardTitle,points,savedIds,onSave,onClose}:Props){
  const allowedIds=useMemo(()=>new Set(points.map(point=>point.id)),[points]);
  const [checked,setChecked]=useState<string[]>(()=>savedIds.filter(id=>allowedIds.has(id)));
  const cancelRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  const onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;

  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    cancelRef.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onCloseRef.current();}
      if(event.key==='Tab' && dialogRef.current){
        const focusable=[...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')]
          .filter(el=>el.getClientRects().length>0);
        if(!focusable.length)return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',onKey);
    return ()=>{
      document.removeEventListener('keydown',onKey);
      document.body.style.overflow=previousOverflow;
      previous?.focus();
    };
  },[]);

  const count=checked.length;
  const total=points.length;
  const percent=total>0?Math.round(count/total*100):0;
  const status=count===0?'Sin revisar':count===total?'Revisado completo':'En revisión';
  const statusClass=count===0?'empty':count===total?'done':'partial';

  function toggle(id:string){
    setChecked(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);
  }
  function toggleAll(){
    setChecked(current=>current.length===total?[]:points.map(p=>p.id));
  }

  return (
    <div className="point-review-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="point-review-dialog" ref={dialogRef}
        role="dialog" aria-modal="true" aria-labelledby="point-review-title" aria-describedby="point-review-description">
        <div className="point-review-header">
          <span className="point-review-heading-icon"><ClipboardCheck size={25}/></span>
          <div className="point-review-heading-copy">
            <h2 id="point-review-title">Mi revisión</h2>
            <p id="point-review-description">Marca los puntos del estándar E{String(standardId).padStart(2,'0')} que ya revisaste.</p>
          </div>
          <button className="point-review-close" type="button" aria-label="Cerrar revisión" onClick={onClose}><X size={21}/></button>
        </div>

        <div className="point-review-statbar">
          <span className={'point-review-state is-'+statusClass}>
            <CheckCircle2 size={16}/>{status}
          </span>
          <span className="point-review-count"><strong>{count}/{total}</strong><small>Puntos revisados</small></span>
          <span className="point-review-percent"><strong>{percent}%</strong><small>Mi avance</small></span>
        </div>

        <div className="point-review-scroll">
          {points.length>0 ? points.map(p=>(
            <label className={'point-review-choice'+(checked.includes(p.id)?' is-checked':'')} key={p.id}>
              <input type="checkbox" checked={checked.includes(p.id)} onChange={()=>toggle(p.id)}/>
              <span className="point-review-custom-check" aria-hidden="true">{checked.includes(p.id)&&<Check size={17}/>}</span>
              <span className="point-review-choice-copy">
                <strong>Punto {p.id}</strong>
                <small>{p.criterion}</small>
              </span>
            </label>
          )):(
            <p className="point-review-empty">Este estándar no tiene puntos activos para revisar.</p>
          )}
        </div>

        <div className="point-review-footer">
          <p className="point-review-footnote">Versión preliminar: los checks se guardan por cuenta en este navegador. No cambian el estado de las evidencias.</p>
          <div className="point-review-buttons">
            <button ref={cancelRef} className="point-review-cancel" type="button" onClick={onClose}>Cancelar</button>
            <button className="point-review-all" type="button" disabled={!total} onClick={toggleAll}>
              <CheckCheck size={18}/>{count===total?'Desmarcar todo':'Marcar todo'}
            </button>
            <button className="point-review-save" type="button" onClick={()=>onSave(checked)} disabled={!total}>
              <Save size={17}/> Guardar revisión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
