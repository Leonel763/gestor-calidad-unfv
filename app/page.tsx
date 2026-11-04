'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  CircleAlert,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Filter,
  Folder,
  Layers3,
  LayoutDashboard,
  Library,
  Landmark,
  BarChart3,
  Paperclip,
  Search,
  Trash2,
  Upload,
  Info,
  LogOut,
  UserRound,
  MessageCircle,
  AlertTriangle,
  X,
} from 'lucide-react';
import {AuthGate, type ApprovedIdentity} from './auth-gate';
import {DocumentFeedback, type DocumentCommentBrief} from './document-feedback';
import {StandardRequirementsDrawer} from './standard-requirements-drawer';
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
  proposal?: string;
  observations?: string;
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
type Notice = { message: string; kind: 'success' | 'error' };

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


type VisualSummaryKey = 'completo' | 'parcial' | 'complementar' | 'simulado' | 'pendiente';
const VISUAL_SUMMARY_META: Record<VisualSummaryKey, { label: string; shortLabel: string }> = {
  completo: { label: 'Completo', shortLabel: 'Completo' },
  parcial: { label: 'En avance', shortLabel: 'En avance' },
  complementar: { label: 'Por complementar', shortLabel: 'Complementar' },
  simulado: { label: 'Con datos simulados', shortLabel: 'Simulados' },
  pendiente: { label: 'Pendiente', shortLabel: 'Pendiente' },
};

// Estado visual calculado a partir de los medios, nunca se guarda en la base de datos.
function summarizeStatuses(statuses: Status[]) {
  const total = statuses.length;
  const completed = statuses.filter((status) => status === 'completo').length;
  let kind: VisualSummaryKey = 'pendiente';
  if (total > 0 && completed === total) kind = 'completo';
  else if (statuses.includes('complementar')) kind = 'complementar';
  else if (statuses.includes('en_proceso')) kind = 'simulado';
  else if (completed > 0) kind = 'parcial';
  return { kind, total, completed, percent: total ? Math.round(completed / total * 100) : 0, ...VISUAL_SUMMARY_META[kind] };
}

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
const LIBRARY_PAGE_SIZE = 10;

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
  return <AuthGate>{(identity)=><ProtectedHome key={identity.id} identity={identity}/>}</AuthGate>;
}

function ProtectedHome({identity}:{identity:ApprovedIdentity}) {
  const sb = client();
  const [section, setSection] = useState<'inicio' | 'estandares' | 'biblioteca' | 'pendientes'>('inicio');
  const [standard, setStandard] = useState<number>(1);
  const [point, setPoint] = useState<string | null>('1.1');
  const [item, setItem] = useState<string | null>(null);
  const [showRequirements,setShowRequirements] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | Status>('todos');
  const [existenceFilter, setExistenceFilter] = useState<'todos' | Existence>('todos');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [libraryStandardFilter, setLibraryStandardFilter] = useState('todos');
  const [libraryPage, setLibraryPage] = useState(1);
  const [quickUpload, setQuickUpload] = useState(false);
  const [quickMedium, setQuickMedium] = useState('');
  const [quickMediaSearch, setQuickMediaSearch] = useState('');
  const [quickUploadStep, setQuickUploadStep] = useState<'select' | 'attach' | 'done'>('select');
  const [quickUploadError, setQuickUploadError] = useState('');
  const [quickSavedNames, setQuickSavedNames] = useState<string[]>([]);
  const quickFileInput = useRef<HTMLInputElement | null>(null);
  const [uploadFromMedia, setUploadFromMedia] = useState(false);
  const [explorerStatus, setExplorerStatus] = useState<'todos' | VisualSummaryKey>('todos');
  const [tracking, setTracking] = useState<Tracking[]>([]);
  const [documents, setDocuments] = useState<Evidence[]>([]);
  const [alert, setAlert] = useState<Notice | null>(null);
  const alertTimer = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<Exclude<Status, 'pendiente'> | ''>('');
  const [uploader, setUploader] = useState(identity.full_name);
  const [notes, setNotes] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Evidence | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Evidence | null>(null);
  const [feedbackDoc,setFeedbackDoc] = useState<Evidence|null>(null);
  const [commentBriefs,setCommentBriefs] = useState<DocumentCommentBrief[]>([]);
  const commentCounts=(id:string)=>commentBriefs.filter(comment=>comment.evidence_id===id).length;
  const pendingComments=(id:string)=>commentBriefs.filter(comment=>
    comment.evidence_id===id &&
    comment.comment_type==='solicitar_correccion' &&
    comment.status==='abierto'
  ).length;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequest = useRef(0);

  function dismissAlert() {
    if (alertTimer.current !== null) {
      window.clearTimeout(alertTimer.current);
      alertTimer.current = null;
    }
    setAlert(null);
  }

  function showAlert(message: string, kind: Notice['kind'] = 'error') {
    if (quickUpload && kind === 'error') setQuickUploadError(message);
    if (alertTimer.current !== null) window.clearTimeout(alertTimer.current);
    setAlert({ message, kind });
    alertTimer.current = window.setTimeout(() => {
      setAlert(null);
      alertTimer.current = null;
    }, 5000);
  }

  useEffect(() => () => {
    if (alertTimer.current !== null) window.clearTimeout(alertTimer.current);
  }, []);

  const refresh = async () => {
    if (!sb || !identity.approved) return;
    const [docsRes, trackingRes, commentRes] = await Promise.all([
      sb.from('evidencias').select('*').order('created_at', { ascending: false }),
      sb.from('seguimiento').select('*'),
      sb.from('document_comments').select('evidence_id,comment_type,status'),
    ]);
    if (docsRes.error) showAlert(`No se pudo consultar la biblioteca: ${docsRes.error.message}`);
    else setDocuments((docsRes.data || []) as Evidence[]);
    if (trackingRes.error) showAlert(`No se pudo consultar el seguimiento: ${trackingRes.error.message}`);
    else setTracking((trackingRes.data || []) as Tracking[]);
    if (commentRes.error) showAlert(`No se pudieron consultar las observaciones: ${commentRes.error.message}`);
    else setCommentBriefs((commentRes.data || []) as DocumentCommentBrief[]);
  };

  useEffect(() => {
    if (!sb || !identity.approved) return;
    let active = true;
    const reload = () => {
      if (active) void refresh();
    };
    reload();
    const channel = sb
      .channel('gestor-compartido')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evidencias' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seguimiento' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'document_comments' }, reload)
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

  const getStatus = (id: string): Status => {
  const tieneDocumentos = documents.some(
    (doc) => doc.point_id === id
  );

  if (!tieneDocumentos) {
    return 'pendiente';
  }

  return tracking.find((t) => t.point_id === id)?.status || 'pendiente';
};
  const getDocs = (id: string) => documents.filter((d) => d.point_id === id);
  const groupSummary = (items: Item[]) => summarizeStatuses(items.map((it) => getStatus(it.id)));

  const complete = all.filter((a) => getStatus(a.id) === 'completo').length;
  const simulated = all.filter((a) => getStatus(a.id) === 'en_proceso').length;
  const need = all.filter((a) => getStatus(a.id) === 'complementar').length;
  const pending = all.filter((a) => getStatus(a.id) === 'pendiente').length;
  const allPoints = standards.reduce((sum, st) => sum + st.points.length, 0);
  const numberedSubpoints = all.filter((a) => a.id.split('.').length === 3).length;
  const generalPercent = Math.round((complete / Math.max(all.length, 1)) * 100);
  const selectedStandard = standards.find((s) => s.id === standard) || standards[0];
  const quickMediaOptions = selectedStandard.points.flatMap((pt) =>
    pt.items.map((it) => ({
      id: it.id,
      point: pt.id,
      description: it.text?.trim() || normalizeType(it.type),
      type: normalizeType(it.type),
      documentCount: getDocs(it.id).length,
      status: getStatus(it.id),
    }))
  );
  const normalizedQuickSearch = quickMediaSearch.trim().toLocaleLowerCase('es');
  const visibleQuickMediaOptions = normalizedQuickSearch
    ? quickMediaOptions.filter((option) =>
        [option.id, option.point, option.description, option.type].some((field) =>
          field.toLocaleLowerCase('es').includes(normalizedQuickSearch)
        )
      )
    : quickMediaOptions;
  const selectedQuickMedia = quickMediaOptions.find((option) => option.id === quickMedium);
  const selected = all.find((a) => a.id === item) || null;
  const selectedStandardSummary = groupSummary(selectedStandard.points.flatMap((pt) => pt.items));

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

  // Datos filtrados para la vista compacta; no alteran las evidencias de Supabase.
  const filteredIds = new Set(filteredMatrixItems.map((record) => record.id));
  const visiblePoints = selectedStandard.points
    .map((pt) => ({ ...pt, visibleItems: pt.items.filter((it) => filteredIds.has(it.id)) }))
    .filter((pt) => pt.visibleItems.length > 0);

  const libraryRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return documents.flatMap((doc) => {
      const record = all.find((row) => row.id === doc.point_id);
      if (!record) return [];
      const status = getStatus(record.id);
      if (search && !`${doc.file_name} ${doc.uploader} ${doc.notes} ${record.id} ${record.standardTitle} ${record.type}`.toLowerCase().includes(search)) return [];
      if (libraryStandardFilter !== 'todos' && record.standard !== Number(libraryStandardFilter)) return [];
      if (typeFilter !== 'Todos' && normalizeType(record.type) !== typeFilter) return [];
      if (statusFilter !== 'todos' && status !== statusFilter) return [];
      return [{ doc, record, status }];
    });
  }, [documents, tracking, query, libraryStandardFilter, typeFilter, statusFilter]);

  const libraryPageCount = Math.max(1, Math.ceil(libraryRows.length / LIBRARY_PAGE_SIZE));
  const visibleLibraryRows = libraryRows.slice(
    (Math.min(libraryPage, libraryPageCount) - 1) * LIBRARY_PAGE_SIZE,
    Math.min(libraryPage, libraryPageCount) * LIBRARY_PAGE_SIZE,
  );

  const recentActivity = useMemo(() => {
    const docEvents = documents.slice(0, 3).map((d) => ({
      id: d.id,
      point_id: d.point_id,
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
        point_id: t.point_id,
        title: `Punto marcado como completo`,
        subtitle: t.point_id,
        when: new Date(t.updated_at).toLocaleDateString('es-PE'),
        type: 'estado',
      }));
    return [...docEvents, ...trackingEvents].slice(0, 4);
  }, [documents, tracking]);

  function resetFilters() {
    setExplorerStatus('todos');
    setQuery('');
    setStatusFilter('todos');
    setExistenceFilter('todos');
    setTypeFilter('Todos');
    setLibraryStandardFilter('todos');
    setLibraryPage(1);
  }

  useEffect(() => {
    setLibraryPage(1);
  }, [query, statusFilter, typeFilter, libraryStandardFilter]);

  function nav(next: 'inicio' | 'estandares' | 'biblioteca' | 'pendientes') {
    setSection(next);
    setQuickUpload(false);
    setItem(null);
    setPoint(next === 'estandares' ? standards.find((st) => st.id === standard)?.points[0]?.id || null : null);
    resetFilters();
    dismissAlert();
  }

  function openStd(id: number) {
    setQuickMedium('');
    setStandard(id);
    setSection('estandares');
    setPoint(standards.find((st) => st.id === id)?.points[0]?.id || null);
    setItem(null);
  }

  function startQuickUpload() {
    if (busy) return;
    setUploadFromMedia(false);
    setQuickMedium('');
    setQuickMediaSearch('');
    setQuickUploadError('');
    setQuickSavedNames([]);
    setQuickUploadStep('select');
    setFiles([]);
    setUploadStatus('');
    setUploader(identity.full_name);
    setNotes('');
    setQuickUpload(true);
    dismissAlert();
  }

  function openQuickUploadFor(code: string) {
    const record = all.find((row) => row.id === code);
    if (!record || busy) return;
    setStandard(record.standard);
    setQuickMedium(record.id);
    setQuickMediaSearch('');
    setQuickUploadError('');
    setQuickSavedNames([]);
    setQuickUploadStep('attach');
    setFiles([]);
    setUploadStatus('');
    setUploader(identity.full_name);
    setNotes('');
    setQuickUpload(true);
    dismissAlert();
  }

  function closeQuickUpload() {
    if (busy) return;
    setQuickUpload(false);
    setQuickUploadError('');
    setQuickUploadStep('select');
  }

  function checkQuickUploadFiles(chosen: File[]) {
    const allowed = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'];
    const invalid = chosen.find((file) => {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      return !allowed.includes(ext) || file.size > 15 * 1024 * 1024;
    });
    if (invalid) {
      setQuickUploadError('Archivo no permitido: ' + invalid.name + '. Usa PDF, Word, Excel o imágenes de hasta 15 MB por archivo.');
      return;
    }
    setQuickUploadError('');
    setFiles((previous) => {
      const unique = new Map<string, File>();
      [...previous, ...chosen].forEach((file) =>
        unique.set(file.name + '-' + file.size + '-' + file.lastModified, file)
      );
      return Array.from(unique.values());
    });
  }

  function openItem(code: string, forUpload = false) {
    const record = all.find((row) => row.id === code);
    if (!record) return;
    setQuickUpload(false);
    setSection('estandares');
    setStandard(record.standard);
    setPoint(record.point);
    setItem(record.id);
    setShowRequirements(false);
    setUploadFromMedia(forUpload);
    setFiles([]);
    setUploadStatus('');
    setUploader(identity.full_name);
    setNotes('');
    dismissAlert();
  }



  async function upload() {
  const target = quickUpload ? all.find((row) => row.id === quickMedium) || null : selected;
  if (!sb || !target || busy || !identity.approved) return;
  const {data:{user:verified},error:verificationError}=await sb.auth.getUser();
  if(verificationError || verified?.id !== identity.id) {
    showAlert('La sesión caducó. Vuelve a ingresar.');
    return;
  }

  if (!uploadStatus) {
    showAlert('Debes seleccionar el estado del medio.');
    return;
  }

  if (!files.length && (quickUpload || getDocs(target.id).length === 0)) {
    showAlert('Debes adjuntar al menos un documento.');
    return;
  }
    const whitelist = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'];
    const invalid = files.find((file) => {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      return !whitelist.includes(ext) || file.size > 15 * 1024 * 1024;
    });
    if (invalid) {
      showAlert(`Archivo no válido: ${invalid.name}. Admite PDF, Word, Excel e imágenes hasta 15 MB.`);
      return;
    }
    setBusy(true);
    dismissAlert();
    try {
    for (const file of files) {
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
        showAlert(`Error al subir ${file.name}: ${uploadErr.message}`);
        setBusy(false);
        return;
      }
      const { error: dbErr } = await sb.from('evidencias').insert({
        point_id: target.id,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || 'application/pdf',
        size_bytes: file.size,
        uploader: identity.full_name,
        uploaded_by: identity.id,
        notes: notes.trim(),
      });
      if (dbErr) {
        await sb.storage.from('evidencias').remove([path]);
        showAlert(`Error al registrar ${file.name}: ${dbErr.message}`);
        setBusy(false);
        return;
      }
    }
    const { error: statusError } = await sb
  .from('seguimiento')
  .upsert(
    {
      point_id: target.id,
      status: uploadStatus,
      notes: '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'point_id' }
  );

if (statusError) {
  showAlert(
    `No se pudo guardar el estado: ${statusError.message}`
  );
  await refresh();
  setBusy(false);
  return;
}

const savedNames = files.map((file) => file.name);
setFiles([]);
setUploader(identity.full_name);
setNotes('');
setUploadStatus('');

await refresh();
if (quickUpload) {
  setQuickSavedNames(savedNames);
  setQuickUploadError('');
  setQuickUploadStep('done');
} else {
  showAlert('Documentos y estado guardados correctamente.', 'success');
}
setBusy(false);
    } catch (error) {
      showAlert('No se pudo completar la carga: ' + (error instanceof Error ? error.message : 'error inesperado'));
      setBusy(false);
    }
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
      showAlert(error?.message || 'No se pudo abrir el documento');
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
      showAlert(error?.message || 'No se pudo descargar el documento');
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
    dismissAlert();
    try {
      if(!sb) throw new Error('Debes iniciar sesión para eliminar.');
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.access_token) throw new Error('Sesión expirada. Vuelve a ingresar.');
      const response = await fetch('/api/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el documento');
      setDeleteTarget(null);
      showAlert('Documento eliminado correctamente.', 'success');
      await refresh();
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo eliminar el documento');
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

  useEffect(() => {
    if (!quickUpload) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closeQuickUpload();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [quickUpload, busy]);

  const menu = [
    { id: 'inicio', title: 'Inicio', icon: LayoutDashboard },
    { id: 'estandares', title: 'Estándares', icon: Layers3 },
    { id: 'biblioteca', title: 'Biblioteca', icon: Library },
  ] as const;

  return (
    <div className="shell shell-modern shell-horizontal">
      <div className="main main-horizontal">
        <header className="topbar topbar-modern simple-topbar">
          <button type="button" className="simple-brand" onClick={() => nav('inicio')} aria-label="Ir a Inicio">
            <span className="simple-brand-symbol"><Landmark size={23} /></span>
            <span className="simple-brand-copy">
              <strong>UNFV <span className="simple-brand-divider" aria-hidden="true" /> Gestión de Calidad</strong>
              <small>Facultad de Derecho</small>
            </span>
          </button>
          <nav className="simple-main-nav" aria-label="Secciones principales">
            {menu.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={section === entry.id ? 'simple-nav-button is-active' : 'simple-nav-button'}
                onClick={() => nav(entry.id)}
                aria-current={section === entry.id ? 'page' : undefined}
              >
                <entry.icon size={17} />
                <span>{entry.title}</span>
              </button>
            ))}
          </nav>
          <div className="simple-header-search">
            <Search size={17} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => {
                const next = e.target.value;
                setQuery(next);
                if (next.trim() && (section === 'inicio' || item)) {
                  setSection('estandares');
                  setItem(null);
                  setQuickUpload(false);
                }
              }}
              placeholder={section === 'biblioteca' ? 'Buscar documentos...' : 'Buscar estándares y medios...'}
              aria-label="Buscar estándares, medios y documentos"
            />
            {query && (
              <button type="button" className="simple-search-clear" onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><X size={15}/></button>
            )}
          </div>
          <div className="unfv-account-menu">
            <span className="unfv-account-name"><UserRound size={15}/>{identity.full_name}</span>
            <button type="button" className="unfv-sign-out" onClick={()=>void sb?.auth.signOut()} title="Cerrar sesión">
              <LogOut size={16}/><span>Salir</span>
            </button>
          </div>
          <button type="button" className="header-upload-button" onClick={startQuickUpload}>
            <Upload size={17} aria-hidden="true" />
            <span>Cargar documento</span>
          </button>
        </header>

        <div className="container page-modern">

          {quickUpload && (
            <div className="quick-upload-overlay" role="presentation"
              onMouseDown={(event) => { if (event.target === event.currentTarget) closeQuickUpload(); }}>
              <section className="quick-upload-dialog quick-upload-wizard" role="dialog" aria-modal="true"
                aria-labelledby="quick-upload-title">
                <div className="quick-upload-heading">
                  <span className="quick-upload-icon">{quickUploadStep === 'done' ? <CheckCircle2 size={21}/> : <Upload size={21}/>}</span>
                  <div>
                    <h2 id="quick-upload-title">{quickUploadStep === 'done' ? 'Documento registrado' : 'Cargar documento'}</h2>
                    <p>{quickUploadStep === 'select'
                      ? 'Primero selecciona el estándar y el medio de logro.'
                      : quickUploadStep === 'attach'
                      ? 'Adjunta el archivo y completa los datos de registro.'
                      : 'La información se guardó correctamente.'}</p>
                  </div>
                  <button type="button" className="quick-upload-close" disabled={busy}
                    onClick={closeQuickUpload} aria-label="Cerrar formulario"><X size={18}/></button>
                </div>

                <div className="quick-wizard-steps" aria-label="Progreso del registro">
                  <span className={quickUploadStep === 'select' ? 'is-current' : 'is-completed'}>
                    <b>1</b> Medio
                  </span>
                  <span className={quickUploadStep === 'attach' ? 'is-current' : quickUploadStep === 'done' ? 'is-completed' : ''}>
                    <b>2</b> Documento
                  </span>
                  <span className={quickUploadStep === 'done' ? 'is-current' : ''}>
                    <b>3</b> Confirmación
                  </span>
                </div>

                {quickUploadStep === 'select' && (
                  <div className="quick-upload-fields">
                    <label htmlFor="quick-standard">Estándar
                      <select id="quick-standard" value={standard}
                        onChange={(event) => {
                          setStandard(Number(event.target.value));
                          setQuickMedium('');
                          setQuickMediaSearch('');
                          setQuickUploadError('');
                        }}>
                        {standards.map((st) =>
                          <option key={st.id} value={st.id}>E{String(st.id).padStart(2, '0')} — {st.title.slice(0, 66)}{st.title.length > 66 ? '…' : ''}</option>
                        )}
                      </select>
                    </label>
                    <div className="quick-upload-media-picker">
                      <label htmlFor="quick-media-search">Buscar medio de logro</label>
                      <div className="quick-media-search">
                        <Search size={17} aria-hidden="true"/>
                        <input id="quick-media-search" type="search"
                          placeholder="Código o palabra clave (ej.: 1.1.2, matriz)"
                          value={quickMediaSearch}
                          onChange={(event) => setQuickMediaSearch(event.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="quick-media-results-summary" role="status">
                        <span>{visibleQuickMediaOptions.length} de {quickMediaOptions.length} medios</span>
                        <span>Selecciona uno para continuar</span>
                      </div>
                      <div className="quick-media-results" aria-label="Resultados de medios de logro">
                        {visibleQuickMediaOptions.length ? visibleQuickMediaOptions.map((option) => (
                          <button key={option.id} type="button"
                            className={quickMedium === option.id ? 'quick-media-result is-selected' : 'quick-media-result'}
                            aria-pressed={quickMedium === option.id}
                            onClick={() => { setQuickMedium(option.id); setQuickUploadError(''); }}
                            title={option.id + ' — ' + option.description}>
                            <span className="quick-media-result-code">{option.id}</span>
                            <span className="quick-media-result-text">
                              <strong>{option.description}</strong>
                              <small>Punto {option.point} · {option.type}</small>
                            </span>
                            <span className="quick-media-result-indicators">
                              <span className={'quick-media-state state-' + option.status}>
                                {option.status === 'completo' && <CheckCircle2 size={13}/>}
                                {STATUS_META[option.status].name}
                              </span>
                              <span className={option.documentCount ? 'quick-media-docs has-docs' : 'quick-media-docs'}>
                                <Paperclip size={12}/>{option.documentCount ? 'Documento: Completo · ' + option.documentCount + ' archivo(s)' : 'Documento: Pendiente'}
                              </span>
                            </span>
                            {quickMedium === option.id
                              ? <CheckCircle2 size={18} color="#19835b" aria-hidden="true"/>
                              : <ChevronRight size={16} aria-hidden="true"/>}
                          </button>
                        )) : (
                          <div className="quick-media-no-results">
                            No hay medios que coincidan. Prueba con el código o una palabra de la descripción.
                          </div>
                        )}
                      </div>
                      {selectedQuickMedia && (
                        <p className="quick-media-selected" role="status">
                          <CheckCircle2 size={15} aria-hidden="true"/>
                          Seleccionado: <strong>{selectedQuickMedia.id}</strong> — {selectedQuickMedia.type}
                          {selectedQuickMedia.documentCount > 0 && (
                            <span> · {selectedQuickMedia.documentCount} documento(s) cargado(s)</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {quickUploadStep === 'attach' && (
                  <div className="quick-upload-attach">
                    <div className="quick-selected-medium">
                      <span className="quick-selected-medium-icon"><FileText size={19}/></span>
                      <div>
                        <small>Medio de logro seleccionado</small>
                        <strong>{quickMedium} · {selectedQuickMedia?.description || 'Documento'}</strong>
                        {selectedQuickMedia && (
                          <span className="quick-current-status">
                            Estado actual: <b>{STATUS_META[selectedQuickMedia.status].name}</b> · {selectedQuickMedia.documentCount} archivo(s)
                          </span>
                        )}
                      </div>
                      <button type="button" disabled={busy} onClick={() => setQuickUploadStep('select')}>Cambiar</button>
                    </div>
                    <div className="quick-attach-fields">
                      <label className="quick-dropzone" htmlFor="quick-upload-files"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (!busy) checkQuickUploadFiles(Array.from(event.dataTransfer.files));
                        }}>
                        <Upload size={24}/>
                        <strong>Arrastra archivos o haz clic para seleccionarlos</strong>
                        <small>PDF, Word, Excel o imágenes · Máximo 15 MB por archivo</small>
                        <span>Seleccionar archivos</span>
                        <input ref={quickFileInput} id="quick-upload-files" type="file" multiple
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                          disabled={busy} onChange={(event) => {
                            checkQuickUploadFiles(Array.from(event.target.files || []));
                            event.target.value = '';
                          }}/>
                      </label>
                      {files.length > 0 && (
                        <div className="quick-attached-list" aria-label="Archivos preparados para subir">
                          {files.map((file,index) => (
                            <div key={file.name + '-' + file.size + '-' + file.lastModified}>
                              <FileText size={17}/>
                              <span title={file.name}>{file.name}</span>
                              <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                              <button type="button" disabled={busy} aria-label={'Quitar ' + file.name}
                                onClick={() => setFiles((current) => current.filter((_,i) => i !== index))}>
                                <X size={15}/>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label htmlFor="quick-upload-status">Estado del medio <b>*</b>
                        <select id="quick-upload-status" value={uploadStatus} disabled={busy}
                          onChange={(event) => setUploadStatus(event.target.value as Exclude<Status,'pendiente'> | '')}>
                          <option value="">Selecciona el estado...</option>
                          <option value="completo">Completo</option>
                          <option value="en_proceso">Con datos simulados</option>
                          <option value="complementar">Por complementar</option>
                        </select>
                      </label>
                      <div className="quick-attach-two-cols">
                        <label htmlFor="quick-upload-uploader">Registrado por
                          <input id="quick-upload-uploader" value={identity.full_name} disabled readOnly title="Nombre de tu cuenta"/>
                        </label>
                        <label htmlFor="quick-upload-notes">Observación (opcional)
                          <input id="quick-upload-notes" value={notes} disabled={busy}
                            onChange={(event) => setNotes(event.target.value)} placeholder="Detalle del documento"/>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {quickUploadStep === 'done' && (
                  <div className="quick-upload-success" role="status">
                    <CheckCircle2 size={48}/>
                    <h3>¡Registro completado!</h3>
                    <p>{quickSavedNames.length} documento(s) registrado(s) en el medio <strong>{quickMedium}</strong>.</p>
                    <div className="quick-success-files">
                      {quickSavedNames.map((name,index) => (
                        <div key={name + index}><FileText size={15}/><span>{name}</span></div>
                      ))}
                    </div>
                  </div>
                )}

                {quickUploadError && <div className="quick-upload-error" role="alert">
                  <CircleAlert size={16}/><span>{quickUploadError}</span>
                </div>}
                {quickUploadStep !== 'done' && !sb && (
                  <div className="quick-upload-error" role="alert">No hay conexión con Supabase para cargar documentos.</div>
                )}

                <div className="quick-upload-actions">
                  {quickUploadStep === 'select' && (
                    <>
                      <button type="button" className="quick-upload-cancel" onClick={closeQuickUpload}>Cancelar</button>
                      <button type="button" className="quick-upload-continue" disabled={!quickMedium || !sb}
                        onClick={() => { setQuickUploadStep('attach'); setQuickUploadError(''); }}>
                        Continuar <ChevronRight size={16}/>
                      </button>
                    </>
                  )}
                  {quickUploadStep === 'attach' && (
                    <>
                      <button type="button" disabled={busy} className="quick-upload-cancel" onClick={() => setQuickUploadStep('select')}>
                        <ArrowLeft size={15}/> Volver
                      </button>
                      <button type="button" className="quick-upload-continue"
                        disabled={busy || !files.length || !uploadStatus || !sb}
                        onClick={() => void upload()}>
                        <Upload size={16}/> {busy ? 'Guardando documentos...' : 'Guardar documentos'}
                      </button>
                    </>
                  )}
                  {quickUploadStep === 'done' && (
                    <>
                      <button type="button" className="quick-upload-cancel" onClick={() => {
                        setQuickUploadStep('select');
                        setFiles([]); setQuickMedium(''); setQuickMediaSearch('');
                        setUploadStatus(''); setNotes(''); setUploader(identity.full_name); setQuickSavedNames([]);
                      }}>Cargar otro documento</button>
                      <button type="button" className="quick-upload-continue" onClick={closeQuickUpload}>
                        Finalizar <CheckCircle2 size={16}/>
                      </button>
                    </>
                  )}
                </div>
              </section>
            </div>
          )}

          {alert && (
            <div className={`toast-notice ${alert.kind}`} role={alert.kind === 'error' ? 'alert' : 'status'} aria-live={alert.kind === 'error' ? 'assertive' : 'polite'}>
              <span className="toast-icon">{alert.kind === 'success' ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}</span>
              <span className="toast-message">{alert.message}</span>
              <button type="button" onClick={dismissAlert} aria-label="Cerrar notificación">×</button>
              <span className="toast-progress" aria-hidden="true" />
            </div>
          )}

          {!selected && section !== 'estandares' && (
            <div className={section === 'inicio' ? 'page-heading page-hero with-photo home-v2-hero' : 'page-heading page-hero with-photo'}>
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-dot" /> SISTEMA DE AUTOEVALUACIÓN Y ACREDITACIÓN
                </div>
                <h1>{section === 'inicio' ? 'Panel de control' : title}</h1>
                <p>{section === 'inicio' ? 'Seguimiento del sistema de autoevaluación y acreditación.' : 'Información y evidencias organizadas para trabajar con claridad, en un solo lugar.'}</p>
              </div>
              <div className="heading-badge">
                <BookOpen size={18} /> 18 estándares
              </div>
            </div>
          )}

          {section === 'inicio' && !selected && (
            <div className="home-v2">
              <div className="home-v2-overview">
                <section className="home-v2-card home-v2-main-progress" aria-label="Avance de acreditación">
                  <div className="home-v2-section-heading">
                    <span className="home-v2-title-icon"><CheckCircle2 size={22}/></span>
                    <h2>Avance de acreditación</h2>
                  </div>
                  <div className="home-v2-progress-content">
                    <div
                      className="home-v2-progress-ring"
                      style={{ ['--progress' as string]: `${generalPercent}%` } as CSSProperties}
                      aria-label={`Avance total de ${generalPercent} por ciento`}
                      role="img"
                    >
                      <div>
                        <strong>{generalPercent}%</strong>
                        <span>Avance general</span>
                      </div>
                    </div>
                    <div className="home-v2-progress-description">
                      <strong>{complete} de {all.length}</strong>
                      <span>medios de logro completados</span>
                      <div className="home-v2-progress-line" aria-hidden="true">
                        <span style={{ width: `${generalPercent}%` }} />
                      </div>
                      <div className="home-v2-progress-totals">
                        <span><Layers3 size={16}/><b>{standards.length}</b><small>Estándares</small></span>
                        <span><ClipboardList size={16}/><b>{allPoints}</b><small>Puntos</small></span>
                        <span><FileText size={16}/><b>{all.length}</b><small>Medios</small></span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="home-v2-card home-v2-status-card">
                  <div className="home-v2-section-heading">
                    <h2>Estado de medios de logro</h2>
                  </div>
                  <div className="home-v2-status-list">
                    {([
                      { key: 'complete', label: 'Completos', value: complete },
                      { key: 'simulated', label: 'Con datos simulados', value: simulated },
                      { key: 'needs', label: 'Por complementar', value: need },
                      { key: 'pending', label: 'Pendientes', value: pending },
                    ] as const).map((entry) => (
                      <div key={entry.key} className="home-v2-status-row">
                        <span className={`home-v2-status-dot ${entry.key}`} aria-hidden="true" />
                        <span>{entry.label}</span>
                        <strong>{entry.value}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="home-v2-card home-v2-quick-actions">
                  <div className="home-v2-section-heading">
                    <span className="home-v2-bolt"><Upload size={19} /></span>
                    <h2>Acciones rápidas</h2>
                  </div>
                  <button type="button" className="home-v2-primary-action" onClick={startQuickUpload}>
                    <Upload size={18}/> Registrar evidencia
                  </button>
                  <button type="button" className="home-v2-secondary-action" onClick={() => nav('biblioteca')}>
                    <Library size={18}/> Ver biblioteca documental
                  </button>
                  <p>Gestiona las evidencias desde el medio de logro correspondiente.</p>
                </section>
              </div>

              <div className="home-v2-bottom">
                <section className="home-v2-card home-v2-standards">
                  <div className="home-v2-block-heading">
                    <div className="home-v2-heading-left">
                      <Layers3 size={21}/>
                      <h2>Estándares y su avance</h2>
                    </div>
                    <span>{standards.length} estándares</span>
                  </div>
                  <div className="home-v2-standards-list">
                    {standards.slice(0, 3).map((st) => {
                      const stItems = st.points.flatMap((pt) => pt.items);
                      const summary = groupSummary(stItems);
                      return (
                        <button
                          type="button"
                          key={st.id}
                          className="home-v2-standard-row"
                          onClick={() => openStd(st.id)}
                          aria-label={`Consultar estándar ${st.id}, ${summary.completed} de ${summary.total} medios completos`}
                        >
                          <span className="home-v2-standard-code">E{String(st.id).padStart(2, '0')}</span>
                          <span className="home-v2-standard-info">
                            <strong>{st.title}</strong>
                            <small>{st.points.length} puntos · {summary.total} medios de logro</small>
                            <span className="home-v2-standard-track" aria-hidden="true">
                              <span style={{ width: `${summary.percent}%` }}/>
                            </span>
                          </span>
                          <span className="home-v2-standard-fraction">{summary.completed}/{summary.total}</span>
                          <span className={`home-v2-mini-status status-${summary.kind}`}>{summary.label}</span>
                          <ChevronRight size={17} className="home-v2-row-chevron"/>
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" className="home-v2-see-all" onClick={() => nav('estandares')}>
                    Ver todos los estándares <ChevronRight size={17}/>
                  </button>
                </section>

                <section className="home-v2-card home-v2-recent">
                  <div className="home-v2-block-heading">
                    <div className="home-v2-heading-left">
                      <span className="home-v2-recent-clock"><ClipboardList size={19}/></span>
                      <h2>Actividad reciente</h2>
                    </div>
                    <button type="button" className="home-v2-recent-more" onClick={() => nav('biblioteca')}>
                      Ver biblioteca <ChevronRight size={15}/>
                    </button>
                  </div>
                  <div className="home-v2-activity-list">
                    {recentActivity.length ? recentActivity.slice(0, 3).map((event) => (
                      <button
                        type="button"
                        key={event.type + '-' + event.id}
                        className="home-v2-activity"
                        disabled={!all.some((row) => row.id === event.point_id)}
                        onClick={() => { resetFilters(); openItem(event.point_id); }}
                        title={`Abrir ficha ${event.point_id}`}
                      >
                        <span className={`home-v2-activity-file ${event.type}`}><FileText size={21}/></span>
                        <span className="home-v2-activity-details">
                          <strong>{event.title}</strong>
                          <small>{event.subtitle}</small>
                        </span>
                        <span className="home-v2-activity-date">{event.when}</span>
                        <ChevronRight size={16}/>
                      </button>
                    )) : <div className="home-v2-empty">Todavía no hay actividad registrada.</div>}
                  </div>
                </section>
              </div>
            </div>
          )}

          {section === 'estandares' && !selected && (
            <>
              <div className="tri-intro">
                <div>
                  <span className="tri-kicker">GESTIÓN DE CALIDAD · FACULTAD DE DERECHO</span>
                  <h1>Explorador de estándares</h1>
                  <p>Consulta el avance de cada estándar y accede a sus evidencias.</p>
                </div>
                <span className="tri-overview-count"><Layers3 size={16}/>{standards.length} estándares</span>
              </div>
              <div className="tri-overview-bar">
                <div><Layers3 size={19}/><strong>{standards.length}</strong><span>Estándares</span></div>
                <div><ClipboardList size={19}/><strong>{allPoints}</strong><span>Puntos</span></div>
                <div><FileText size={19}/><strong>{all.length}</strong><span>Medios de logro</span></div>
                <div className="tri-overview-progress">
                  <span>Avance general</span>
                  <strong>{generalPercent}%</strong>
                  <span className="tri-progress"><span style={{ width: generalPercent + '%' }} /></span>
                  <small>{complete} de {all.length} completados</small>
                </div>
              </div>
              <div className="tri-workspace">
                <section className="tri-standards" aria-label="Lista de estándares">
                  <header className="tri-panel-title">
                    <h2>Estándares <span>({standards.length})</span></h2>
                  </header>
                  <details className="tri-standards-filter-dropdown">
                    <summary><Filter size={15}/> Filtrar lista <ChevronRight size={15}/></summary>
                    <aside className="tri-filters" aria-label="Filtros del explorador">
                  <div className="tri-panel-title">
                    <h2><Filter size={17}/> Filtros</h2>
                    <button type="button" onClick={resetFilters}>Limpiar</button>
                  </div>
                  <fieldset className="tri-filter-options">
                    <legend>Estado del estándar</legend>
                    {([
                      { value:'todos',label:'Todos' },
                      { value:'completo',label:'Completo' },
                      { value:'parcial',label:'En avance' },
                      { value:'complementar',label:'Por complementar' },
                      { value:'simulado',label:'Con datos simulados' },
                      { value:'pendiente',label:'Pendiente' },
                    ] as const).map((option) => {
                      const count = option.value === 'todos' ? standards.length : standards.filter((st) => groupSummary(st.points.flatMap((pt) => pt.items)).kind === option.value).length;
                      return (
                        <label key={option.value} className={explorerStatus === option.value ? 'tri-filter-item is-checked' : 'tri-filter-item'}>
                          <input type="radio" name="tri-standard-status" checked={explorerStatus === option.value}
                            onChange={() => setExplorerStatus(option.value)}/>
                          <span>{option.label}</span><small>{count}</small>
                        </label>
                      );
                    })}
                  </fieldset>
                  <details className="tri-extra-filters">
                    <summary>Más filtros <ChevronRight size={14}/></summary>
                    <div className="tri-extra-fields">
                      <label>Estado del medio
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'todos' | Status)}>
                          <option value="todos">Todos</option>
                          {Object.entries(STATUS_META).map(([key,meta]) => <option key={key} value={key}>{meta.name}</option>)}
                        </select>
                      </label>
                      <label>Existencia en matriz
                        <select value={existenceFilter} onChange={(e) => setExistenceFilter(e.target.value as 'todos' | Existence)}>
                          {EXISTENCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </label>
                      <label>Tipo de documento
                        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                          {TYPE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </label>
                    </div>
                  </details>
                </aside>
                  </details>
                  <div className="tri-standard-list">
                    {standards.filter((st) => {
                      const summary = groupSummary(st.points.flatMap((pt) => pt.items));
                      if (explorerStatus !== 'todos' && summary.kind !== explorerStatus) return false;
                      if (query.trim() || statusFilter !== 'todos' || existenceFilter !== 'todos' || typeFilter !== 'Todos')
                        return st.points.some((pt) => pt.items.some((it) => filteredIds.has(it.id)));
                      return true;
                    }).map((st) => {
                      const summary = groupSummary(st.points.flatMap((pt) => pt.items));
                      return (
                        <button type="button" key={st.id}
                          className={standard === st.id ? 'tri-standard-item is-active' : 'tri-standard-item'}
                          onClick={() => openStd(st.id)}
                          aria-current={standard === st.id ? 'true' : undefined}
                          title={st.title}>
                          <span className="tri-standard-code">E{String(st.id).padStart(2,'0')}</span>
                          <span className="tri-standard-copy">
                            <strong>{st.title}</strong>
                            <span className="tri-standard-progressline"><span style={{width: summary.percent + '%'}}/></span>
                            <small>{summary.completed}/{summary.total} medios</small>
                          </span>
                          <span className="tri-standard-right">
                            <span className={'tri-standard-state state-' + summary.kind}>{summary.percent}%</span>
                            <ChevronRight size={16}/>
                          </span>
                        </button>
                      );
                    })}
                    {!standards.some((st) => {
                      const summary = groupSummary(st.points.flatMap((pt) => pt.items));
                      return (explorerStatus === 'todos' || summary.kind === explorerStatus) &&
                        (!query.trim() && statusFilter === 'todos' && existenceFilter === 'todos' && typeFilter === 'Todos' ||
                          st.points.some((pt) => pt.items.some((it) => filteredIds.has(it.id))));
                    }) && (
                      <div className="tri-no-results">No hay estándares con esos filtros.
                        <button type="button" onClick={resetFilters}>Limpiar filtros</button>
                      </div>
                    )}
                  </div>
                </section>
                <section className="tri-details" aria-label="Detalle del estándar seleccionado">
                  <div className="tri-selected-header">
                    <div className="tri-selected-code">E{String(selectedStandard.id).padStart(2,'0')}</div>
                    <div className="tri-selected-heading">
                      <span className="tri-kicker">ESTÁNDAR {selectedStandard.id}</span>
                      <h2>{selectedStandard.title}</h2>
                      <p>{selectedStandard.points.length} puntos de evaluación · {selectedStandardSummary.total} medios de logro</p>
                    </div>
                    <div className="tri-selected-progress">
                      <span className={'quiet-status-badge status-' + selectedStandardSummary.kind}>{selectedStandardSummary.label}</span>
                      <strong>{selectedStandardSummary.percent}%</strong>
                      <div className="tri-progress"><span style={{width:selectedStandardSummary.percent+'%'}}/></div>
                    </div>
                    <button type="button" className="tri-add-button" onClick={startQuickUpload}><Upload size={16}/> Cargar documento</button>
                  </div>
                  <div className="tri-points-head">
                    <div><h3>Puntos de evaluación</h3><p>Selecciona un punto para ver sus medios de logro.</p></div>
                    <details className="tri-standard-info">
                      <summary><FileText size={15}/> Información del estándar</summary>
                      <div><strong>{selectedStandard.title}</strong><p>{selectedStandard.points.length} puntos de evaluación y {selectedStandardSummary.total} medios registrados en la matriz.</p></div>
                    </details>
                  </div>
                  <div className="tri-points-list">
                    {visiblePoints.length ? visiblePoints.map((pt) => {
                      const summary = groupSummary(pt.items);
                      const expanded = point === pt.id || Boolean(query.trim());
                      return (
                        <article className={expanded ? 'tri-point is-open' : 'tri-point'} key={pt.id}>
                          <button type="button" className="tri-point-head"
                            aria-expanded={expanded}
                            onClick={() => setPoint(point === pt.id ? null : pt.id)}>
                            <span className="tri-point-code">{pt.id}</span>
                            <span className="tri-point-name">
                              <strong>Punto {pt.id}</strong>
                              <small title={pt.criterion}>{pt.criterion}</small>
                            </span>
                            <span className="tri-point-total">{summary.completed}/{summary.total} medios</span>
                            <span className={'quiet-status-badge status-' + summary.kind}>{summary.label}</span>
                            <ChevronRight className="tri-point-arrow" size={16}/>
                          </button>
                          {expanded && (
                            <div className="tri-point-body">
                              <div className="tri-point-toolbar">
                                <h4>Medios de logro ({pt.visibleItems.length})</h4>
                                <details>
                                  <summary><FileText size={14}/> Criterio completo</summary>
                                  <p>{pt.criterion}</p>
                                </details>
                              </div>
                              <div className="tri-media-list">
                                {pt.visibleItems.map((it) => (
                                  <div className="tri-media-item" key={it.id}>
                                    <button type="button" className="tri-media-main"
                                      onClick={() => openItem(it.id)} title={'Ver información de ' + it.id}>
                                      <span className="tri-media-code">{it.id}</span>
                                      <span className="tri-media-description">
                                        <strong title={it.text || normalizeType(it.type)}>{it.text?.trim() || normalizeType(it.type)}</strong>
                                        <small>{normalizeType(it.type)}</small>
                                      </span>
                                    </button>
                                    <span className={'quiet-status-badge status-' + getStatus(it.id)}>{STATUS_META[getStatus(it.id)].name}</span>
                                    <span className="tri-media-files"><Paperclip size={14}/>{getDocs(it.id).length}</span>
                                    <button type="button" className="tri-media-upload" onClick={() => openQuickUploadFor(it.id)}
                                      aria-label={'Cargar documento en el medio ' + it.id}>
                                      <Upload size={15}/> Cargar documento
                                    </button>
                                    <button type="button" className="tri-media-detail" onClick={() => openItem(it.id)}
                                      aria-label={'Ver ficha del medio ' + it.id}>
                                      Ver ficha <ChevronRight size={15}/>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    }) : (
                      <div className="tri-no-results">No hay puntos coincidentes con la búsqueda.
                        <button type="button" onClick={resetFilters}>Limpiar filtros</button>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}

          
{selected && (
  <section className="evidence-page">

    {/* Cabecera compacta: lo esencial primero y el detalle bajo demanda. */}
    <div className="evidence-heading evidence-heading-refined">
      <button
        type="button"
        className="back"
        onClick={() => {setItem(null);setShowRequirements(false);}}
      >
        <ArrowLeft size={16} />
        Estándar {selected.standard} / Medio {selected.id}
      </button>

      <div className="evidence-hero">
        <div className="evidence-hero-icon"><FileText size={27} aria-hidden="true" /></div>
        <div className="evidence-hero-description">
          <span className="evidence-standard-pill">Estándar {selected.standard} · {selected.standardTitle}</span>
          <h1>Medio de logro {selected.id}</h1>
          <p>{selected.text || selected.criterion}</p>
        </div>
      </div>

      <div className="evidence-key-actions">
        <div className="evidence-key-metrics" aria-label="Resumen del medio">
          <span className={'evidence-key-chip evidence-key-status state-' + getStatus(selected.id)}>
            {getStatus(selected.id) === 'completo' ? <CheckCircle2 size={16}/> : <Info size={16}/>}
            Estado: {STATUS_META[getStatus(selected.id)].name}
          </span>
          <span className="evidence-key-chip"><FileText size={16}/>{getDocs(selected.id).length} documento(s)</span>
          <span className="evidence-key-chip">
            <MessageCircle size={16}/>
            {getDocs(selected.id).reduce((total,doc)=>total+commentCounts(doc.id),0)} comentario(s)
          </span>
        </div>
        <button type="button" className="requirements-view-button" onClick={()=>setShowRequirements(true)}>
          <BookOpen size={17}/> Ver qué solicita este medio <ChevronRight size={17}/>
        </button>
      </div>
    </div>

    {/* CARGA Y ESTADO */}
    <div className="evidence-top-grid evidence-top-grid-refined">

      <div className="evidence-card evidence-upload" id="carga-evidencia">
        <div className="evidence-card-title">
          <span className="evidence-card-title-icon"><Upload size={21} /></span>
          <div className="evidence-upload-title">
            <h2>{uploadFromMedia ? 'Cargar documento' : 'Subir documento'}</h2>
            <small>Adjunta el archivo que sustenta este medio de logro.</small>
          </div>
          <span className="evidence-upload-medium">Medio {selected.id}</span>
        </div>

        {!sb && (
          <p className="upload-connection-warning">
            No se ha configurado la conexión con Supabase.
          </p>
        )}

        <label
          className="evidence-dropzone evidence-dropzone-refined"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!sb || busy) return;
            setFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <Upload size={24} />
          <div>
            <strong>
              {files.length
                ? files.map(f => f.name).join(', ')
                : 'Arrastra archivos o selecciónalos'}
            </strong>
            <small>PDF, Word, Excel o imágenes · Máximo 15 MB por archivo</small>
          </div>
          <span className="evidence-select-file">
            Seleccionar archivos
          </span>

          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            disabled={!sb || busy}
            onChange={(e) =>
              setFiles(Array.from(e.target.files || []))
            }
          />
        </label>

        <div className="evidence-form-grid">
          <div className="evidence-field">
            <label htmlFor="evidence-uploader">Registrado por</label>
            <input id="evidence-uploader" value={identity.full_name} disabled readOnly title="Nombre de tu cuenta"/>
          </div>

          <div className="evidence-field">
            <label htmlFor="evidence-notes">
              Observación <small>(opcional)</small>
            </label>
            <textarea
              id="evidence-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Información complementaria"
              rows={2}
            />
          </div>
        </div>

        <div className="evidence-form-footer">
          <div className="evidence-field">
            <label htmlFor="evidence-status">
              Estado del medio <b>*</b>
            </label>

            <select
              id="evidence-status"
              value={uploadStatus}
              disabled={
                !sb ||
                busy ||
                (!files.length &&
                  getDocs(selected.id).length === 0)
              }
              onChange={(e) =>
                setUploadStatus(
                  e.target.value as
                    Exclude<Status, 'pendiente'> | ''
                )
              }
            >
              <option value="">Selecciona un estado...</option>
              <option value="completo">Completo</option>
              <option value="complementar">
                Por complementar
              </option>
              <option value="en_proceso">
                Completo, pero con datos simulados
              </option>
            </select>
          </div>

          <button
            className="primary-button"
            disabled={
              !sb ||
              busy ||
              !uploadStatus ||
              (!files.length &&
                getDocs(selected.id).length === 0)
            }
            onClick={upload}
          >
            {busy
              ? 'Guardando...'
              : files.length
                ? 'Guardar documento y estado'
                : 'Guardar estado'}
          </button>
        </div>
      </div>

      {/* El estado ya se muestra en el resumen superior para evitar duplicidad. */}
    </div>

    {/* DOCUMENTOS ADJUNTOS */}
    <div className="evidence-card evidence-documents">
      <div className="evidence-documents-heading">
        <div>
          <h2>
            <Paperclip size={20} />
            Documentos adjuntos
          </h2>
          <small className="evidence-documents-count">{getDocs(selected.id).length} archivo(s)</small>
        </div>

        <button
          type="button"
          className="evidence-add-button"
          onClick={() =>
            document.getElementById('carga-evidencia')
              ?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              })
          }
        >
          <Upload size={15}/> Agregar documento
        </button>
      </div>

      {getDocs(selected.id).length > 0 ? (
        <>
          <div className="evidence-table-header">
            <span>Archivo</span>
            <span>Fecha</span>
            <span>Colaborador</span>
            <span>Acciones</span>
          </div>

          {getDocs(selected.id).map((doc) => (
            <div className="evidence-table-row" key={doc.id}>
              <button
                type="button"
                className="evidence-file-name"
                onClick={() => void openPreview(doc)}
              >
                <FileText size={22} />
                <span>
                  <strong>{doc.file_name}</strong>
                  <small>{formatBytes(doc.size_bytes)}</small>
                </span>
              </button>

              <span className="evidence-cell">
                {new Date(doc.created_at)
                  .toLocaleDateString('es-PE')}
              </span>

              <span className="evidence-cell">
                {doc.uploader}
              </span>

              <div className="evidence-actions">
                <button
                  type="button"
                  title="Vista previa"
                  aria-label={`Vista previa de ${doc.file_name}`}
                  onClick={() => void openPreview(doc)}
                >
                  <Eye size={17} />
                </button>

                <button
                  type="button"
                  title="Descargar"
                  aria-label={`Descargar ${doc.file_name}`}
                  onClick={() => void downloadDoc(doc)}
                >
                  <Download size={17} />
                </button>
                <button type="button" className="feedback-open-action" onClick={()=>setFeedbackDoc(doc)}
                  title="Comentar o solicitar corrección" aria-label={`Comentarios sobre ${doc.file_name}`}>
                  <MessageCircle size={17}/>
                  {commentCounts(doc.id)>0&&<span className={pendingComments(doc.id)>0?'feedback-count is-pending':'feedback-count'} title={pendingComments(doc.id)>0?'Hay solicitudes de corrección pendientes':'Comentarios registrados'}>{commentCounts(doc.id)}</span>}
                </button>

                {(identity.role === 'admin' || doc.uploaded_by === identity.id) && (
                  <button
                    type="button"
                    title="Eliminar"
                    aria-label={`Eliminar ${doc.file_name}`}
                    onClick={() => setDeleteTarget(doc)}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="evidence-empty">
          <FileText size={25} />
          <strong>Aún no hay documentos adjuntos</strong>
          <small>Sube el primer documento para registrar una evidencia.</small>
        </div>
      )}
    </div>

  </section>
)}

          {section === 'biblioteca' && !selected && (
            <>
              <div className="toolbar toolbar-extended">
                <div className="search"><Search size={18} /><input placeholder="Buscar documento, código o colaborador" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
                <div className="select-wrap"><select aria-label="Filtrar por estándar" value={libraryStandardFilter} onChange={(e) => setLibraryStandardFilter(e.target.value)}><option value="todos">Todos los estándares</option>{standards.map((entry) => <option key={entry.id} value={entry.id}>Estándar {entry.id} · {entry.title}</option>)}</select></div>
                <div className="select-wrap"><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>{TYPE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                <div className="select-wrap"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'todos' | Status)}><option value="todos">Todos los estados</option>{Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.name}</option>)}</select></div>
              </div>

              <div className="library-summary-bar">
                <span className="filter-pill active">{libraryRows.length} documentos</span>
                <button className="tiny-button" onClick={resetFilters}>Limpiar filtros</button>
              </div>

              <div className="list-panel padded">
                <div className="section-inline">
                  <h2>Documentos cargados</h2>
                  <span className="soft-count">{documents.length} archivos en total</span>
                </div>
                <div className="library-table-head" aria-hidden="true">
                  <span>Estándar / medio</span><span>Documento</span><span>Tipo</span><span>Estado</span><span>Acciones</span>
                </div>
                {visibleLibraryRows.map(({ doc, record, status }) => (
                  <div className="library-document-row" key={doc.id}>
                    <div className="library-standard-code"><strong>Estándar {record.standard}</strong><small>{record.id}</small></div>
                    <button className="library-file-name" onClick={() => void openPreview(doc)} title="Abrir vista previa">
                      <span className="doc-icon"><FileText size={19} /></span>
                      <span><strong>{doc.file_name}</strong><small>{doc.uploader} · {new Date(doc.created_at).toLocaleDateString('es-PE')}</small></span>
                    </button>
                    <div className="library-table-cell"><span className="chip blueish library-type">{normalizeType(record.type)}</span></div>
                    <div className="library-table-cell"><span className={`chip ${STATUS_META[status].color} library-status`}>{STATUS_META[status].name}</span></div>
                    <div className="library-actions">
                      <button className="tiny-button" onClick={() => openItem(record.id)}>Ver ficha</button>
                      <button className="document-action" type="button" onClick={() => void openPreview(doc)} title="Vista previa" aria-label={`Vista previa de ${doc.file_name}`}><Eye size={16} /></button>
                      <button className="document-action feedback-open-action" type="button" onClick={() => setFeedbackDoc(doc)}
                        title="Comentar o solicitar corrección" aria-label={`Comentar ${doc.file_name}`}>
                        <MessageCircle size={16}/>
                        {commentCounts(doc.id)>0&&<span className={pendingComments(doc.id)>0?'feedback-count is-pending':'feedback-count'} title={pendingComments(doc.id)>0?'Hay solicitudes de corrección pendientes':'Comentarios registrados'}>{commentCounts(doc.id)}</span>}
                      </button>
                      <button className="document-action" type="button" onClick={() => void downloadDoc(doc)} title="Descargar" aria-label={`Descargar ${doc.file_name}`}><Download size={16} /></button>
                      {(identity.role === 'admin' || doc.uploaded_by === identity.id) && <button className="delete-document" type="button" onClick={() => setDeleteTarget(doc)} title="Eliminar documento" aria-label={`Eliminar ${doc.file_name}`}><Trash2 size={16} /></button>}
                    </div>
                  </div>
                ))}
                {!libraryRows.length && <div className="empty"><Library size={30} /><strong>No hay documentos que coincidan</strong><span>Prueba otros filtros o limpia la búsqueda.</span></div>}
                {libraryRows.length > 0 && (
                  <nav className="library-pagination" aria-label="Paginación de documentos">
                    <span>Mostrando {Math.min(libraryRows.length, (Math.min(libraryPage, libraryPageCount) - 1) * LIBRARY_PAGE_SIZE + 1)}–{Math.min(libraryRows.length, Math.min(libraryPage, libraryPageCount) * LIBRARY_PAGE_SIZE)} de {libraryRows.length}</span>
                    <div>
                      <button type="button" className="library-page-button" disabled={libraryPage <= 1} onClick={() => setLibraryPage((page) => Math.max(1, page - 1))} aria-label="Página anterior"><ChevronLeft size={17} /> Anterior</button>
                      <span className="library-page-count">Página {Math.min(libraryPage, libraryPageCount)} de {libraryPageCount}</span>
                      <button type="button" className="library-page-button" disabled={libraryPage >= libraryPageCount} onClick={() => setLibraryPage((page) => Math.min(libraryPageCount, page + 1))} aria-label="Página siguiente">Siguiente <ChevronRight size={17} /></button>
                    </div>
                  </nav>
                )}
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

      {showRequirements && selected && (
        <StandardRequirementsDrawer
          record={selected}
          statusLabel={STATUS_META[getStatus(selected.id)].name}
          documentCount={getDocs(selected.id).length}
          onClose={()=>setShowRequirements(false)}
          onUpload={()=>{
            setShowRequirements(false);
            window.requestAnimationFrame(()=>document.getElementById('carga-evidencia')?.scrollIntoView({behavior:'smooth',block:'start'}));
          }}
        />
      )}
      {feedbackDoc && (
        <DocumentFeedback
          document={feedbackDoc}
          identity={identity}
          onClose={()=>setFeedbackDoc(null)}
          onChanged={()=>void refresh()}
        />
      )}
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
              <button type="button" className="feedback-preview-button" onClick={()=>{setFeedbackDoc(previewDoc);closePreview();}}>
                <MessageCircle size={16}/> Comentarios {commentCounts(previewDoc.id)>0?`(${commentCounts(previewDoc.id)})`:''}
              </button>
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
