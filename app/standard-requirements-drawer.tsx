'use client';

import { useEffect, useRef } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Info,
  Layers3,
  ListChecks,
  Upload,
  X,
} from 'lucide-react';

export type RequirementRecord = {
  id: string;
  text?: string;
  type: string;
  scope?: string;
  matrix?: string;
  responsible?: string;
  manager?: string;
  proposal?: string;
  gap?: string;
  action?: string;
  observations?: string;
  standard: number;
  standardTitle: string;
  point: string;
  criterion: string;
};

type Props = {
  record: RequirementRecord;
  statusLabel: string;
  documentCount: number;
  onClose: () => void;
  onUpload: () => void;
};

function detail(value?: string) {
  return value?.trim() || 'No especificado en la matriz';
}

function InfoSection({ title, value }: { title: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <section className="req-secondary-block">
      <h3>{title}</h3>
      <p>{value}</p>
    </section>
  );
}

/** Vista informativa. Todo el contenido viene de la matriz existente, sin cambiar su fuente. */
export function StandardRequirementsDrawer({
  record,
  statusLabel,
  documentCount,
  onClose,
  onUpload,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = oldOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const statusClass = statusLabel.toLowerCase().includes('completo')
    ? 'is-complete'
    : 'is-neutral';
  const sourceHasExtra = Boolean(
    record.proposal?.trim() || record.observations?.trim() ||
    record.gap?.trim() || record.action?.trim()
  );

  return (
    <div
      className="requirements-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="requirements-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="requirements-title"
        aria-describedby="requirements-subtitle"
      >
        <header className="requirements-header">
          <span className="requirements-header-icon"><Layers3 size={20} /></span>
          <div className="requirements-header-copy">
            <span className="requirements-eyebrow">MATRIZ DE AUTOEVALUACIÓN</span>
            <h2 id="requirements-title">¿Qué solicita este medio?</h2>
            <p id="requirements-subtitle">Información correspondiente al estándar {record.standard}.</p>
          </div>
          <button
            ref={closeRef}
            className="requirements-close"
            type="button"
            aria-label="Cerrar información del estándar"
            onClick={onClose}
          ><X size={19} /></button>
        </header>

        <div className="requirements-content">
          <div className="requirements-id-grid">
            <div className="requirements-id-standard">
              <small>ESTÁNDAR {record.standard}</small>
              <strong>{record.standardTitle}</strong>
            </div>
            <div>
              <small>PUNTO</small>
              <strong>{record.point}</strong>
            </div>
            <div>
              <small>MEDIO DE LOGRO</small>
              <strong>{record.id}</strong>
            </div>
          </div>

          <section className="requirements-section requirements-primary">
            <h3><FileText size={18} /> Documento solicitado</h3>
            <p>{detail(record.text) === 'No especificado en la matriz' ? detail(record.type) : detail(record.text)}</p>
            <div className="requirements-type"><span>Tipo documental</span><strong>{detail(record.type)}</strong></div>
          </section>

          <section className="requirements-section">
            <h3><BookOpen size={18} /> Criterio de evaluación</h3>
            <p>{detail(record.criterion)}</p>
          </section>

          <section className="requirements-section requirements-summary">
            <h3><ClipboardCheck size={18} /> Información registrada</h3>
            <dl>
              <div><dt>Existencia declarada</dt><dd>{detail(record.matrix)}</dd></div>
              <div><dt>Alcance</dt><dd>{detail(record.scope)}</dd></div>
              <div><dt>Dependencia responsable</dt><dd>{detail(record.responsible)}</dd></div>
              <div><dt>Gestor responsable</dt><dd>{detail(record.manager)}</dd></div>
            </dl>
          </section>

          {sourceHasExtra && (
            <details className="requirements-extra">
              <summary><ListChecks size={17} /> Orientaciones y brechas de la matriz <ChevronDown size={16} /></summary>
              <div className="requirements-extra-content">
                <InfoSection title="Propuesta registrada" value={record.proposal} />
                <InfoSection title="Observaciones de la matriz" value={record.observations} />
                <InfoSection title="Brecha registrada" value={record.gap} />
                <InfoSection title="Acción prevista" value={record.action} />
              </div>
            </details>
          )}

          <div className="requirements-footnote">
            <Info size={16} />
            <span>Este panel reproduce la información de la matriz. No constituye una lista de requisitos adicionales ni certifica la validez del archivo.</span>
          </div>
        </div>

        <footer className="requirements-footer">
          <div className="requirements-footer-status">
            <span className={`requirements-status ${statusClass}`}>
              {statusClass === 'is-complete' && <CheckCircle2 size={15} />}
              {statusLabel}
            </span>
            <small>{documentCount} documento{documentCount === 1 ? '' : 's'} adjunto{documentCount === 1 ? '' : 's'}</small>
          </div>
          <button type="button" className="requirements-upload-button" onClick={onUpload}>
            <Upload size={17} /> Ir a cargar documento <ArrowRight size={15} />
          </button>
        </footer>
      </aside>
    </div>
  );
}
