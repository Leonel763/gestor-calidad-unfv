'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { RotateCcw,
  ArrowLeft,
  CircleAlert,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
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
import {StandardReviewBadge, StandardReviewControl, type StandardReview} from './standard-review-control';
import {StandardReviewConfirmDialog} from './standard-review-confirm-dialog';
import {StandardBulkWorkspace} from './standard-bulk-workspace';
import {PointReviewDialog} from './point-review-dialog';
import {OfficePreview} from './office-preview';
import matrix from '../lib/matriz.json';
import { client, type Evidence, type Tracking } from '../lib/supabase';
import {checkFileSignature} from '../lib/file-validation';

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
  const [navigationRestored, setNavigationRestored] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | Status>('todos');
  const [existenceFilter, setExistenceFilter] = useState<'todos' | Existence>('todos');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [libraryStandardFilter, setLibraryStandardFilter] = useState('todos');
  const [libraryPage, setLibraryPage] = useState(1);
  const [hiddenStandards, setHiddenStandards] = useState<number[]>([]);
  const [excludedMedia, setExcludedMedia] = useState<string[]>([]);
  const [reviewedPointsByStandard, setReviewedPointsByStandard] = useState<Record<string,string[]>>({});
  const [migratedReviews, setMigratedReviews] = useState<number[]>([]);
  const [pointReviewOpen,setPointReviewOpen] = useState(false);
  const [bulkTab, setBulkTab] = useState<'manage' | 'download' | null>(null);
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
  const [standardReviews, setStandardReviews] = useState<StandardReview[]>([]);
  const [savingReviewId, setSavingReviewId] = useState<number|null>(null);
  const [pendingReviewId, setPendingReviewId] = useState<number|null>(null);
  const [reviewConfirmError, setReviewConfirmError] = useState('');
  const [documents, setDocuments] = useState<Evidence[]>([]);
  const [trashedDocuments, setTrashedDocuments] = useState<Evidence[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [pointReviews, setPointReviews] = useState<Array<{point_id:string;standard_id:number;reviewer_id:string;reviewer_name:string;reviewed_at:string}>>([]);
  const [institutionalExclusions, setInstitutionalExclusions] = useState<Array<{point_id:string;reason:string;excluded_by_name:string;excluded_at:string}>>([]);
  const [pointReviewSaving, setPointReviewSaving] = useState(false);
  const [alert, setAlert] = useState<Notice | null>(null);
  const alertTimer = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{done:number;total:number}|null>(null);
  const [dragActive, setDragActive] = useState(false);
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
  const topbarRef = useRef<HTMLElement | null>(null);

  // Mantener la vista de cada usuario durante la sesión de esta pestaña.
  // Se guarda solo navegación y filtros, nunca archivos, contraseñas o formularios.
  const navigationKey = 'unfv-quality-workspace:v1:' + identity.id;
  const hiddenStandardsKey = 'unfv-hidden-standards-preview:v1:' + identity.id;
  const excludedMediaKey = 'unfv-excluded-media-preview:v1:' + identity.id;
  const reviewedPointsKey = 'unfv-point-reviews-preview:v1:' + identity.id;
  const migratedReviewsKey = 'unfv-point-reviews-migrated:v1:' + identity.id;

  useEffect(()=>{
    try{
      const raw:unknown=JSON.parse(window.localStorage.getItem(migratedReviewsKey)||'[]');
      if(Array.isArray(raw))setMigratedReviews(raw.filter((id):id is number=>typeof id==='number' && standards.some(st=>st.id===id)));
    }catch{setMigratedReviews([]);}
  },[migratedReviewsKey]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(hiddenStandardsKey) || '[]');
      if (Array.isArray(stored)) setHiddenStandards(
        stored.filter((id): id is number => Number.isInteger(id) && standards.some(st => st.id===id))
          .slice(0, standards.length-1)
      );
    } catch {
      setHiddenStandards([]);
    }
  }, [hiddenStandardsKey]);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(excludedMediaKey) || '[]');
      if (Array.isArray(stored)) setExcludedMedia(
        [...new Set(stored.filter((id): id is string => typeof id === 'string' && all.some(row => row.id === id)))]
      );
    } catch { setExcludedMedia([]); }
  }, [excludedMediaKey]);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(reviewedPointsKey) || '{}');
      if(!saved || typeof saved!=='object' || Array.isArray(saved)) return;
      const allowed:Record<string,string[]>={};
      for(const st of standards){
        const raw=(saved as Record<string,unknown>)[String(st.id)];
        if(!Array.isArray(raw))continue;
        const valid=new Set(st.points.map(point=>point.id));
        allowed[String(st.id)]=[...new Set(raw.filter((id):id is string=>typeof id==='string' && valid.has(id)))];
      }
      setReviewedPointsByStandard(allowed);
    } catch { setReviewedPointsByStandard({}); }
  },[reviewedPointsKey]);

  async function savePointReview(standardId:number,checkedIds:string[]){
    if(!sb || !identity.approved || pointReviewSaving) return;
    const allowed=new Set(standards.find(st=>st.id===standardId)?.points.map(pt=>pt.id)||[]);
    const desired=[...new Set(checkedIds)].filter(id=>allowed.has(id));
    const existing=pointReviews.filter(r=>r.standard_id===standardId && r.reviewer_id===identity.id).map(r=>r.point_id);
    const additions=desired.filter(id=>!existing.includes(id));
    const removals=existing.filter(id=>!desired.includes(id));
    setPointReviewSaving(true);
    try {
      if(additions.length){
        const {error}=await sb.from('point_reviews').upsert(
          additions.map(point_id=>({point_id,standard_id:standardId,reviewer_id:identity.id,reviewer_name:identity.full_name})),
          {onConflict:'point_id,reviewer_id'}
        );
        if(error)throw error;
      }
      if(removals.length){
        const {error}=await sb.from('point_reviews').delete()
          .eq('reviewer_id',identity.id).eq('standard_id',standardId).in('point_id',removals);
        if(error)throw error;
      }
      await refresh();
      setPointReviewOpen(false);
      // A partir de este guardado, la fuente de verdad de este estándar es Supabase.
      const migrated=[...new Set([...migratedReviews,standardId])];
      setMigratedReviews(migrated);
      try{window.localStorage.setItem(migratedReviewsKey,JSON.stringify(migrated));}catch{}
      const next={...reviewedPointsByStandard,[String(standardId)]:desired};
      setReviewedPointsByStandard(next);
      try{window.localStorage.setItem(reviewedPointsKey,JSON.stringify(next));}catch{}
      showAlert('Tu revisión se sincronizó con Supabase.','success');
    }catch(reason){
      showAlert('No se guardó toda la revisión: '+(reason instanceof Error?reason.message:'error inesperado'));
      await refresh();
    }finally{setPointReviewSaving(false);}
  }

  async function changeInstitutionalExclusion(pointId:string,reason:string|null){
    if(!sb || identity.role!=='admin' || !identity.approved)throw new Error('Se requiere una cuenta administradora autorizada.');
    if(!all.some(row=>row.id===pointId))throw new Error('Medio de logro desconocido.');
    if(reason!==null){
      if(reason.trim().length<10 || reason.trim().length>500)throw new Error('Escribe una justificación de 10 a 500 caracteres.');
      const {error}=await sb.from('media_exclusions').upsert({
        point_id:pointId,reason:reason.trim(),excluded_by:identity.id,excluded_by_name:identity.full_name
      },{onConflict:'point_id'});
      if(error)throw error;
    }else{
      const {error}=await sb.from('media_exclusions').delete().eq('point_id',pointId);
      if(error)throw error;
    }
    await refresh();
  }

  function changeExcludedMedia(next:string[]) {
    const clean = [...new Set(next)].filter(id => all.some(row => row.id===id));
    setExcludedMedia(clean);
    try { window.localStorage.setItem(excludedMediaKey, JSON.stringify(clean)); } catch {}
    if (item && clean.includes(item)) setItem(null);
  }

  function changeHiddenStandards(next:number[]) {
    const clean = [...new Set(next)].filter(id => standards.some(st => st.id===id)).slice(0,standards.length-1);
    setHiddenStandards(clean);
    try { window.localStorage.setItem(hiddenStandardsKey, JSON.stringify(clean)); } catch {}
    if (clean.includes(standard)) {
      const first = standards.find(st => !clean.includes(st.id));
      if (first) {
        setStandard(first.id);
        setPoint(first.points[0]?.id || null);
        setItem(null);
      }
    }
  }


  // Ajustar el encabezado fijo al alto real del menú, que cambia en móvil.
  useEffect(() => {
    if (!item || !topbarRef.current) return;
    const element = topbarRef.current;
    const updateHeight = () => {
      document.documentElement.style.setProperty(
        '--unfv-topbar-height',
        Math.ceil(element.getBoundingClientRect().height) + 'px',
      );
    };
    updateHeight();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateHeight)
      : null;
    observer?.observe(element);
    window.addEventListener('resize', updateHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateHeight);
      document.documentElement.style.removeProperty('--unfv-topbar-height');
    };
  }, [item]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(navigationKey);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          const view = saved as Record<string, unknown>;
          const permittedSections = ['inicio', 'estandares', 'biblioteca', 'pendientes'];
          const savedSection = permittedSections.includes(String(view.section))
            ? view.section as 'inicio' | 'estandares' | 'biblioteca' | 'pendientes'
            : 'inicio';
          const match = typeof view.item === 'string'
            ? all.find((record) => record.id === view.item)
            : undefined;

          if (match) {
            // La ficha prevalece sobre otros valores antiguos o inconsistentes.
            setSection('estandares');
            setStandard(match.standard);
            setPoint(match.point);
            setItem(match.id);
            setShowRequirements(view.showRequirements === true);
          } else {
            setSection(savedSection);
            const savedStandard = standards.find((value) => value.id === view.standard) || standards[0];
            setStandard(savedStandard.id);
            const savedPoint = savedStandard.points.find((value) => value.id === view.point);
            setPoint(savedPoint?.id || savedStandard.points[0]?.id || null);
            setItem(null);
            setShowRequirements(false);
          }

          if (typeof view.query === 'string') setQuery(view.query.slice(0, 200));
          if (view.statusFilter === 'todos' ||
            (typeof view.statusFilter === 'string' && Object.prototype.hasOwnProperty.call(STATUS_META, view.statusFilter))) {
            setStatusFilter(view.statusFilter as 'todos' | Status);
          }
          if (EXISTENCE_OPTIONS.some((value) => value.value === view.existenceFilter)) {
            setExistenceFilter(view.existenceFilter as 'todos' | Existence);
          }
          if (TYPE_OPTIONS.includes(String(view.typeFilter))) setTypeFilter(String(view.typeFilter));
          if (view.libraryStandardFilter === 'todos' ||
            standards.some((value) => String(value.id) === view.libraryStandardFilter)) {
            setLibraryStandardFilter(String(view.libraryStandardFilter));
          }
          if (view.explorerStatus === 'todos' ||
            (typeof view.explorerStatus === 'string' &&
              Object.prototype.hasOwnProperty.call(VISUAL_SUMMARY_META, view.explorerStatus))) {
            setExplorerStatus(view.explorerStatus as 'todos' | VisualSummaryKey);
          }
        }
      }
    } catch {
      // Si el navegador bloquea el almacenamiento o hay datos antiguos, abrir Inicio.
    } finally {
      setNavigationRestored(true);
    }
  }, [navigationKey]);

  useEffect(() => {
    if (!navigationRestored) return;
    try {
      window.sessionStorage.setItem(navigationKey, JSON.stringify({
        section, standard, point, item, showRequirements, query,
        statusFilter, existenceFilter, typeFilter, libraryStandardFilter, explorerStatus,
      }));
    } catch {
      // La navegación sigue funcionando aunque no esté disponible sessionStorage.
    }
  }, [
    navigationRestored, navigationKey, section, standard, point, item,
    showRequirements, query, statusFilter, existenceFilter, typeFilter,
    libraryStandardFilter, explorerStatus,
  ]);

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
    const [docsRes, trackingRes, commentRes, reviewsRes, pointReviewsRes, excludedRes, trashRes] = await Promise.all([
      sb.from('evidencias').select('*').order('created_at', { ascending: false }),
      sb.from('seguimiento').select('*'),
      sb.from('document_comments').select('evidence_id,comment_type,status'),
      sb.from('standard_reviews').select('standard_id,status,reviewed_by,reviewer_name,reviewed_at'),
      sb.from('point_reviews').select('point_id,standard_id,reviewer_id,reviewer_name,reviewed_at'),
      sb.from('media_exclusions').select('point_id,reason,excluded_by_name,excluded_at'),
      sb.from('evidence_trash').select('evidence_id'),
    ]);
    if (docsRes.error || trashRes.error) showAlert('No se pudo consultar la biblioteca o papelera: '+(docsRes.error?.message || trashRes.error?.message));
    else {
      const allFiles=(docsRes.data || []) as Evidence[];
      const trashIds=new Set((trashRes.data || []).map(row=>row.evidence_id));
      setDocuments(allFiles.filter(doc=>!trashIds.has(doc.id)));
      setTrashedDocuments(allFiles.filter(doc=>trashIds.has(doc.id)));
    }
    if (trackingRes.error) showAlert(`No se pudo consultar el seguimiento: ${trackingRes.error.message}`);
    else setTracking((trackingRes.data || []) as Tracking[]);
    if (commentRes.error) showAlert(`No se pudieron consultar las observaciones: ${commentRes.error.message}`);
    else setCommentBriefs((commentRes.data || []) as DocumentCommentBrief[]);
    if (reviewsRes.error) showAlert('No se pudieron consultar las revisiones: ' + reviewsRes.error.message);
    else setStandardReviews((reviewsRes.data || []) as StandardReview[]);
    if(pointReviewsRes.error) showAlert('No se pudieron consultar revisiones por punto: '+pointReviewsRes.error.message);
    else setPointReviews(pointReviewsRes.data || []);
    if(excludedRes.error) showAlert('No se pudieron consultar los medios no aplicables: '+excludedRes.error.message);
    else setInstitutionalExclusions(excludedRes.data || []);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'standard_reviews' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'point_reviews' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media_exclusions' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evidence_trash' }, reload)
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
  // Ocultar: preferencia de navegación local. "No aplica": decisión institucional que afecta el progreso compartido.
  const isOfficiallyExcluded=(id:string)=>institutionalExclusions.some(item=>item.point_id===id);
  const isExcluded = (id:string) => excludedMedia.includes(id) || isOfficiallyExcluded(id);
  const groupSummary = (items: Item[]) => summarizeStatuses(items.filter(it => !isOfficiallyExcluded(it.id)).map(it => getStatus(it.id)));
  const visibleStandards = standards.filter(st => !hiddenStandards.includes(st.id));
  const activeRecords = all.filter(a => !isOfficiallyExcluded(a.id));
  const browsableRecords = activeRecords.filter(a=>!hiddenStandards.includes(a.standard) && !excludedMedia.includes(a.id));
  const reviewsFor=(id:number)=>standardReviews.filter((review)=>review.standard_id===id);
  const myReviewFor=(id:number)=>standardReviews.find((review)=>review.standard_id===id && review.reviewed_by===identity.id);
  const reviewOutdated=(review:StandardReview)=>{
    if (review.status!=='revisado') return false;
    const reviewedAt=new Date(review.reviewed_at).getTime();
    return documents.some((doc)=>new Date(doc.created_at).getTime()>reviewedAt &&
      all.some((row)=>row.id===doc.point_id && row.standard===review.standard_id));
  };
  const validReviewCount=(id:number)=>reviewsFor(id).filter((review)=>review.status==='revisado' && !reviewOutdated(review)).length;

  const stateWithoutEvidence=tracking.filter(row=>row.status==='completo' && !documents.some(doc=>doc.point_id===row.point_id));
  const complete = activeRecords.filter(a => getStatus(a.id) === 'completo').length;
  const simulated = activeRecords.filter(a => getStatus(a.id) === 'en_proceso').length;
  const need = activeRecords.filter(a => getStatus(a.id) === 'complementar').length;
  const pending = activeRecords.filter(a => getStatus(a.id) === 'pendiente').length;
  const allPoints = standards.reduce((sum, st) => sum + st.points.filter(pt => pt.items.some(it => !isOfficiallyExcluded(it.id))).length, 0);
  const numberedSubpoints = activeRecords.filter(a => a.id.split('.').length === 3).length;
  const generalPercent = activeRecords.length ? Math.round(complete / activeRecords.length * 100) : 0;
  const selectedStandard = visibleStandards.find((s) => s.id === standard) || visibleStandards[0] || standards[0];
  const quickMediaOptions = selectedStandard.points.flatMap((pt) =>
    pt.items.filter(it => !isExcluded(it.id)).map((it) => ({
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
  const selected = browsableRecords.find((a) => a.id === item) || null;
  const selectedStandardSummary = groupSummary(selectedStandard.points.flatMap((pt) => pt.items));
  const activeReviewPoints = selectedStandard.points
    .filter(pt => pt.items.some(it => !isOfficiallyExcluded(it.id)))
    .map(pt => ({id:pt.id,criterion:pt.criterion}));
  const activeReviewPointIds=new Set(activeReviewPoints.map(pt=>pt.id));
  const syncedPointReview=pointReviews.filter(row=>row.standard_id===selectedStandard.id && row.reviewer_id===identity.id).map(row=>row.point_id);
  const legacyReview=reviewedPointsByStandard[String(selectedStandard.id)]||[];
  const isMigrated=migratedReviews.includes(selectedStandard.id);
  const savedPointReview=(isMigrated?syncedPointReview:[...new Set([...syncedPointReview,...legacyReview])]).filter(id=>activeReviewPointIds.has(id));
  const unsyncedLegacyReview=!isMigrated && legacyReview.some(id=>!syncedPointReview.includes(id));
  const activeReviewedCount=savedPointReview.filter(id=>activeReviewPointIds.has(id)).length;

  const filteredMatrixItems = useMemo(() => {
    return browsableRecords.filter((record) => {
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
  }, [query, statusFilter, existenceFilter, typeFilter, tracking, documents, excludedMedia, hiddenStandards, institutionalExclusions]);

  // Datos filtrados para la vista compacta; no alteran las evidencias de Supabase.
  const filteredIds = new Set(filteredMatrixItems.map((record) => record.id));
  const visiblePoints = selectedStandard.points
    .map((pt) => ({ ...pt, visibleItems: pt.items.filter((it) => !isExcluded(it.id) && filteredIds.has(it.id)) }))
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

  function openStatusResults(status:Status) {
    resetFilters();
    setStatusFilter(status);
    setSection('pendientes');
    setItem(null);
  }

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
    if (hiddenStandards.includes(id)) return;
    setQuickMedium('');
    setStandard(id);
    setSection('estandares');
    setPoint(standards.find((st) => st.id === id)?.points[0]?.id || null);
    setItem(null);
  }

  async function updateStandardReview(id:number,status:'en_revision'|'revisado'|null,confirmed=false) {
    if (!sb || !identity.approved || savingReviewId!==null) return;
    if (status==='revisado' && !confirmed) {
      setReviewConfirmError('');
      setPendingReviewId(id);
      return;
    }
    setSavingReviewId(id);
    try {
      if (status===null) {
        const {data,error}=await sb.from('standard_reviews').delete()
          .eq('standard_id',id).eq('reviewed_by',identity.id)
          .select('standard_id,reviewed_by');
        if (error) throw error;
        if (!data?.length) throw new Error('No se pudo retirar tu revisión.');
        setStandardReviews((prev)=>prev.filter((value)=>!(value.standard_id===id && value.reviewed_by===identity.id)));
        showAlert('Retiraste tu propia marca de revisión.', 'success');
      } else {
        // Supabase impone identidad y fecha; la clave compuesta evita afectar otras cuentas.
        const {data,error}=await sb.from('standard_reviews')
          .upsert({standard_id:id,status,reviewed_by:identity.id,reviewer_name:identity.full_name},
            {onConflict:'standard_id,reviewed_by'})
          .select('standard_id,status,reviewed_by,reviewer_name,reviewed_at')
          .single();
        if (error || !data) throw error||new Error('No se pudo guardar tu revisión.');
        const saved=data as StandardReview;
        setStandardReviews((prev)=>[...prev.filter((value)=>!(value.standard_id===id && value.reviewed_by===identity.id)),saved]);
        if (status==='revisado') {
          setPendingReviewId(null);
          setReviewConfirmError('');
        }
        showAlert(status==='revisado'?'Tu revisión se registró correctamente.':'Se registró que estás revisando el estándar.', 'success');
      }
    }catch(reason){
      const message=reason instanceof Error ? reason.message : 'No se pudo actualizar tu revisión.';
      if (status==='revisado') setReviewConfirmError(message);
      else showAlert(message);
    }finally{
      setSavingReviewId(null);
    }
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
    const record = browsableRecords.find((row) => row.id === code);
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
    for(const file of files){
      const issue=await checkFileSignature(file);
      if(issue){
        showAlert(`El archivo ${file.name} no es válido. ${issue}`);
        return;
      }
    }
    setBusy(true);
    setUploadProgress(files.length?{done:0,total:files.length}:null);
    dismissAlert();
    try {
    for (const [fileIndex,file] of files.entries()) {
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
        if(fileIndex>0){setFiles(files.slice(fileIndex));await refresh();}
        showAlert((fileIndex>0?`${fileIndex} archivo(s) se guardaron antes del error. Solo quedan seleccionados los pendientes. `:'')+`Error al subir ${file.name}: ${uploadErr.message}`);
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
        if(fileIndex>0){setFiles(files.slice(fileIndex));await refresh();}
        showAlert((fileIndex>0?`${fileIndex} archivo(s) se guardaron antes del error. Solo quedan seleccionados los pendientes. `:'')+`Error al registrar ${file.name}: ${dbErr.message}`);
        setBusy(false);
        return;
      }
      setUploadProgress({done:fileIndex+1,total:files.length});
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

  async function changeDocumentTrash(doc:Evidence,action:'trash'|'restore'){
    if(deleting)return;
    setDeleting(true);
    dismissAlert();
    try{
      if(!sb)throw new Error('Debes iniciar sesión.');
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.access_token)throw new Error('Sesión expirada. Vuelve a ingresar.');
      const response=await fetch('/api/documents/delete',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
        body:JSON.stringify({id:doc.id,action})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'No se pudo completar la operación.');
      if(action==='trash')setDeleteTarget(null);
      await refresh();
      showAlert(action==='trash'?'Documento enviado a la papelera. Puedes recuperarlo.':'Documento restaurado.','success');
    }catch(reason){showAlert(reason instanceof Error?reason.message:'Error al actualizar la papelera.');}
    finally{setDeleting(false);}
  }

  async function deleteDocument() {
    if(!deleteTarget)return;
    await changeDocumentTrash(deleteTarget,'trash');
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

  if (!navigationRestored) {
    return (
      <main className="unfv-auth-screen">
        <div className="unfv-auth-card" role="status">Recuperando tu última vista…</div>
      </main>
    );
  }

  return (
    <div className="shell shell-modern shell-horizontal">
      <div className="main main-horizontal">
        <header ref={topbarRef} className="topbar topbar-modern simple-topbar">
          <button type="button" className="simple-brand" onClick={() => nav('inicio')} aria-label="Ir a Inicio">
            <span className="simple-brand-symbol"><Landmark size={23} /></span>
            <span className="simple-brand-copy">
              <strong>UNFV <span className="simple-brand-divider" aria-hidden="true" /><span className="simple-brand-fullname">Gestión de Calidad</span></strong>
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
            <span className="header-upload-long-label">Cargar documento</span><span className="header-upload-short-label">Subir</span>
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

                {quickUploadStep==='attach' && busy && uploadProgress && <div className="ux-upload-progress" role="status" aria-live="polite"><span>Documentos registrados: {uploadProgress.done} de {uploadProgress.total}</span><progress max={uploadProgress.total} value={uploadProgress.done}/><small>Cada avance confirma que un documento fue guardado.</small></div>}
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
                      <strong>{complete} de {activeRecords.length}</strong>
                      <span>medios de logro completados</span>
                      <div className="home-v2-progress-line" aria-hidden="true">
                        <span style={{ width: `${generalPercent}%` }} />
                      </div>
                      <p className="quality-progress-note">Avance documental según evidencias cargadas y su estado. No representa aprobación o conformidad institucional.</p>
                      <div className="home-v2-progress-totals">
                        <span><Layers3 size={16}/><b>{visibleStandards.length}</b><small>Estándares</small></span>
                        <span><ClipboardList size={16}/><b>{allPoints}</b><small>Puntos</small></span>
                        <span><FileText size={16}/><b>{activeRecords.length}</b><small>Medios</small></span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="home-v2-card home-v2-status-card">
                  <div className="home-v2-section-heading">
                    <h2>Estado de medios de logro</h2>
                  </div>
                  {stateWithoutEvidence.length>0 && (
                    <details className="quality-consistency-panel">
                      <summary><CircleAlert size={16}/> {stateWithoutEvidence.length} estados marcados completos sin archivos · Revisar detalles</summary>
                      <div>
                        {stateWithoutEvidence.map(row=>(
                          <button key={row.point_id} type="button"
                            disabled={!browsableRecords.some(item=>item.id===row.point_id)}
                            onClick={()=>{resetFilters();openItem(row.point_id);}}>
                            <strong>Medio {row.point_id}</strong>
                            <span>Estado registrado: Completo · Evidencia actual: sin documentos</span>
                            <ChevronRight size={15}/>
                          </button>
                        ))}
                        <small>Los medios sin archivos se muestran como pendientes. Si aún ves una inconsistencia, actualiza para sincronizar.</small>
                      </div>
                    </details>
                  )}
                  <div className="home-v2-status-list">
                    {([
                      { key: 'complete', label: 'Completos', value: complete },
                      { key: 'simulated', label: 'Con datos simulados', value: simulated },
                      { key: 'needs', label: 'Por complementar', value: need },
                      { key: 'pending', label: 'Pendientes', value: pending },
                    ] as const).map((entry) => (
                      <button key={entry.key} type="button" className="home-v2-status-row ux-status-link" onClick={()=>openStatusResults(entry.key==="complete"?"completo":entry.key==="simulated"?"en_proceso":entry.key==="needs"?"complementar":"pendiente")} aria-label={`Ver ${entry.value} medios: ${entry.label}`}>
                        <span className={`home-v2-status-dot ${entry.key}`} aria-hidden="true" />
                        <span>{entry.label}</span>
                        <strong>{entry.value}</strong>
                      <ChevronRight size={15} aria-hidden="true"/></button>
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
                    {visibleStandards.slice(0, 3).map((st) => {
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
                <div className="bulk-toolbar">
                  <span className="tri-overview-count"><Layers3 size={16}/>{visibleStandards.length} estándares visibles</span>
                  <button type="button" onClick={() => setBulkTab('manage')}><EyeOff size={16}/> Organizar</button>
                  <button type="button" className="bulk-toolbar-primary" onClick={() => setBulkTab('download')}><Download size={16}/> Descargar ZIP</button>
                </div>
              </div>
              <p className="quality-progress-note">El porcentaje corresponde a evidencias documentales y excluye los medios oficialmente «No aplica»; no equivale a una validación de conformidad.</p>
              <div className="tri-overview-bar">
                <div><Layers3 size={19}/><strong>{visibleStandards.length}</strong><span>Visibles</span></div>
                <div><ClipboardList size={19}/><strong>{allPoints}</strong><span>Puntos</span></div>
                <div><FileText size={19}/><strong>{activeRecords.length}</strong><span>Medios activos</span></div>
                <div className="tri-overview-progress">
                  <span>Avance general</span>
                  <strong>{generalPercent}%</strong>
                  <span className="tri-progress"><span style={{ width: generalPercent + '%' }} /></span>
                  <small>{complete} de {activeRecords.length} completados</small>
                </div>
              </div>
              <div className="tri-workspace">
                <section className="tri-standards" aria-label="Lista de estándares">
                  <header className="tri-panel-title">
                    <h2>Estándares <span>({visibleStandards.length})</span></h2>
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
                  <p className="ux-search-context" role="status">{filteredMatrixItems.length} medios coinciden con los filtros actuales.</p>
                  <div className="tri-standard-list">
                    {visibleStandards.filter((st) => {
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
                            <small>{(reviewedPointsByStandard[String(st.id)]||[]).filter(id=>st.points.some(pt=>pt.id===id && pt.items.some(it=>!isExcluded(it.id)))).length} puntos revisados</small>
                          </span>
                          <span className="tri-standard-right">
                            <span className={'tri-standard-state state-' + summary.kind}>{summary.percent}%</span>
                            <ChevronRight size={16}/>
                          </span>
                        </button>
                      );
                    })}
                    {!visibleStandards.some((st) => {
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
                  <div className="point-review-entry">
                    <div className="point-review-entry-main">
                      <span className="point-review-entry-icon"><ClipboardList size={19}/></span>
                      <span>
                        <strong>Mi revisión</strong>
                        <small>{activeReviewedCount} de {activeReviewPoints.length} puntos revisados</small>
                      </span>
                    </div>
                    <div className="point-review-entry-actions">
                      <span className={activeReviewedCount===activeReviewPoints.length && activeReviewPoints.length>0
                        ? 'point-review-entry-state is-done' : 'point-review-entry-state'}>
                        {activeReviewPoints.length>0 && activeReviewedCount===activeReviewPoints.length
                          ? 'Revisado ✓' : activeReviewedCount>0 ? 'En revisión' : 'Sin revisar'}
                      </span>
                      <button type="button" onClick={()=>setPointReviewOpen(true)}>
                        <ClipboardList size={16}/> Revisar puntos <ChevronRight size={16}/>
                      </button>
                    </div>
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
                                    <details className="ux-media-actions"><summary aria-label={"Acciones del medio "+it.id}>Acciones <ChevronRight size={15}/></summary><div><button type="button" onClick={()=>openItem(it.id)}><Eye size={15}/> Ver ficha</button><button type="button" onClick={()=>openQuickUploadFor(it.id)}><Upload size={15}/> Cargar documento</button></div></details>
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

    {/* Navegación persistente: siempre visible debajo de la barra principal. */}
    <nav className="evidence-sticky-navigation" aria-label="Regresar al estándar">
      <button
        type="button"
        className="evidence-sticky-back"
        onClick={() => { setItem(null); setShowRequirements(false); }}
        aria-label={`Volver al estándar ${selected.standard}`}
      >
        <ArrowLeft size={17} aria-hidden="true"/>
        Volver al estándar {selected.standard}
      </button>
      <span className="evidence-sticky-divider" aria-hidden="true"/>
      <span className="evidence-sticky-current"><FileText size={15} aria-hidden="true"/> Medio <strong>{selected.id}</strong></span>
    </nav>

    {/* Cabecera compacta: lo esencial primero y el detalle bajo demanda. */}
    <nav className="ux-detail-jump" aria-label="Secciones del medio"><button type="button" onClick={()=>document.getElementById("documentos-del-medio")?.scrollIntoView({behavior:"smooth",block:"start"})}><FileText size={15}/> Documentos</button><button type="button" onClick={()=>document.getElementById("carga-evidencia")?.scrollIntoView({behavior:"smooth",block:"start"})}><Upload size={15}/> Agregar evidencia</button><button type="button" onClick={()=>setShowRequirements(true)}><BookOpen size={15}/> Requisitos</button></nav>
    <div className="evidence-heading evidence-heading-refined">
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
          className={"evidence-dropzone evidence-dropzone-refined"+(dragActive?" is-dragging":"")}
          onDragOver={(e) => {e.preventDefault();if(!busy)setDragActive(true);}}
           onDragLeave={()=>setDragActive(false)}
           onDrop={(e) => {
             e.preventDefault();setDragActive(false);
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
         {files.length>0 && <div className="ux-upload-selection" aria-live="polite"><strong>{files.length} archivo(s) preparado(s)</strong>{files.map((file,index)=><div key={file.name+"-"+file.lastModified+"-"+index}><span title={file.name}><FileText size={15}/>{file.name} <small>({formatBytes(file.size)})</small></span><button type="button" disabled={busy} aria-label={"Quitar "+file.name} onClick={()=>setFiles(old=>old.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}</div>}


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
         {busy && uploadProgress && <div className="ux-upload-progress" role="status" aria-live="polite"><span>Documentos registrados: {uploadProgress.done} de {uploadProgress.total}</span><progress max={uploadProgress.total} value={uploadProgress.done}/><small>Avanza al guardarse cada archivo; no mide la transferencia.</small></div>}


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
    <div className="evidence-card evidence-documents" id="documentos-del-medio">
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
                <span className="filter-pill active">{showTrash ? trashedDocuments.length : libraryRows.length} documentos</span>
                <button type="button" className="tiny-button" onClick={()=>{setShowTrash(v=>!v);setLibraryPage(1);}}>
                  {showTrash ? 'Ver biblioteca' : 'Papelera ('+trashedDocuments.length+')'}
                </button>
                <button className="tiny-button" onClick={resetFilters}>Limpiar filtros</button>
              </div>

              {showTrash ? (
                <div className="list-panel padded">
                  <div className="section-inline">
                    <h2>Papelera de documentos</h2>
                    <span className="soft-count">{trashedDocuments.length} archivos recuperables</span>
                  </div>
                  <p className="safe-trash-description">Los documentos originales siguen guardados en Supabase. Solo el autor o un administrador puede restaurarlos.</p>
                  {trashedDocuments.map(doc=>(
                    <div className="safe-trash-row" key={doc.id}>
                      <FileText size={20}/>
                      <span><strong>{doc.file_name}</strong><small>Medio {doc.point_id} · {doc.uploader}</small></span>
                      <button type="button" className="tiny-button" disabled={deleting}
                        onClick={()=>void downloadDoc(doc)}><Download size={15}/> Descargar</button>
                      {(identity.role==='admin'||doc.uploaded_by===identity.id) && (
                        <button type="button" className="tiny-button" disabled={deleting}
                          onClick={()=>void changeDocumentTrash(doc,'restore')}><RotateCcw size={15}/> Restaurar</button>
                      )}
                    </div>
                  ))}
                  {!trashedDocuments.length && <div className="empty"><Trash2 size={25}/><strong>La papelera está vacía</strong><span>No se ha ocultado ningún documento.</span></div>}
                </div>
              ) : (
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
                      {(identity.role === 'admin' || doc.uploaded_by === identity.id) && <button className="delete-document" type="button" onClick={() => setDeleteTarget(doc)} title="Mover a la papelera" aria-label={`Enviar a papelera ${doc.file_name}`}><Trash2 size={16} /></button>}
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
              )}
            </>
          )}

          {section === 'pendientes' && !selected && (
            <>
              <div className="toolbar toolbar-extended">
                <span className="ux-search-context">Busca por código, descripción o documento desde la barra superior.</span>
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
      {pendingReviewId!==null && (
        <StandardReviewConfirmDialog
          standardId={pendingReviewId}
          standardTitle={standards.find((st)=>st.id===pendingReviewId)?.title || ''}
          reviewerName={identity.full_name}
          saving={savingReviewId===pendingReviewId}
          error={reviewConfirmError}
          onClose={()=>{
            if(savingReviewId!==null) return;
            setPendingReviewId(null);
            setReviewConfirmError('');
          }}
          onConfirm={()=>void updateStandardReview(pendingReviewId,'revisado',true)}
        />
      )}
      {pointReviewOpen && (
        <PointReviewDialog
          standardId={selectedStandard.id}
          standardTitle={selectedStandard.title}
          points={activeReviewPoints}
          savedIds={savedPointReview}
          onSave={ids=>void savePointReview(selectedStandard.id,ids)}
          onClose={()=>{if(!pointReviewSaving)setPointReviewOpen(false);}}
          saving={pointReviewSaving}
          hasLegacy={unsyncedLegacyReview}
          teamReviews={pointReviews.filter(row=>row.standard_id===selectedStandard.id)}
          currentUserId={identity.id}
        />
      )}
      {bulkTab && (
        <StandardBulkWorkspace
          standards={standards}
          documents={documents}
          hiddenIds={hiddenStandards}
          onHiddenIdsChange={changeHiddenStandards}
          excludedMedia={excludedMedia}
          onExcludedMediaChange={changeExcludedMedia}
          officialExclusions={institutionalExclusions}
          onOfficialChanged={changeInstitutionalExclusion}
          isAdmin={identity.role==='admin'}
          onClose={() => setBulkTab(null)}
          initialTab={bulkTab}
          client={sb}
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
              ) : previewUrl && /\.docx$/i.test(previewDoc.file_name) ? (
                <OfficePreview url={previewUrl} kind="word"/>
              ) : previewUrl && /\.xlsx$/i.test(previewDoc.file_name) ? (
                <OfficePreview url={previewUrl} kind="excel"/>
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
            <h2 id="delete-title">¿Mover a la papelera?</h2>
            <p><strong>{deleteTarget.file_name}</strong> dejará de aparecer en la biblioteca y en el seguimiento, pero el archivo original permanecerá guardado en Supabase y podrás restaurarlo.</p>
            <div className="modal-actions">
              <button type="button" className="cancel-delete" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button type="button" className="confirm-delete" disabled={deleting} onClick={deleteDocument}>{deleting ? 'Moviendo…' : 'Mover a papelera'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
