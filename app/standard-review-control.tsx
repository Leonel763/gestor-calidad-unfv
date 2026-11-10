'use client';

import {CheckCircle2, ClipboardCheck, Clock3, RotateCcw, ShieldCheck, UsersRound} from 'lucide-react';

export type StandardReview = {
  standard_id: number;
  status: 'en_revision' | 'revisado';
  reviewed_by: string;
  reviewer_name: string;
  reviewed_at: string;
};

export function reviewDate(value:string){
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-PE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

export function StandardReviewBadge({
  review,stale=false,reviewedCount=0,personal=true
}:{
  review?:StandardReview;
  stale?:boolean;
  reviewedCount?:number;
  personal?:boolean;
}){
  const kind = !review ? 'sin-revisar' : stale && review.status==='revisado' ? 'actualizar' : review.status;
  const label = kind==='revisado' ? (personal?'Tu revisión ✓':'Revisado ✓') : kind==='en_revision'
    ? (personal?'Estás revisando':'En revisión') : kind==='actualizar' ? 'Revisar cambios' : 'Sin revisar';
  return (
    <span className="standard-review-badge-group">
      <span className={'standard-review-badge is-'+kind}>
        {kind==='revisado' ? <CheckCircle2 size={14}/> : kind==='en_revision' ? <Clock3 size={14}/> : <ClipboardCheck size={14}/>}
        {label}
      </span>
      {reviewedCount>0 && <span className="standard-review-total" title="Cantidad de personas que marcaron este estándar como revisado">
        <UsersRound size={12}/>{reviewedCount} {reviewedCount===1?'revisor':'revisores'}
      </span>}
    </span>
  );
}

export function StandardReviewControl({
  standardId, reviews, myUserId, stale, hasNewDocumentsAfter, saving, onChange
}:{
  standardId:number;
  reviews:StandardReview[];
  myUserId:string;
  stale:boolean;
  hasNewDocumentsAfter:(review:StandardReview)=>boolean;
  saving:boolean;
  onChange:(status:'en_revision'|'revisado'|null)=>void;
}){
  const mine=reviews.find(review=>review.reviewed_by===myUserId);
  const reviewComplete=mine?.status==='revisado' && !stale;
  const approvedCount=reviews.filter(review=>review.status==='revisado' && !hasNewDocumentsAfter(review)).length;
  const completed=reviews.filter(review=>review.status==='revisado').length;
  const inReview=reviews.filter(review=>review.status==='en_revision').length;

  return (
    <section className="standard-review-panel" aria-label={'Revisión del estándar '+standardId}>
      <div className="standard-review-summary">
        <span className="standard-review-icon"><ShieldCheck size={20}/></span>
        <div className="standard-review-copy">
          <strong>Revisión individual del estándar</strong>
          <p>Cada cuenta guarda su propia revisión. Tu check no cambia ni borra el de otra persona.</p>
        </div>
        <StandardReviewBadge review={mine} stale={stale} reviewedCount={approvedCount}/>
      </div>

      {mine && (
        <div className="standard-review-record">
          <span>Tu última revisión: <strong>{mine.reviewer_name}</strong></span>
          <span>{reviewDate(mine.reviewed_at)}</span>
        </div>
      )}
      {stale && mine?.status==='revisado' && (
        <p className="standard-review-alert">
          Se añadieron evidencias después de tu revisión. Comprueba los cambios antes de confirmar nuevamente.
        </p>
      )}

      <div className="standard-review-actions">
        <button type="button" disabled={saving || mine?.status==='en_revision'}
          className="standard-review-action secondary"
          onClick={()=>onChange('en_revision')}>
          <Clock3 size={16}/> {mine?.status==='en_revision' ? 'En revisión' : 'Estoy revisando'}
        </button>
        <button type="button" disabled={saving || reviewComplete}
          className="standard-review-action primary"
          onClick={()=>onChange('revisado')}>
          <CheckCircle2 size={16}/> {saving ? 'Guardando…' : reviewComplete ? 'Ya lo revisaste ✓' : 'Lo revisé y está bien ✓'}
        </button>
        {mine && (
          <button type="button" disabled={saving} className="standard-review-action reset"
            onClick={()=>onChange(null)}><RotateCcw size={15}/> Quitar mi marca</button>
        )}
      </div>

      <div className="standard-review-team">
        <div className="standard-review-team-header">
          <strong><UsersRound size={16}/> Revisiones del equipo</strong>
          <small>{approvedCount} vigentes · {inReview} en revisión{completed>approvedCount?' · '+(completed-approvedCount)+' por actualizar':''}</small>
        </div>
        {reviews.length ? (
          <ul className="standard-review-team-list">
            {reviews.slice().sort((a,b)=>new Date(b.reviewed_at).getTime()-new Date(a.reviewed_at).getTime()).map(review=>{
              const outdated=hasNewDocumentsAfter(review);
              return (
                <li key={review.reviewed_by}>
                  <span className="standard-review-member-name">{review.reviewer_name}{review.reviewed_by===myUserId?' (tú)':''}</span>
                  <StandardReviewBadge review={review} stale={outdated} personal={false}/>
                  <time dateTime={review.reviewed_at}>{reviewDate(review.reviewed_at)}</time>
                </li>
              );
            })}
          </ul>
        ):<p className="standard-review-empty">Todavía nadie ha registrado una revisión de este estándar.</p>}
      </div>
      <p className="standard-review-hint">Estas marcas son revisiones individuales, no una aprobación institucional definitiva.</p>
    </section>
  );
}
