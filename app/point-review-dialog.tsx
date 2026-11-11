'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,CheckCheck,CheckCircle2,ChevronDown,ClipboardCheck,Save,Search,X} from 'lucide-react';

type ReviewMedium={id:string;text:string};
type ReviewPoint={id:string;criterion:string;media:ReviewMedium[]};
type TeamReview={medium_id:string;reviewer_id:string;reviewer_name:string;reviewed_at:string};
type Props={
  standardId:number;standardTitle:string;points:ReviewPoint[];savedIds:string[];
  onSave:(ids:string[])=>void;onClose:()=>void;saving:boolean;
  teamReviews:TeamReview[];currentUserId:string;
};

export function PointReviewDialog({standardId,standardTitle,points,savedIds,onSave,onClose,saving,teamReviews,currentUserId}:Props){
  const allowed=useMemo(()=>new Set(points.flatMap(point=>point.media.map(media=>media.id))),[points]);
  const saved=useMemo(()=>savedIds.filter(id=>allowed.has(id)),[savedIds,allowed]);
  const [checked,setChecked]=useState<string[]>(()=>saved);
  const [search,setSearch]=useState('');
  const [unreviewedOnly,setUnreviewedOnly]=useState(false);
  const [expanded,setExpanded]=useState<string[]>(()=>points.map(point=>point.id));
  const closeRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  const onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;
  const savingRef=useRef(saving);
  savingRef.current=saving;
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeRef.current?.focus();
    function handleKey(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();if(!savingRef.current)onCloseRef.current();}
      if(event.key==='Tab'&&dialogRef.current){
        const focusable=[...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')]
          .filter(el=>el.getClientRects().length>0);
        if(!focusable.length)return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }
    document.addEventListener('keydown',handleKey);
    return ()=>{document.removeEventListener('keydown',handleKey);document.body.style.overflow=overflow;previous?.focus();};
  },[]);

  const total=allowed.size;
  const count=checked.filter(id=>allowed.has(id)).length;
  const percent=total?Math.round(count/total*100):0;
  const changed=[...checked].sort().join('|')!==[...saved].sort().join('|');
  const needle=search.trim().toLocaleLowerCase('es');
  const visiblePoints=points.map(point=>{
    const matchesPoint=`${point.id} ${point.criterion}`.toLocaleLowerCase('es').includes(needle);
    const media=point.media.filter(m=>(!unreviewedOnly||!checked.includes(m.id))&&
      (!needle||matchesPoint||`${m.id} ${m.text}`.toLocaleLowerCase('es').includes(needle)));
    return {...point,media};
  }).filter(point=>point.media.length>0);
  const filteredCount=visiblePoints.reduce((n,point)=>n+point.media.length,0);
  function toggle(id:string){setChecked(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);}
  function toggleAll(){setChecked(current=>current.length===total?[]:[...allowed]);}
  function toggleExpanded(id:string){setExpanded(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);}

  return <div className="point-review-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)onClose();}}>
    <div className="point-review-dialog" ref={dialogRef} role="dialog" aria-modal="true"
      aria-labelledby="point-review-title" aria-describedby="point-review-description">
      <div className="point-review-header">
        <span className="point-review-heading-icon"><ClipboardCheck size={25}/></span>
        <div className="point-review-heading-copy">
          <h2 id="point-review-title">Mi revisión</h2>
          <p id="point-review-description">Revisa individualmente cada medio del estándar E{String(standardId).padStart(2,'0')}. Marca solo los que hayas comprobado.</p>
        </div>
        <button ref={closeRef} className="point-review-close" type="button" aria-label="Cerrar revisión" onClick={onClose} disabled={saving}><X size={21}/></button>
      </div>
      <div className="point-review-statbar">
        <span className={'point-review-state is-'+(count===0?'empty':count===total?'done':'partial')}><CheckCircle2 size={16}/>{count===0?'Sin revisar':count===total?'Revisión completa':'En revisión'}</span>
        <span className="point-review-count"><strong>{count}/{total}</strong><small>Medios revisados</small></span>
        <span className="point-review-percent"><strong>{percent}%</strong><small>Mi avance</small></span>
      </div>
      <div className="ux-review-tools">
        <label><Search size={16} aria-hidden="true"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar código, medio o criterio" aria-label="Buscar medios para revisar"/></label>
        <button type="button" aria-pressed={unreviewedOnly} className={unreviewedOnly?'is-active':''} onClick={()=>setUnreviewedOnly(v=>!v)}>{unreviewedOnly?'Mostrar todos':'Solo sin revisar'}</button>
        <span role="status">{filteredCount} de {total} medios</span>
      </div>
      <div className="point-review-scroll ux-review-groups">
        {visiblePoints.map(point=>{
          const pointCount=point.media.filter(m=>checked.includes(m.id)).length;
          const isExpanded=expanded.includes(point.id)||Boolean(needle)||unreviewedOnly;
          return <section className="ux-review-point" key={point.id}>
            <button type="button" className="ux-review-point-heading" aria-expanded={isExpanded} onClick={()=>toggleExpanded(point.id)}>
              <span className="ux-review-point-chevron"><ChevronDown size={16}/></span>
              <span className="ux-review-point-title"><strong>Punto {point.id}</strong><small title={point.criterion}>{point.criterion}</small></span>
              <span className="ux-review-point-count">{pointCount}/{point.media.length}</span>
            </button>
            {isExpanded&&<div className="ux-review-medium-list">{point.media.map(m=>{
              const selected=checked.includes(m.id);
              const otherReviewers=teamReviews.filter(row=>row.medium_id===m.id&&row.reviewer_id!==currentUserId);
              return <label key={m.id} className={'point-review-choice ux-review-medium'+(selected?' is-checked':'')}>
                <input type="checkbox" checked={selected} disabled={saving} onChange={()=>toggle(m.id)}
                  aria-label={'Marcar revisión del medio '+m.id}/>
                <span className="point-review-custom-check" aria-hidden="true">{selected&&<Check size={17}/>}</span>
                <span className="point-review-choice-copy"><strong>Medio {m.id}</strong><small>{m.text}</small>
                  {otherReviewers.length>0&&<small className="ux-review-team-count">{otherReviewers.length} revisión(es) de otras cuentas</small>}
                </span>
              </label>;
            })}</div>}
          </section>;
        })}
        {!visiblePoints.length&&<p className="point-review-empty">{total===0?'No hay medios visibles para revisar.':'No hay medios que coincidan con los filtros.'}</p>}
      </div>
      <div className="point-review-footer">
        <p className="point-review-footnote">{changed?'Hay cambios sin guardar. ':''}Cada check corresponde a un solo medio, nunca a todo el punto. Los ocultos no cuentan; sus marcas se conservan para cuando se restauren. Las revisiones anteriores por punto permanecen guardadas por separado.</p>
        <div className="point-review-buttons">
          <button className="point-review-cancel" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="point-review-all" type="button" onClick={toggleAll} disabled={!total||saving}><CheckCheck size={18}/>{count===total?'Desmarcar todo':'Marcar todos los medios'}</button>
          <button className="point-review-save" type="button" onClick={()=>onSave(checked)} disabled={!total||saving||!changed}><Save size={17}/>{saving?'Guardando…':'Guardar revisión'}</button>
        </div>
      </div>
    </div>
  </div>;
}
