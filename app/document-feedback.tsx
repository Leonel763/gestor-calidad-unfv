'use client';

import {useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,FileText,MessageCircle,Send,X,RefreshCw} from 'lucide-react';
import {client,type Evidence} from '../lib/supabase';
import type {ApprovedIdentity} from './auth-gate';

export type DocumentCommentBrief={
  evidence_id:string;
  comment_type:'comentario'|'solicitar_correccion';
  status:'abierto'|'resuelto';
};
type DocumentComment=DocumentCommentBrief & {
  id:string;
  author_id:string;
  author_name:string;
  body:string;
  created_at:string;
  resolved_at:string|null;
};

export function DocumentFeedback({
  document:documentFile,
  identity,
  onClose,
  onChanged,
}:{
  document:Evidence;
  identity:ApprovedIdentity;
  onClose:()=>void;
  onChanged:()=>void;
}){
  const sb=client();
  const [comments,setComments]=useState<DocumentComment[]>([]);
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [resolving,setResolving]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const [commentType,setCommentType]=useState<'comentario'|'solicitar_correccion'>('comentario');
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  async function load(){
    if(!sb){setError('No hay conexión con Supabase.');setLoading(false);return;}
    const {data,error:readError}=await sb.from('document_comments')
      .select('id,evidence_id,author_id,author_name,body,comment_type,status,created_at,resolved_at')
      .eq('evidence_id',documentFile.id).order('created_at',{ascending:true});
    if(readError)setError('No se pudieron obtener los comentarios: '+readError.message);
    else {setComments((data||[]) as DocumentComment[]);setError('');}
    setLoading(false);
  }
  useEffect(()=>{void load();},[documentFile.id]);

  async function post(){
    const body=message.trim();
    if(sending || !sb)return;
    if(body.length<3 || body.length>1500){
      setError('El comentario debe tener entre 3 y 1500 caracteres.');
      return;
    }
    setSending(true);setError('');setSuccess('');
    try{
      const {error:insertError}=await sb.from('document_comments').insert({
        evidence_id:documentFile.id,
        author_id:identity.id,
        author_name:identity.full_name,
        body,
        comment_type:commentType,
      });
      if(insertError)throw insertError;
      setMessage('');
      setCommentType('comentario');
      setSuccess(commentType==='solicitar_correccion'
        ? 'Solicitud de corrección registrada. El responsable podrá verla en el documento.'
        : 'Comentario publicado.');
      await load();
      onChanged();
    }catch(reason){
      setError(reason instanceof Error?reason.message:'No se pudo enviar el comentario.');
    }finally{setSending(false);}
  }

  async function setResolved(comment:DocumentComment){
    if(!sb||resolving)return;
    setResolving(comment.id);setError('');setSuccess('');
    const nextStatus=comment.status==='abierto'?'resuelto':'abierto';
    const {data,error:updateError}=await sb.from('document_comments')
      .update({status:nextStatus}).eq('id',comment.id).select('id');
    if(updateError)setError('No se pudo cambiar el estado: '+updateError.message);
    else if(!data?.length)setError('No tienes permiso para resolver esta solicitud.');
    else {setSuccess(nextStatus==='resuelto'?'Solicitud marcada como resuelta.':'Solicitud reabierta.');await load();onChanged();}
    setResolving(null);
  }

  const openRequests=comments.filter(c=>c.comment_type==='solicitar_correccion'&&c.status==='abierto').length;
  const canResolve=identity.role==='admin'||documentFile.uploaded_by===identity.id;

  return (
    <div className="feedback-overlay" role="presentation"
      onMouseDown={event=>{if(event.target===event.currentTarget&&!sending&&!resolving)onClose();}}>
      <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <header className="feedback-header">
          <span className="feedback-head-icon"><MessageCircle size={20}/></span>
          <div>
            <h2 id="feedback-title">Comentarios del documento</h2>
            <p title={documentFile.file_name}>{documentFile.file_name}</p>
          </div>
          <button type="button" className="feedback-close" aria-label="Cerrar comentarios"
            onClick={onClose} disabled={sending||Boolean(resolving)}><X size={18}/></button>
        </header>
        <div className="feedback-summary">
          <span><MessageCircle size={15}/>{comments.length} comentario(s)</span>
          <span className={openRequests?'feedback-open-requests has-open':'feedback-open-requests'}>
            <AlertTriangle size={15}/>{openRequests} corrección(es) pendiente(s)
          </span>
        </div>
        <div className="feedback-content">
          <div className="feedback-history" aria-label="Historial de comentarios">
            {loading?<p className="feedback-empty">Cargando comentarios…</p>:
             !comments.length?<div className="feedback-empty">
               <MessageCircle size={25}/>
               <strong>Aún no hay comentarios</strong>
               <small>Puedes señalar un error, pedir un cambio o dejar una observación sobre este archivo.</small>
             </div>:
             comments.map(comment=>(
               <article key={comment.id} className={'feedback-comment'+(comment.comment_type==='solicitar_correccion'?' is-request':'')}>
                 <div className="feedback-comment-top">
                   <span className="feedback-avatar" aria-hidden="true">{comment.author_name.trim().slice(0,1).toUpperCase()}</span>
                   <div className="feedback-comment-author">
                     <strong>{comment.author_name}{comment.author_id===identity.id?' · Tú':''}</strong>
                     <small>{new Date(comment.created_at).toLocaleString('es-PE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small>
                   </div>
                   {comment.comment_type==='solicitar_correccion'&&
                     <span className={comment.status==='abierto'?'feedback-request-label open':'feedback-request-label resolved'}>
                       {comment.status==='abierto'?<AlertTriangle size={13}/>:<CheckCircle2 size={13}/>}
                       {comment.status==='abierto'?'Requiere corrección':'Resuelta'}
                     </span>
                   }
                 </div>
                 <p>{comment.body}</p>
                 <div className="feedback-comment-bottom">
                   <button type="button" onClick={()=>{
                     setCommentType('comentario');
                     setMessage('@'+comment.author_name+' ');
                   }}>Responder</button>
                   {canResolve&&comment.comment_type==='solicitar_correccion'&&
                     <button type="button" disabled={resolving===comment.id}
                       onClick={()=>void setResolved(comment)}>
                       {resolving===comment.id?'Guardando…':comment.status==='abierto'?'Marcar como resuelta':'Reabrir'}
                     </button>
                   }
                 </div>
               </article>
             ))
            }
          </div>
          <div className="feedback-compose">
            <h3>Dejar una observación</h3>
            <div className="feedback-kind" role="group" aria-label="Tipo de comentario">
              <button type="button" className={commentType==='comentario'?'active':''}
                onClick={()=>setCommentType('comentario')}><MessageCircle size={14}/> Comentario</button>
              <button type="button" className={commentType==='solicitar_correccion'?'active warning':''}
                onClick={()=>setCommentType('solicitar_correccion')}><AlertTriangle size={14}/> Solicitar corrección</button>
            </div>
            <label htmlFor="feedback-text">Mensaje</label>
            <textarea id="feedback-text" rows={3} maxLength={1500} value={message}
              onChange={event=>setMessage(event.target.value)}
              placeholder={commentType==='solicitar_correccion'
                ? 'Ej.: Este no es el documento correspondiente al medio de logro. Por favor, reemplazarlo.'
                : 'Escribe tu comentario sobre el archivo…'}/>
            <div className="feedback-message-help">
              <span>Tu nombre quedará registrado. El archivo original no se modifica.</span>
              <span>{message.length}/1500</span>
            </div>
            {error&&<p role="alert" className="feedback-error">{error}</p>}
            {success&&<p role="status" className="feedback-success">{success}</p>}
            <div className="feedback-compose-actions">
              <button type="button" className="feedback-cancel" onClick={onClose}>Cerrar</button>
              <button type="button" className="feedback-send" disabled={!sb||sending||message.trim().length<3}
                onClick={()=>void post()}><Send size={15}/>{sending?'Publicando…':'Publicar'}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
