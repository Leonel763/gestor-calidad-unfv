'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Evidence} from '../lib/supabase';
import {
  ArchiveRestore, Check, CheckSquare, ChevronRight, Download, EyeOff,
  FileArchive, FileText, Folder, FolderTree, Info, Layers3, LoaderCircle,
  SearchCheck, X,
} from 'lucide-react';

export type ExportableStandard = {
  id: number;
  title: string;
  points: {id: string; items: {id: string}[]}[];
};

type DialogTab = 'manage' | 'download';
type ZipLayout = 'full' | 'standards' | 'flat';

type Props = {
  standards: ExportableStandard[];
  documents: Evidence[];
  hiddenIds: number[];
  onHiddenIdsChange: (ids: number[]) => void;
  excludedMedia: string[];
  onExcludedMediaChange: (ids: string[]) => void;
  onClose: () => void;
  initialTab: DialogTab;
  client: SupabaseClient | null;
};

const MAX_ZIP_BYTES = 250 * 1024 * 1024;

function cleanPart(value: string) {
  const cleaned = value.replace(/[\\/<>:"|?*\u0000-\u001f]/g, '-').replace(/\.+$/g, '').trim();
  return (cleaned || 'Sin_nombre').slice(0, 100);
}

function uniquePath(path: string, names: Set<string>) {
  const extIndex = path.lastIndexOf('.');
  const dirIndex = path.lastIndexOf('/');
  const extension = extIndex > dirIndex ? path.slice(extIndex) : '';
  const prefix = extension ? path.slice(0, -extension.length) : path;
  let result = path;
  let count = 2;
  while (names.has(result.toLowerCase())) {
    result = prefix + ' (' + count++ + ')' + extension;
  }
  names.add(result.toLowerCase());
  return result;
}

function prettyBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    : Math.max(0, Math.ceil(bytes / 1024)) + ' KB';
}

export function StandardBulkWorkspace({
  standards, documents, hiddenIds, onHiddenIdsChange, excludedMedia, onExcludedMediaChange, onClose, initialTab, client,
}: Props) {
  const [tab, setTab] = useState<DialogTab>(initialTab);
  const [selectedIds, setSelectedIds] = useState<number[]>(
    () => standards.filter(st => !hiddenIds.includes(st.id)).map(st => st.id)
  );
  const [layout, setLayout] = useState<ZipLayout>('full');
  const [mediumSearch,setMediumSearch] = useState('');
  const [mediumStandard,setMediumStandard] = useState('todos');
  const [expandedStandards,setExpandedStandards] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const closeAction = useRef(onClose);
  busyRef.current = busy;
  closeAction.current = onClose;

  const docIndex = useMemo(() => {
    const lookup = new Map<string, {standard: ExportableStandard; point: string}>();
    for (const standard of standards) for (const point of standard.points) {
      for (const medium of point.items) lookup.set(medium.id, {standard, point: point.id});
    }
    return lookup;
  }, [standards]);

  // Un único explorador para estándares y medios. La búsqueda encuentra ambos tipos.
  const organizedStandards = useMemo(() => {
    const needle=mediumSearch.trim().toLocaleLowerCase('es');
    return standards
      .filter(st => mediumStandard==='todos' || String(st.id)===mediumStandard)
      .map(st => {
        const matchesStandard = !needle || [
          'e'+st.id, 'e'+String(st.id).padStart(2,'0'),
          'estandar '+st.id, 'estándar '+st.id, st.title,
        ].some(text=>text.toLocaleLowerCase('es').includes(needle));
        const media=st.points.flatMap(point=>point.items.map(item=>({
          id:item.id,point:point.id,
        })));
        const matchingMedia=needle && !matchesStandard
          ? media.filter(medium=>('medio '+medium.id+' '+medium.id+' '+medium.point)
              .toLocaleLowerCase('es').includes(needle))
          : media;
        return {st,matchingMedia,matchesStandard};
      })
      .filter(group=>group.matchesStandard || group.matchingMedia.length>0);
  },[standards,mediumSearch,mediumStandard]);

  const docCountByMedium = useMemo(()=>{
    const count = new Map<string,number>();
    for(const doc of documents) count.set(doc.point_id,(count.get(doc.point_id)||0)+1);
    return count;
  },[documents]);

  const docCountByStandard = useMemo(() => {
    const map = new Map<number, number>();
    for (const doc of documents) {
      const entry = docIndex.get(doc.point_id);
      if (entry) map.set(entry.standard.id, (map.get(entry.standard.id) || 0) + 1);
    }
    return map;
  }, [documents, docIndex]);

  const documentsToExport = useMemo(() =>
    documents.filter(doc => {
      const detail = docIndex.get(doc.point_id);
      return detail && selectedIds.includes(detail.standard.id);
    }), [documents, selectedIds, docIndex]);

  const selectedSize = documentsToExport.reduce((n, doc) => n + (doc.size_bytes || 0), 0);

  useEffect(() => {
    const focusBefore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) closeAction.current();
      if (event.key === 'Tab' && dialogRef.current) {
        const items = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
          'button:not(:disabled),input:not(:disabled)'
        )).filter(item => item.getClientRects().length > 0);
        if (!items.length) return;
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault(); items[items.length - 1].focus();
        } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
          event.preventDefault(); items[0].focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflowBefore;
      focusBefore?.focus();
    };
  }, []);

  function toggleVisible(id: number) {
    if (busy) return;
    setError('');
    if (hiddenIds.includes(id)) {
      onHiddenIdsChange(hiddenIds.filter(value => value !== id));
    } else {
      if (hiddenIds.length >= standards.length - 1) {
        setError('Debe quedar al menos un estándar visible. Puedes restaurar cualquiera cuando lo necesites.');
        return;
      }
      onHiddenIdsChange([...hiddenIds, id]);
      setSelectedIds(previous => previous.filter(value => value !== id));
    }
  }

  function toggleMedium(id:string){
    if(busy)return;
    setError('');
    onExcludedMediaChange(excludedMedia.includes(id)?excludedMedia.filter(row=>row!==id):[...excludedMedia,id]);
  }

  function toggleSelection(id: number) {
    setSelectedIds(current => current.includes(id)
      ? current.filter(value => value !== id)
      : [...current, id]);
  }

  function selectFirstFive() {
    setSelectedIds(standards.slice(0, 5).map(st => st.id));
    setError('');
  }

  async function downloadZip() {
    if (busy) return;
    if (!client) { setError('Debes iniciar sesión para descargar documentos.'); return; }
    if (!selectedIds.length) { setError('Selecciona al menos un estándar.'); return; }
    if (!documentsToExport.length) { setError('Los estándares elegidos todavía no tienen documentos adjuntos.'); return; }
    if (selectedSize > MAX_ZIP_BYTES) {
      setError('La selección supera los 250 MB para esta descarga. Selecciona menos estándares y genera varios ZIP.');
      return;
    }

    setBusy(true);
    setError('');
    setProgress('Preparando estructura de carpetas…');

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const names = new Set<string>();
      const selected = standards.filter(st => selectedIds.includes(st.id));

      // Crear carpetas incluso cuando todavía no haya evidencias.
      if (layout !== 'flat') {
        for (const st of selected) {
          const root = 'E' + st.id + ' - ' + cleanPart(st.title);
          if (layout === 'standards') zip.folder(root);
          else {
            zip.folder(root);
            for (const pt of st.points) {
              zip.folder(root + '/Punto ' + cleanPart(pt.id));
              for (const item of pt.items) {
                zip.folder(root + '/Punto ' + cleanPart(pt.id) + '/Medio ' + cleanPart(item.id));
              }
            }
          }
        }
      }

      for (let i = 0; i < documentsToExport.length; i++) {
        const doc = documentsToExport[i];
        const location = docIndex.get(doc.point_id);
        if (!location) continue;

        setProgress('Descargando archivo ' + (i + 1) + ' de ' + documentsToExport.length + '…');
        const {data, error:storageError} = await client.storage.from('evidencias').download(doc.file_path);
        if (storageError || !data) throw new Error('No se pudo descargar «' + doc.file_name + '». ' +
          (storageError?.message || 'Comprueba los permisos y vuelve a intentar.'));

        const root = 'E' + location.standard.id + ' - ' + cleanPart(location.standard.title);
        const prefix = layout === 'full'
          ? root + '/Punto ' + cleanPart(location.point) + '/Medio ' + cleanPart(doc.point_id) + '/'
          : layout === 'standards' ? root + '/'
          : 'E' + location.standard.id + '_' + cleanPart(doc.point_id) + '_';

        const path = uniquePath(prefix + cleanPart(doc.file_name), names);
        zip.file(path, data);
      }

      setProgress('Comprimiendo los archivos para crear el ZIP…');
      const blob = await zip.generateAsync(
        {type:'blob', compression:'DEFLATE', compressionOptions:{level:3}},
        meta => setProgress('Preparando ZIP: ' + Math.round(meta.percent) + '%')
      );
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = 'UNFV_Evidencias_' + selected.length + '_estandares.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setProgress('ZIP creado correctamente. Contiene ' + documentsToExport.length + ' archivos.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo generar el ZIP.');
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bulk-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <div ref={dialogRef} className="bulk-dialog" role="dialog" aria-modal="true"
        aria-labelledby="bulk-title">
        <header className="bulk-header">
          <span className="bulk-header-icon"><Layers3 size={23}/></span>
          <div>
            <span className="bulk-eyebrow">GESTIÓN DOCUMENTAL · VERSIÓN PRELIMINAR</span>
            <h2 id="bulk-title">Organizar y descargar estándares</h2>
            <p>Organiza la vista o prepara un ZIP con los documentos que elijas.</p>
          </div>
          <button ref={closeRef} className="bulk-close" aria-label="Cerrar" type="button"
            disabled={busy} onClick={onClose}><X size={19}/></button>
        </header>

        <nav className="bulk-tabs" aria-label="Opciones de gestión">
          <button type="button" className={tab === 'manage' ? 'active' : ''}
            disabled={busy} onClick={() => {setTab('manage');setError('');}}>
            <Layers3 size={17}/> Organizar
          </button>
          <button type="button" className={tab === 'download' ? 'active' : ''}
            disabled={busy} onClick={() => {setTab('download');setError('');}}>
            <FileArchive size={17}/> Descargar evidencias
          </button>
        </nav>

        <div className="bulk-body">
          {tab === 'manage' ? (
            <>
              <div className="bulk-info"><Info size={17}/>
                <div><strong>Organiza estándares y medios desde un mismo lugar.</strong>
                  <p>Ocultar un estándar o excluir un medio lo retira del seguimiento de esta vista. Puedes restaurarlo cuando quieras; los documentos adjuntos no se eliminan.</p>
                </div>
              </div>

              <div className="bulk-section-top">
                <strong>Estándares y medios de logro</strong>
                <span>{hiddenIds.length} estándares ocultos · {excludedMedia.length} medios excluidos</span>
              </div>
              <div className="bulk-media-filters">
                <input value={mediumSearch} onChange={event=>setMediumSearch(event.target.value)}
                  placeholder="Buscar E6, nombre o medio 6.1.1…" aria-label="Buscar estándar o medio de logro"/>
                <select value={mediumStandard} onChange={event=>setMediumStandard(event.target.value)}
                  aria-label="Filtrar por estándar">
                  <option value="todos">Todos los estándares</option>
                  {standards.map(st=><option key={st.id} value={st.id}>Estándar E{st.id}</option>)}
                </select>
                {(mediumSearch || mediumStandard!=='todos') && (
                  <button type="button" onClick={()=>{setMediumSearch('');setMediumStandard('todos');}}>
                    <X size={15}/> Limpiar
                  </button>
                )}
              </div>

              <div className="bulk-unified-list">
                {organizedStandards.map(({st,matchingMedia})=>{
                  const isHidden=hiddenIds.includes(st.id);
                  const fileCount=docCountByStandard.get(st.id)||0;
                  const excludedCount=st.points.flatMap(pt=>pt.items).filter(item=>excludedMedia.includes(item.id)).length;
                  const expanded=Boolean(mediumSearch.trim()) || expandedStandards.includes(st.id);
                  return (
                    <section className={'bulk-unified-standard'+(isHidden?' is-hidden':'')} key={st.id}>
                      <div className="bulk-unified-standard-row">
                        <button type="button" className="bulk-unified-expand"
                          aria-expanded={expanded}
                          aria-label={(expanded?'Contraer':'Mostrar')+' medios del estándar '+st.id}
                          onClick={()=>setExpandedStandards(current=>current.includes(st.id)?
                            current.filter(id=>id!==st.id):[...current,st.id])}>
                          <ChevronRight size={17} className={expanded?'is-expanded':''}/>
                          <span className="bulk-standard-code">E{String(st.id).padStart(2,'0')}</span>
                          <span className="bulk-standard-info">
                            <strong>{st.title}</strong>
                            <small>{st.points.flatMap(pt=>pt.items).length} medios · {fileCount} archivos{excludedCount>0?' · '+excludedCount+' excluidos':''}</small>
                          </span>
                        </button>
                        <button type="button" className={'bulk-toggle'+(isHidden?' restore':'')}
                          onClick={()=>toggleVisible(st.id)} disabled={busy}
                          title={isHidden?'Restaurar estándar':'Ocultar estándar sin borrar archivos'}>
                          {isHidden?<ArchiveRestore size={15}/>:<EyeOff size={15}/>}
                          {isHidden?'Restaurar':'Ocultar'}
                        </button>
                      </div>
                      {expanded && (
                        <div className="bulk-unified-media">
                          <div className="bulk-unified-media-label">MEDIOS DEL ESTÁNDAR E{st.id}</div>
                          {matchingMedia.map(medium=>{
                            const excluded=excludedMedia.includes(medium.id);
                            const files=docCountByMedium.get(medium.id)||0;
                            return (
                              <div key={medium.id} className={'bulk-unified-medium-row'+(excluded?' is-excluded':'')}>
                                <span className="bulk-medium-code">{medium.id}</span>
                                <span className="bulk-medium-desc">
                                  <strong>Medio {medium.id}</strong>
                                  <small>{files} {files===1?'archivo conservado':'archivos conservados'} · {excluded?'Fuera del seguimiento':'Incluido en el seguimiento'}</small>
                                </span>
                                <button type="button" className={'bulk-toggle'+(excluded?' restore':'')}
                                  disabled={busy} onClick={()=>toggleMedium(medium.id)}>
                                  {excluded?<ArchiveRestore size={15}/>:<EyeOff size={15}/>}
                                  {excluded?'Restaurar':'Excluir'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
                {organizedStandards.length===0 && (
                  <div className="bulk-unified-empty">
                    <SearchCheck size={23}/>
                    <strong>No se encontraron resultados.</strong>
                    <span>Prueba con otro código de medio o nombre de estándar.</span>
                  </div>
                )}
              </div>
              <p className="bulk-manage-footnote">Las exclusiones son reversibles y solo afectan esta vista preliminar. Los documentos siguen disponibles en Biblioteca y en las descargas.</p>
            </>
          ) : (
            <>
              <div className="bulk-info"><Info size={17}/>
                <div><strong>Exportación de solo lectura.</strong>
                  <p>El ZIP copia los archivos existentes de Supabase. No mueve ni borra ningún documento, y los estándares ocultos también se pueden seleccionar.</p>
                </div>
              </div>
              <div className="bulk-section-top">
                <strong>1. Elige los estándares</strong>
                <span>{selectedIds.length} seleccionados · {documentsToExport.length} documentos</span>
              </div>
              <div className="bulk-preset-actions">
                <button disabled={busy} type="button" onClick={selectFirstFive}><CheckSquare size={15}/> Primeros 5 (E1–E5)</button>
                <button disabled={busy} type="button" onClick={() => setSelectedIds(standards.map(st => st.id))}>Seleccionar todos</button>
                <button disabled={busy} type="button" onClick={() => setSelectedIds(standards.filter(st => !hiddenIds.includes(st.id)).map(st => st.id))}>Solo visibles</button>
                <button disabled={busy} type="button" onClick={() => setSelectedIds([])}>Limpiar</button>
              </div>
              <div className="bulk-check-grid">
                {standards.map(st => (
                  <label className="bulk-check-row" key={st.id}>
                    <input type="checkbox" disabled={busy} checked={selectedIds.includes(st.id)}
                      onChange={() => toggleSelection(st.id)}/>
                    <span className="bulk-check-label"><strong>E{st.id}</strong>
                      <small>{st.title}</small>
                    </span>
                    <span className="bulk-check-count">{docCountByStandard.get(st.id) || 0}</span>
                  </label>
                ))}
              </div>

              <div className="bulk-section-top"><strong>2. ¿Cómo quieres organizar el ZIP?</strong></div>
              <div className="bulk-layout-options">
                {([
                  {value:'full',title:'Carpetas y subcarpetas',subtitle:'Estándar / Punto / Medio / Archivos',icon:FolderTree},
                  {value:'standards',title:'Carpetas por estándar',subtitle:'E1, E2, E3… con sus documentos',icon:Folder},
                  {value:'flat',title:'Solo documentos',subtitle:'Todos juntos, identificados por código',icon:FileText},
                ] as const).map(option => (
                  <label key={option.value} className={'bulk-layout-choice' + (layout === option.value?' active':'')}>
                    <input type="radio" name="bulk-layout" disabled={busy} value={option.value}
                      checked={layout === option.value} onChange={() => setLayout(option.value)}/>
                    <option.icon size={19}/>
                    <span><strong>{option.title}</strong><small>{option.subtitle}</small></span>
                    {layout === option.value && <Check size={17} className="bulk-layout-selected"/>}
                  </label>
                ))}
              </div>
              <div className="bulk-download-estimate">
                <FileArchive size={17}/> {documentsToExport.length} archivo(s) · Tamaño original estimado: {prettyBytes(selectedSize)}
                <span>Límite preliminar: 250 MB por ZIP</span>
              </div>
              {progress && <p className="bulk-progress" role="status"><LoaderCircle size={17}/>{progress}</p>}
            </>
          )}

          {error && <p className="bulk-error" role="alert">{error}</p>}
        </div>

        <footer className="bulk-footer">
          <span>{tab === 'download' ? 'Los archivos originales permanecen intactos.' : 'Las exclusiones son reversibles y solo afectan esta vista preliminar.'}</span>
          <button type="button" className="bulk-cancel" disabled={busy} onClick={onClose}>Cerrar</button>
          {tab === 'download' && (
            <button type="button" className="bulk-download" disabled={busy || documentsToExport.length===0}
              onClick={() => void downloadZip()}>
              {busy ? <LoaderCircle size={17} className="bulk-spin"/> : <Download size={17}/>}
              {busy ? 'Preparando ZIP…' : 'Descargar ZIP'}
              {!busy && <ChevronRight size={15}/>}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
