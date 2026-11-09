'use client';

import {CheckCircle2, ClipboardCheck, Clock3, RotateCcw, ShieldCheck} from 'lucide-react';

export type StandardReview = {
  standard_id: number;
  status: 'en_revision' | 'revisado';
  reviewed_by: string;
  reviewer_name: string;
  reviewed_at: string;
};

function reviewDate(value:string){
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-PE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

export function StandardReviewBadge({review,stale=false}:{review?:StandardReview;stale?:boolean}){
  const kind = !review ? 'sin-revisar' : stale && review.status==='revisado' ? 'actualizar' : review.status;
  return (
    <span className={'standard-review-badge is-'+kind}>
      {kind==='revisado' ? <CheckCircle2 size={14}/> : kind==='en_revision' ? <Clock3 size={14}/> : <ClipboardCheck size={14}/>}
      {kind==='revisado' ? 'Revisado ✓' : kind==='en_revision' ? 'En revisión' : kind==='actualizar' ? 'Revisar cambios' : 'Sin revisar'}
    </span>
  );
}

export function StandardReviewControl({
  standardId, review, stale, canReview, saving, onChange
}:{
  standardId:number;
  review?:StandardReview;
  stale:boolean;
  canReview:boolean;
  saving:boolean;
  onChange:(status:'en_revision'|'revisado'|null)=>void;
}){
  const reviewComplete=review?.status==='revisado' && !stale;
  return (
    <section className="standard-review-panel" aria-label={'Revisión del estándar '+standardId}>
      <div className="standard-review-summary">
        <span className="standard-review-icon"><ShieldCheck size={20}/></span>
        <div className="standard-review-copy">
          <strong>Validación manual del estándar</strong>
          <p>Esta marca confirma una revisión humana; no depende del porcentaje de evidencias cargadas.</p>
        </div>
        <StandardReviewBadge review={review} stale={stale}/>
      </div>
      {review && (
        <div className="standard-review-record">
          <span>Última revisión: <strong>{review.reviewer_name}</strong></span>
          <span>{reviewDate(review.reviewed_at)}</span>
        </div>
      )}
      {stale && review?.status==='revisado' && (
        <p className="standard-review-alert">
          Se añadieron evidencias después de esta validación. Conviene revisarlas y confirmar nuevamente.
        </p>
      )}
      {canReview ? (
        <div className="standard-review-actions">
          <button type="button" disabled={saving || review?.status==='en_revision'}
            className="standard-review-action secondary"
            onClick={()=>onChange('en_revision')}>
            <Clock3 size={16}/> {review?.status==='en_revision' ? 'En revisión' : 'Marcar en revisión'}
          </button>
          <button type="button" disabled={saving || reviewComplete}
            className="standard-review-action primary"
            onClick={()=>onChange('revisado')}>
            <CheckCircle2 size={16}/> {saving ? 'Guardando…' : reviewComplete ? 'Revisado ✓' : 'Marcar revisado ✓'}
          </button>
          {review && (
            <button type="button" disabled={saving} className="standard-review-action reset"
              onClick={()=>onChange(null)}><RotateCcw size={15}/> Quitar marca</button>
          )}
        </div>
      ) : (
        <p className="standard-review-hint">Solo un administrador autorizado puede cambiar la revisión.</p>
      )}
    </section>
  );
}
