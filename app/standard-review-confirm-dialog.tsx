'use client';

import {useEffect, useRef} from 'react';
import {AlertCircle, CheckCircle2, ClipboardCheck, ShieldCheck, UserRound, X} from 'lucide-react';

type Props = {
  standardId: number;
  standardTitle: string;
  reviewerName: string;
  saving: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
};

/** Diálogo accesible que sustituye al aviso nativo del navegador. */
export function StandardReviewConfirmDialog({
  standardId, standardTitle, reviewerName, saving, error, onConfirm, onClose,
}: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const closeAction = useRef(onClose);
  const savingRef = useRef(saving);
  closeAction.current = onClose;
  savingRef.current = saving;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!savingRef.current) closeAction.current();
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const buttons = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        if (!buttons.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="review-confirm-overlay" role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}>
      <section ref={dialogRef} className="review-confirm-dialog" role="dialog" aria-modal="true"
        aria-labelledby="review-confirm-title" aria-describedby="review-confirm-desc">
        <button type="button" className="review-confirm-close" aria-label="Cerrar ventana"
          disabled={saving} onClick={onClose}><X size={19}/></button>

        <div className="review-confirm-illustration" aria-hidden="true">
          <span className="review-confirm-illustration-ring"><ClipboardCheck size={33}/></span>
          <span className="review-confirm-illustration-check"><CheckCircle2 size={19}/></span>
        </div>
        <span className="review-confirm-eyebrow">REVISIÓN PERSONAL · ESTÁNDAR {standardId}</span>
        <h2 id="review-confirm-title">¿Confirmas tu revisión?</h2>
        <p id="review-confirm-desc" className="review-confirm-description">
          Indica que has revisado las evidencias de este estándar y que las consideras conformes.
        </p>

        <div className="review-confirm-detail">
          <span className="review-confirm-detail-label">ESTÁNDAR {standardId}</span>
          <strong>{standardTitle}</strong>
          <div className="review-confirm-person"><UserRound size={16}/>
            <span>Se registrará a nombre de <strong>{reviewerName}</strong></span>
          </div>
        </div>
        <div className="review-confirm-note">
          <ShieldCheck size={18} aria-hidden="true"/>
          <span>Esta marca es individual. No cambiará las revisiones de otras personas ni constituye una aprobación institucional definitiva.</span>
        </div>

        {error && <div className="review-confirm-error" role="alert"><AlertCircle size={16}/><span>{error}</span></div>}
        <div className="review-confirm-actions">
          <button ref={cancelRef} type="button" className="review-confirm-cancel" disabled={saving}
            onClick={onClose}>Cancelar</button>
          <button type="button" className="review-confirm-accept" disabled={saving}
            onClick={onConfirm}>
            <CheckCircle2 size={18}/>{saving ? 'Guardando revisión…' : 'Sí, lo revisé y está bien'}
          </button>
        </div>
      </section>
    </div>
  );
}
