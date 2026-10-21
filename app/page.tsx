'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Cloud,
  Download,
  Eye,
  FileText,
  Filter,
  Folder,
  Info,
  Layers3,
  LayoutDashboard,
  Library,
  Landmark,
  BarChart3,
  Menu,
  Paperclip,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import matrix from '../lib/matriz.json';
import { client, type Evidence, type Tracking } from '../lib/supabase';

type Item = {
  id: string;
  text: string;
  type: string;
  scope: string;
  matrix: string;
  responsible: string;
  manager: string;
  gap: string;
  action: string;
};
type Point = { id: string; criterion: string; items: Item[] };
type Standard = { id: number; title: string; points: Point[] };
type RecordItem = Item & {
  standard: number;
  standardTitle: string;
  point: string;
  criterion: string;
};
type Status = 'pendiente' | 'en_proceso' | 'complementar' | 'completo';
type Existence = 'existente' | 'no_existente' | 'por_verificar';

const standards = matrix as Standard[];
const all: RecordItem[] = standards.flatMap((st) =>
  st.points.flatMap((pt) =>
    pt.items.map((it) => ({
      ...it,
      standard: st.id,
      standardTitle: st.title,
      point: pt.id,
      criterion: pt.criterion,
    })),
  ),
);

const STATUS_META: Record<Status, { name: string; color: string }> = {
  pendiente: { name: 'Pendiente', color: 'neutral' },
  en_proceso: { name: 'Con datos simulados', color: 'purple' },
  complementar: { name: 'Por complementar', color: 'amber' },
  completo: { name: 'Completo', color: 'green' },
};

const EXISTENCE_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'existente', label: 'Existentes' },
  { value: 'no_existente', label: 'No existentes' },
  { value: 'por_verificar', label: 'Por verificar' },
] as const;

function fmt(value: string) {
  return value || 'No especificado en la matriz';
}

function normalizeExistence(value: string): Existence {
  const clean = (value || '').trim().toLowerCase();
  if (['si', 'sí'].includes(clean)) return 'existente';
  if (clean === 'no') return 'no_existente';
  return 'por_verificar';
}

function existenceLabel(value: string) {
  const classification = normalizeExistence(value);
  if (classification === 'existente') return 'Existe en la matriz';
  if (classification === 'no_existente') return 'No existe en la matriz';
  return 'Por verificar en la matriz';
}

function normalizeType(value: string) {
  const clean = (value || '').trim().toLowerCase();
  if (!clean) return 'Otro';
  if (clean.includes('informe') || clean.includes('document') || clean.includes('silabus') || clean.includes('sylabus')) return 'Documento / Informe';
  if (clean.includes('matriz') || clean.includes('matrilz')) return 'Matriz';
  if (clean.includes('reglamento') || clean.includes('normativa')) return 'Reglamento';
  if (clean.includes('acta')) return 'Acta';
  if (clean.includes('plan')) return 'Plan';
  if (clean.includes('manual')) return 'Manual';
  if (clean.includes('resol')) return 'Resolución';
  return 'Otro';
}

const TYPE_OPTIONS = ['Todos', 'Documento / Informe', 'Matriz', 'Reglamento', 'Acta', 'Plan', 'Manual', 'Resolución', 'Otro'];

function StatCard({ number, label, sub, kind }: { number: number; label: string; sub: string; kind: string }) {
  return (
    <div className={`metric ${kind}`}>
      <div className="metric-icon" aria-hidden="true">{kind === "m-one" ? <Layers3 size={26} /> : kind === "m-two" ? <ClipboardList size={26} /> : kind === "m-three" ? <BarChart3 size={26} /> : <Folder size={26} />}</div>
      <div className="metric-copy">
        <div className="metric-kicker">{label}</div>
        <div className="metric-number">{number}</div>
        <span className="metric-sub">{sub}</span>
      </div>
      <ChevronRight size={18} className="metric-arrow" />
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const sb = client();
  const [section, setSection] = useState<'inicio' | 'estandares' | 'biblioteca' | 'pendientes'>('inicio');
  const [standard, setStandard] = useState<number>(1);
  const [point, setPoint] = useState<string | null>(null);
  const [item, setItem] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | Status>('todos');
  const [existenceFilter, setExistenceFilter] = useState<'todos' | Existence>('todos');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [tracking, setTracking] = useState<Tracking[]>([]);
  const [documents, setDocuments] = useState<Evidence[]>([]);
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploader, setUploader] = useState('');
  const [notes, setNotes] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Evidence | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Evidence | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequest = useRef(0);

  const refresh = async () => {
    if (!sb) return;
    const [docsRes, trackingRes] = await Promise.all([
      sb.from('evidencias').select('*').order('created_at', { ascending: false }),
      sb.from('seguimiento').select('*'),
    ]);
    if (docsRes.error) setAlert(`No se pudo consultar la biblioteca: ${docsRes.error.message}`);
    else setDocuments((docsRes.data || []) as Evidence[]);
    if (trackingRes.error) setAlert(`No se pudo consultar el seguimiento: ${trackingRes.error.message}`);
    else setTracking((trackingRes.data || []) as Tracking[]);
  };

  useEffect(() => {
    if (!sb) return;
    let active = true;
    const reload = () => {
      if (active) void refresh();
    };
    reload();
    const channel = sb
      .channel('gestor-compartido')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evidencias' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seguimiento' }, reload)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') reload();
      });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', reload);
    const fallback = window.setInterval(reload, 30000);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', reload);
      window.clearInterval(fallback);
      void sb.removeChannel(channel);
    };
  }, []);

  const getStatus = (id: string): Status => tracking.find((t) => t.point_id === id)?.status || 'pendiente';
  const getDocs = (id: string) => documents.filter((d) => d.point_id === id);

  const complete = all.filter((a) => getStatus(a.id) === 'completo').length;
  const simulated = all.filter((a) => getStatus(a.id) === 'en_proceso').length;
  const need = all.filter((a) => getStatus(a.id) === 'complementar').length;
  const pending = all.filter((a) => getStatus(a.id) === 'pendiente').length;
  const allPoints = standards.reduce((sum, st) => sum + st.points.length, 0);
  const numberedSubpoints = all.filter((a) => a.id.split('.').length === 3).length;
  const generalPercent = Math.round((complete / Math.max(all.length, 1)) * 100);
  const selectedStandard = standards.find((s) => s.id === standard) || standards[0];
  const selected = all.find((a) => a.id === item) || null;

  const filteredMatrixItems = useMemo(() => {
    return all.filter((record) => {
      const haystack = [
        record.id,
        record.text,
        record.standardTitle,
        record.point,
        normalizeType(record.type),
        record.type,
        record.responsible,
        record.manager,
        ...getDocs(record.id).map((doc) => `${doc.file_name} ${doc.uploader} ${doc.notes}`),
      ]
        .join(' ')
        .toLowerCase();

      if (query && !haystack.includes(query.toLowerCase())) return false;
      if (statusFilter !== 'todos' && getStatus(record.id) !== statusFilter) return false;
      if (existenceFilter !== 'todos' && normalizeExistence(record.matrix) !== existenceFilter) return false;
      if (typeFilter !== 'Todos' && normalizeType(record.type) !== typeFilter) return false;
      return true;
    });
  }, [query, statusFilter, existenceFilter, typeFilter, tracking, documents]);

  const libraryRows = useMemo(() => {
    return [...filteredMatrixItems].sort((a, b) => {
      const docDiff = getDocs(b.id).length - getDocs(a.id).length;
      if (docDiff !== 0) return docDiff;
      return a.id.localeCompare(b.id);
    });
  }, [filteredMatrixItems, documents]);

  const recentActivity = useMemo(() => {
    const docEvents = documents.slice(0, 3).map((d) => ({
      id: d.id,
      title: d.file_name,
      subtitle: `Documento cargado · ${d.point_id}`,
      when: new Date(d.created_at).toLocaleDateString('es-PE'),
      type: 'documento',
    }));
    const trackingEvents = tracking
      .filter((t) => t.status === 'completo')
      .slice(0, 2)
      .map((t) => ({
        id: t.point_id,
        title: `Punto marcado como completo`,
        subtitle: t.point_id,
        when: new Date(t.updated_at).toLocaleDateString('es-PE'),
        type: 'estado',
      }));
    return [...docEvents, ...trackingEvents].slice(0, 4);
  }, [documents, tracking]);

  function resetFilters() {
    setQuery('');
    setStatusFilter('todos');
    setExistenceFilter('todos');
    setTypeFilter('Todos');
  }

  function nav(next: 'inicio' | 'estandares' | 'biblioteca' | 'pendientes') {
    setSection(next);
    setItem(null);
    setPoint(null);
    setSidebar(false);
    resetFilters();
    setAlert('');
  }

  function openStd(id: number) {
    setStandard(id);
    setSection('estandares');
    setPoint(null);
    setItem(null);
    setSidebar(false);
  }

  function openItem(code: string) {
    const record = all.find((row) => row.id === code);
    if (!record) return;
    setSection('estandares');
    setStandard(record.standard);
    setPoint(record.point);
    setItem(record.id);
    setFiles([]);
    setUploader('');
    setNotes('');
    setAlert('');
  }

  async function saveStatus(status: Status) {
    if (!sb || !selected) return;
    setBusy(true);
    const { error } = await sb
      .from('seguimiento')
      .upsert(
        {
          point_id: selected.id,
          status,
          notes: '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'point_id' },
      );
    if (error) setAlert(error.message);
    else {
      setAlert('Estado guardado correctamente.');
      await refresh();
    }
    setBusy(false);
  }

  async function upload() {
    if (!sb || !selected || !files.length) return;
    setBusy(true);
    setAlert('');
    const whitelist = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'];
    for (const file of files) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!whitelist.includes(ext) || file.size > 15 * 1024 * 1024) {
        setAlert(`Archivo no válido: ${file.name}. Admite PDF, Word, Excel e imágenes hasta 15 MB.`);
        setBusy(false);
        return;
      }
      const safeName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w.\-]/g, '_')
        .slice(0, 90);
      const path = `evidencias/${crypto.randomUUID()}/${safeName}`;
      const { error: uploadErr } = await sb.storage.from('evidencias').upload(path, file, {
        upsert: false,
        contentType: file.type || 'application/pdf',
      });
      if (uploadErr) {
        setAlert(`Error al subir ${file.name}: ${uploadErr.message}`);
        setBusy(false);
        return;
      }
      const { error: dbErr } = await sb.from('evidencias').insert({
        point_id: selected.id,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || 'application/pdf',
        size_bytes: file.size,
        uploader: uploader.trim() || 'Colaborador',
        notes: notes.trim(),
      });
      if (dbErr) {
        await sb.storage.from('evidencias').remove([path]);
        setAlert(`Error al registrar ${file.name}: ${dbErr.message}`);
        setBusy(false);
        return;
      }
    }
    setFiles([]);
    setUploader('');
    setNotes('');
    setAlert('Documentos cargados correctamente.');
    await refresh();
    setBusy(false);
  }

  async function openPreview(doc: Evidence) {
    if (!sb) return;
    const requestId = ++previewRequest.current;
    setPreviewDoc(doc);
    setPreviewUrl(null);
    setPreviewLoading(true);
    const { data, error } = await sb.storage.from('evidencias').createSignedUrl(doc.file_path, 180);
    if (requestId !== previewRequest.current) return;
    if (error || !data?.signedUrl) {
      setPreviewDoc(null);
      setPreviewLoading(false);
      setAlert(error?.message || 'No se pudo abrir el documento');
      return;
    }
    setPreviewUrl(data.signedUrl);
    setPreviewLoading(false);
  }

  function closePreview() {
    previewRequest.current += 1;
    setPreviewDoc(null);
    setPreviewUrl(null);
    setPreviewLoading(false);
  }

  async function downloadDoc(doc: Evidence) {
    if (!sb) return;
    const { data, error } = await sb.storage
      .from('evidencias')
      .createSignedUrl(doc.file_path, 180, { download: doc.file_name });
    if (error || !data?.signedUrl) {
      setAlert(error?.message || 'No se pudo descargar el documento');
      return;
    }
    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.download = doc.file_name;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  }

  async function deleteDocument() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setAlert('');
    try {
      const response = await fetch('/api/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el documento');
      setDeleteTarget(null);
      setAlert('Documento eliminado correctamente.');
      await refresh();
    } catch (error) {
      setAlert(error instanceof Error ? error.message : 'No se pudo eliminar el documento');
    } finally {
      setDeleting(false);
    }
  }

  const title = selected
    ? 'Detalle del medio de logro'
    : section === 'inicio'
      ? 'Panel general'
      : section === 'estandares'
        ? 'Explorador de estándares'
        : section === 'biblioteca'
          ? 'Biblioteca documental'
          : 'Seguimiento';

  const menu = [
    { id: 'inicio', title: 'Panel general', icon: LayoutDashboard },
    { id: 'estandares', title: 'Estándares', icon: Layers3 },
    { id: 'biblioteca', title: 'Biblioteca documental', icon: Library },
    { id: 'pendientes', title: 'Seguimiento', icon: ClipboardList },
  ] as const;

  return (
    <div className="shell shell-modern">
      <aside className={`sidebar sidebar-modern ${sidebar ? 'show' : ''}`}>
        <div className="brand brand-modern">
          <div className="brand-symbol">
            <BookOpen size={22} />
          </div>
          <div className="brand-title">
            <strong>Gestión de Calidad</strong>
            <span>Derecho · UNFV</span>
          </div>
          <button className="mobile-close" aria-label="Cerrar menú" onClick={() => setSidebar(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="side-caption">ESPACIO DE TRABAJO</div>
        <nav>
          {menu.map((entry) => (
            <button key={entry.id} className={`side-nav ${section === entry.id ? 'active' : ''}`} onClick={() => nav(entry.id)}>
              <entry.icon size={18} />
              <span>{entry.title}</span>
            </button>
          ))}
        </nav>
        <div className="unfv-mini-panel">
          <div className="unfv-mini-mark" aria-hidden="true"><Landmark size={26} /></div>
          <div>
            <strong>Universidad Nacional</strong>
            <span>Federico Villarreal</span>
            <small>Facultad de Derecho · Gestión de Calidad 2026</small>
          </div>
        </div>
        <div className="side-footer">
          <span className="pulse" /> {sb ? 'Repositorio conectado' : 'Modo consulta'}
          <small>Matriz GAB Derecho · 2026</small>
        </div>
      </aside>

      <div className="main">
        <header className="topbar topbar-modern">
          <button className="mobile-menu" onClick={() => setSidebar(true)} aria-label="Abrir menú">
            <Menu size={22} />
          </button>
          <div className="breadcrumbs">
            Facultad de Derecho <ChevronRight size={13} /> <b>{title}</b>
          </div>
          <div className="top-right">
            <div className="top-search">
              <Search size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar estándares, documentos..." />
            </div>
            <span className="top-pill ok">
              <Cloud size={15} /> Nube conectada
            </span>
          </div>
        </header>

        <div className="container page-modern">
          {alert && (
            <div className={`banner ${busy ? '' : 'message'}`}>
              <Info size={17} />
              <span>{alert}</span>
              <button onClick={() => setAlert('')} aria-label="Cerrar mensaje">
                ×
              </button>
            </div>
          )}

          {!selected && (
            <div className="page-heading page-hero with-photo">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-dot" /> SISTEMA DE AUTOEVALUACIÓN Y ACREDITACIÓN
                </div>
                <h1>{section === 'inicio' ? 'Panel de control' : title}</h1>
                <p>Información y evidencias organizadas para trabajar con claridad, en un solo lugar.</p>
              </div>
              <div className="heading-badge">
                <BookOpen size={18} /> 18 estándares
              </div>
            </div>
          )}

          {section === 'inicio' && !selected && (
            <div className="home-layout">
              <div className="home-main">
                <div className="metrics metrics-modern">
                  <StatCard number={standards.length} label="Estándares" sub="Matriz oficial" kind="m-one" />
                  <StatCard number={allPoints} label="Puntos" sub="Total de evaluación" kind="m-two" />
                  <StatCard number={all.length} label="Medios de logro" sub="Subpuntos numerados" kind="m-three" />
                  <StatCard number={documents.length} label="Documentos cargados" sub="Evidencias en biblioteca" kind="m-four" />
                </div>

                <section className="progress-overview-card">
                  <div className="progress-overview-head">
                    <h2>Progreso general</h2>
                  </div>
                  <div className="progress-overview-body">
                    <div className="progress-hero">
                      <div className="progress-donut" style={{ ['--progress' as string]: `${generalPercent}%` } as CSSProperties}>
                        <span>{generalPercent}%</span>
                      </div>
                      <div className="progress-copy">
                        <strong>{complete} de {all.length} medios completados</strong>
                        <p>Avance basado en {all.length} medios registrables; incluye {all.length - numberedSubpoints} puntos sin subpunto numerado.</p>
                        <div className="progress-line"><i style={{ width: `${generalPercent}%` }} /></div>
                      </div>
                    </div>
                    <div className="progress-counters">
                      <div className="overview-mini green"><span>Completos</span><b>{complete}</b></div>
                      <div className="overview-mini purple"><span>Con datos simulados</span><b>{simulated}</b></div>
                      <div className="overview-mini amber"><span>Por complementar</span><b>{need}</b></div>
                      <div className="overview-mini neutral"><span>Pendientes</span><b>{pending}</b></div>
                    </div>
                  </div>
                </section>

                <section className="block">
                  <div className="block-title">
                    <div>
                      <h2>Explorar estándares</h2>
                      <p>Selecciona un estándar para consultar sus puntos y medios de logro.</p>
                    </div>
                  </div>
                  <div className="standard-grid grid-modern">
                    {standards.slice(0, 6).map((st) => {
                      const stItems = st.points.flatMap((pt) => pt.items);
                      const stCompleted = stItems.filter((it) => getStatus(it.id) === 'completo').length;
                      const pct = Math.round((stCompleted / Math.max(stItems.length, 1)) * 100);
                      return (
                        <button className="standard-card standard-card-modern" key={st.id} onClick={() => openStd(st.id)}>
                          <div className="card-head">
                            <span className="std-number">E{String(st.id).padStart(2, '0')}</span>
                            <Folder size={18} />
                          </div>
                          <h3>{st.title}</h3>
                          <div className="card-meta">
                            <span>{st.points.length} puntos · {stItems.length} medios</span>
                            <span>{stCompleted}/{stItems.length}</span>
                          </div>
                          <div className="progress"><i style={{ width: `${pct}%` }} /></div>
                          <div className="card-actions-inline">Ver detalle <ChevronRight size={14} /></div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>

              <aside className="home-side">
                <section className="side-widget">
                  <h3>Acciones rápidas</h3>
                  <button className="action-cta" onClick={() => nav('biblioteca')}><Upload size={18} /> Subir documento</button>
                  <button className="action-secondary" onClick={() => nav('estandares')}><Paperclip size={18} /> Cargar evidencia</button>
                </section>

                <section className="side-widget">
                  <h3>Actividad reciente</h3>
                  <div className="activity-list">
                    {recentActivity.length ? recentActivity.map((event) => (
                      <div key={`${event.type}-${event.id}`} className="activity-row">
                        <div className={`activity-icon ${event.type === 'documento' ? 'doc' : 'ok'}`} />
                        <div>
                          <strong>{event.title}</strong>
                          <small>{event.subtitle}</small>
                        </div>
                        <span>{event.when}</span>
                      </div>
                    )) : <div className="empty slim"><strong>Sin actividad reciente</strong></div>}
                  </div>
                </section>

                <section className="side-widget promo-widget">
                  <div>
                    <h3>Biblioteca documental</h3>
                    <p>Accede a normas, guías y referencias de apoyo.</p>
                    <button className="action-secondary" onClick={() => nav('biblioteca')}>Ir a la biblioteca</button>
                  </div>
                </section>
              </aside>
            </div>
          )}

          {section === 'estandares' && !selected && (
            <>
              <div className="standards-tabs">
                {standards.map((st) => (
                  <button key={st.id} className={st.id === standard ? 'active' : ''} onClick={() => openStd(st.id)}>
                    E{st.id}
                  </button>
                ))}
              </div>
              <div className="std-banner redesigned">
                <div className="standard-id-block">{String(selectedStandard.id).padStart(2, '0')}</div>
                <div className="banner-info">
                  <div className="eyebrow">ESTÁNDAR {selectedStandard.id}</div>
                  <h2>{selectedStandard.title}</h2>
                  <p>{selectedStandard.points.length} puntos de evaluación y {selectedStandard.points.flatMap((pt) => pt.items).length} medios organizados.</p>
                </div>
                <div className="banner-stats">
                  <div className="banner-percentage">
                    <span>Progreso general</span>
                    <b>{Math.round((selectedStandard.points.flatMap((pt) => pt.items).filter((it) => getStatus(it.id) === 'completo').length / Math.max(selectedStandard.points.flatMap((pt) => pt.items).length, 1)) * 100)}%</b>
                  </div>
                  <div className="progress"><i style={{ width: `${Math.round((selectedStandard.points.flatMap((pt) => pt.items).filter((it) => getStatus(it.id) === 'completo').length / Math.max(selectedStandard.points.flatMap((pt) => pt.items).length, 1)) * 100)}%` }} /></div>
                  <div className="banner-minis">
                    <span><b>{selectedStandard.points.length}</b>Puntos</span>
                    <span><b>{selectedStandard.points.flatMap((pt) => pt.items).length}</b>Medios</span>
                    <span><b>{selectedStandard.points.flatMap((pt) => pt.items).filter((it) => getDocs(it.id).length > 0).length}</b>Con archivo</span>
                  </div>
                </div>
              </div>

              <div className="toolbar toolbar-extended">
                <div className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar estándar, código o documento..." /></div>
                <div className="select-wrap"><Filter size={16} /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'todos' | Status)}><option value="todos">Todos los estados</option>{Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.name}</option>)}</select></div>
                <div className="select-wrap"><select value={existenceFilter} onChange={(e) => setExistenceFilter(e.target.value as 'todos' | Existence)}>{EXISTENCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                <div className="select-wrap"><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>{TYPE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></div>
              </div>

              {selectedStandard.points.map((pt) => {
                const pointItems = pt.items.filter((it) => filteredMatrixItems.some((row) => row.id === it.id));
                if (!pointItems.length) return null;
                return (
                  <div className="point-panel" key={pt.id}>
                    <button className="point-head" onClick={() => setPoint(point === pt.id ? null : pt.id)}>
                      <span className="point-code">{pt.id}</span>
                      <span className="point-summary">
                        <strong>Punto {pt.id}</strong>
                        <small>{pt.criterion}</small>
                      </span>
                      <span className="point-count">{pointItems.length} medios</span>
                      <ChevronRight className={point === pt.id ? 'rotated' : ''} size={17} />
                    </button>
                    {(point === pt.id || Boolean(query)) && (
                      <div className="expanded-point">
                        <div className="criterion-preview"><b>Criterio del punto</b><p>{pt.criterion}</p></div>
                        <h3 className="subpoints-title">Subpuntos y medios de logro</h3>
                        {pointItems.map((record) => (
                          <div className="item-row item-row-rich" key={record.id}>
                            <button className="item-main" onClick={() => openItem(record.id)}>
                              <span className="item-code">{record.id}</span>
                              <span className="item-summary">
                                {record.text}
                                <small>{normalizeType(record.type)} · {existenceLabel(record.matrix)} · {getDocs(record.id).length} archivo(s)</small>
                              </span>
                            </button>
                            <span className={`chip ${STATUS_META[getStatus(record.id)].color}`}>{STATUS_META[getStatus(record.id)].name}</span>
                            <button className="tiny-button" onClick={() => openItem(record.id)}>Ver ficha</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {selected && (
            <>
              <button className="back" onClick={() => setItem(null)}><ArrowLeft size={17} /> Estándar {selected.standard} · Punto {selected.point}</button>
              <div className="details">
                <div className="detail-left">
                  <div className="detail-card upload-card-top">
                    <div className="section-inline">
                      <h2><Upload size={20} /> Subir documento</h2>
                      <span className="soft-count">Medio {selected.id}</span>
                    </div>
                    <p className="muted">Adjunta aquí el archivo principal o sus anexos. La carga es visible para todos los colaboradores.</p>
                    {!sb && <p className="upload-connection-warning" role="status">La carga está deshabilitada porque no se ha configurado la conexión con Supabase. Configura las variables de entorno y reinicia la aplicación.</p>}
                    <label className={`dropzone ${sb ? '' : 'disabled'}`}>
                      <Upload size={27} />
                      <strong>{files.length ? files.map((f) => f.name).join(', ') : 'Seleccionar documentos'}</strong>
                      <span>PDF, Word, Excel o imágenes · Hasta 15 MB por archivo</span>
                      <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" disabled={!sb || busy} onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                    </label>
                    <div className="upload-grid-fields">
                      <div className="field"><label htmlFor="uploader">Colaborador</label><input id="uploader" value={uploader} onChange={(e) => setUploader(e.target.value)} placeholder="Opcional" /></div>
                      <div className="field"><label htmlFor="notes">Observación</label><textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Información complementaria" /></div>
                    </div>
                    <button className="primary-button" disabled={!sb || !files.length || busy} onClick={upload}>{busy ? 'Guardando...' : 'Guardar documentos'}</button>
                  </div>

                  <div className="detail-card">
                    <div className="eyebrow">REQUISITO DOCUMENTAL</div>
                    <h2>{selected.text || selected.criterion}</h2>
                    <div className="tags">
                      <span>{normalizeType(selected.type)}</span>
                      <span>{existenceLabel(selected.matrix)}</span>
                      <span>E{selected.standard}</span>
                      <span>Punto {selected.point}</span>
                    </div>
                    <div className="rule" />
                    <h3>Criterio de evaluación</h3>
                    <p>{fmt(selected.criterion)}</p>
                    <h3>Información de la matriz</h3>
                    <dl className="metadata">
                      <dt>Existencia declarada</dt><dd><b>{fmt(selected.matrix)}</b></dd>
                      <dt>Tipo documental</dt><dd>{normalizeType(selected.type)}</dd>
                      <dt>Alcance</dt><dd>{fmt(selected.scope)}</dd>
                      <dt>Dependencia responsable</dt><dd>{fmt(selected.responsible)}</dd>
                      <dt>Gestor responsable</dt><dd>{fmt(selected.manager)}</dd>
                    </dl>
                    {selected.gap && <><h3>Brecha registrada</h3><p>{selected.gap}</p></>}
                    {selected.action && <><h3>Acción prevista</h3><p>{selected.action}</p></>}
                  </div>

                  <div className="detail-card">
                    <div className="section-inline">
                      <h2><Paperclip size={20} /> Documentos adjuntos</h2>
                      <span className="soft-count">{getDocs(selected.id).length} archivo(s)</span>
                    </div>
                    {getDocs(selected.id).length ? (
                      getDocs(selected.id).map((doc) => (
                        <div className="document-with-actions" key={doc.id}>
                          <button className="document-row" onClick={() => void openPreview(doc)}>
                            <div className="doc-icon"><FileText size={20} /></div>
                            <span>
                              <strong>{doc.file_name}</strong>
                              <small>{doc.uploader} · {new Date(doc.created_at).toLocaleDateString('es-PE')} · {formatBytes(doc.size_bytes)}</small>
                              {doc.notes && <small>{doc.notes}</small>}
                            </span>
                          </button>
                          <button className="document-action" type="button" onClick={() => void openPreview(doc)} title="Vista previa" aria-label={`Vista previa de ${doc.file_name}`}><Eye size={16} /></button>
                          <button className="document-action" type="button" onClick={() => void downloadDoc(doc)} title="Descargar" aria-label={`Descargar ${doc.file_name}`}><Download size={16} /></button>
                          <button className="delete-document" type="button" onClick={() => setDeleteTarget(doc)} title="Eliminar documento"><Trash2 size={16} /></button>
                        </div>
                      ))
                    ) : (
                      <div className="empty"><FileText size={28} /><strong>Aún no hay documentos cargados</strong><span>Los archivos añadidos aparecerán aquí para todos los colaboradores.</span></div>
                    )}
                  </div>
                </div>
                <aside className="detail-right">
                  <div className="detail-card">
                    <div className="eyebrow">SEGUIMIENTO</div>
                    <h2>Estado del medio</h2>
                    <p className="muted">El avance es distinto de la existencia indicada en la matriz.</p>
                    <select className="status-select" disabled={!sb || busy} value={getStatus(selected.id)} onChange={(e) => saveStatus(e.target.value as Status)}>
                      {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.name}</option>)}
                    </select>
                    <span className="tiny-note"><CheckCircle2 size={15} /> {sb ? 'Cambios compartidos' : 'Activar conexión para editar'}</span>
                  </div>
                  <div className="detail-card">
                    <h3>Ruta documental</h3>
                    <div className="path-list"><span>Estándar {selected.standard}</span><ChevronRight size={15} /><span>{selected.point}</span><ChevronRight size={15} /><b>{selected.id}</b></div>
                  </div>
                </aside>
              </div>
            </>
          )}

          {section === 'biblioteca' && !selected && (
            <>
              <div className="toolbar toolbar-extended">
                <div className="search"><Search size={18} /><input placeholder="Buscar documento, código o colaborador" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
                <div className="select-wrap"><select value={existenceFilter} onChange={(e) => setExistenceFilter(e.target.value as 'todos' | Existence)}>{EXISTENCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                <div className="select-wrap"><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>{TYPE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                <div className="select-wrap"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'todos' | Status)}><option value="todos">Todos los estados</option>{Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.name}</option>)}</select></div>
              </div>

              <div className="library-summary-bar">
                <span className="filter-pill active">{libraryRows.length} registros</span>
                <span className="filter-pill">Documento / Informe agrupados</span>
                <button className="tiny-button" onClick={resetFilters}>Limpiar filtros</button>
              </div>

              <div className="list-panel padded">
                <div className="section-inline">
                  <h2>Biblioteca y matriz documental</h2>
                  <span className="soft-count">{documents.length} archivos cargados</span>
                </div>
                {libraryRows.map((record) => {
                  const docs = getDocs(record.id);
                  return (
                    <div className="library-record" key={record.id}>
                      <div className="library-record-head">
                        <div>
                          <strong>{record.id} · {record.text}</strong>
                          <small>{record.standardTitle} · Punto {record.point}</small>
                        </div>
                        <div className="library-badges">
                          <span className={`chip ${normalizeExistence(record.matrix) === 'existente' ? 'green' : 'neutral'}`}>{existenceLabel(record.matrix)}</span>
                          <span className="chip blueish">{normalizeType(record.type)}</span>
                          <span className={`chip ${STATUS_META[getStatus(record.id)].color}`}>{STATUS_META[getStatus(record.id)].name}</span>
                        </div>
                      </div>
                      <div className="library-record-body">
                        <div className="library-record-meta">
                          <span><b>Responsable:</b> {fmt(record.responsible)}</span>
                          <span><b>Gestor:</b> {fmt(record.manager)}</span>
                        </div>
                        {docs.length ? docs.map((doc) => (
                          <div className="document-with-actions" key={doc.id}>
                            <button className="document-row" onClick={() => void openPreview(doc)}>
                              <div className="doc-icon"><FileText size={20} /></div>
                              <span>
                                <strong>{doc.file_name}</strong>
                                <small>{doc.uploader} · {new Date(doc.created_at).toLocaleDateString('es-PE')} · {formatBytes(doc.size_bytes)}</small>
                              </span>
                            </button>
                            <button className="tiny-button" onClick={() => openItem(record.id)}>Ver ficha</button>
                            <button className="document-action" type="button" onClick={() => void openPreview(doc)} title="Vista previa" aria-label={`Vista previa de ${doc.file_name}`}><Eye size={16} /></button>
                            <button className="document-action" type="button" onClick={() => void downloadDoc(doc)} title="Descargar" aria-label={`Descargar ${doc.file_name}`}><Download size={16} /></button>
                            <button className="delete-document" type="button" onClick={() => setDeleteTarget(doc)} title="Eliminar documento"><Trash2 size={16} /></button>
                          </div>
                        )) : (
                          <div className="library-missing">Sin archivo cargado todavía. Este medio seguirá visible para su seguimiento.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!libraryRows.length && <div className="empty"><Library size={30} /><strong>No hay resultados</strong><span>Prueba con otro tipo documental o limpia los filtros.</span></div>}
              </div>
            </>
          )}

          {section === 'pendientes' && !selected && (
            <>
              <div className="toolbar toolbar-extended">
                <div className="search"><Search size={17} /><input placeholder="Buscar pendientes por código o requisito" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
                <div className="select-wrap"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'todos' | Status)}><option value="todos">Todos los estados</option>{Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.name}</option>)}</select></div>
                <div className="select-wrap"><select value={existenceFilter} onChange={(e) => setExistenceFilter(e.target.value as 'todos' | Existence)}>{EXISTENCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
              </div>
              <div className="list-panel padded">
                <div className="section-inline"><h2>Medios de logro</h2><span className="soft-count">{filteredMatrixItems.length} resultados</span></div>
                {filteredMatrixItems.map((record) => (
                  <div className="item-row item-row-rich" key={record.id}>
                    <button className="item-main" onClick={() => openItem(record.id)}>
                      <span className="item-code">{record.id}</span>
                      <span className="item-summary">{record.text}<small>{record.standardTitle} · {normalizeType(record.type)} · {getDocs(record.id).length} archivo(s)</small></span>
                    </button>
                    <span className={`chip ${STATUS_META[getStatus(record.id)].color}`}>{STATUS_META[getStatus(record.id)].name}</span>
                    <button className="tiny-button" onClick={() => openItem(record.id)}>Ver ficha</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {previewDoc && (
        <div className="modal-overlay preview-overlay" onMouseDown={(e) => { if (e.currentTarget === e.target) closePreview(); }} role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="preview-title" className="preview-dialog">
            <header className="preview-header">
              <div>
                <span className="eyebrow">VISTA PREVIA</span>
                <h2 id="preview-title">{previewDoc.file_name}</h2>
              </div>
              <button type="button" className="preview-close" onClick={closePreview} aria-label="Cerrar vista previa"><X size={20} /></button>
            </header>
            <div className="preview-content">
              {previewLoading ? (
                <p className="preview-message">Cargando vista previa...</p>
              ) : previewUrl && (previewDoc.mime_type === 'application/pdf' || previewDoc.file_name.toLowerCase().endsWith('.pdf')) ? (
                <iframe title={`Vista previa de ${previewDoc.file_name}`} src={previewUrl} />
              ) : previewUrl && (previewDoc.mime_type.startsWith('image/') || /\.(png|jpe?g)$/i.test(previewDoc.file_name)) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={`Vista previa de ${previewDoc.file_name}`} />
              ) : (
                <p className="preview-message">Este formato no admite vista previa en el navegador. Descarga el archivo para abrirlo.</p>
              )}
            </div>
            <div className="preview-actions">
              <button type="button" className="cancel-delete" onClick={closePreview}>Cerrar</button>
              <button type="button" className="confirm-delete" onClick={() => void downloadDoc(previewDoc)}><Download size={16} /> Descargar</button>
            </div>
          </section>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.currentTarget === e.target && !deleting) setDeleteTarget(null); }} role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="delete-title" className="delete-dialog">
            <div className="delete-dialog-icon"><Trash2 size={21} /></div>
            <h2 id="delete-title">¿Eliminar este documento?</h2>
            <p><strong>{deleteTarget.file_name}</strong> desaparecerá de la biblioteca y se borrará del almacenamiento de Supabase. Esta acción no se puede deshacer.</p>
            <div className="modal-actions">
              <button type="button" className="cancel-delete" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button type="button" className="confirm-delete" disabled={deleting} onClick={deleteDocument}>{deleting ? 'Eliminando...' : 'Sí, eliminar'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
