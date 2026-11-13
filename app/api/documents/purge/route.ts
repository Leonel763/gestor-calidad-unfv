import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export const runtime='nodejs';

const failure=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Eliminación definitiva bajo demanda. Nunca ejecuta limpieza automática.
 * El JWT del usuario aplica las políticas RLS a Storage y PostgreSQL.
 * Primero se elimina el objeto físico (Storage API); únicamente después
 * se elimina el registro en evidencias (con sus referencias ON DELETE CASCADE).
 */
export async function POST(request:Request){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return failure('No está configurada la conexión con Supabase.',503);
  const origin=request.headers.get('origin');
  if(origin && new URL(origin).origin!==new URL(request.url).origin)
    return failure('Origen no autorizado.',403);
  const token=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return failure('Inicia sesión para administrar la papelera.',401);
  const sb=createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:'Bearer '+token}},
  });
  const {data:{user},error:userError}=await sb.auth.getUser(token);
  if(userError||!user)return failure('La sesión no es válida.',401);
  const {data:profile,error:profileError}=await sb.from('profiles').select('approved,role')
    .eq('id',user.id).maybeSingle();
  if(profileError||!profile?.approved||profile.role!=='admin')
    return failure('Solo un administrador autorizado puede eliminar definitivamente documentos.',403);

  let payload:unknown;
  try{payload=await request.json();}catch{return failure('Solicitud inválida.',400);}
  if(!payload||typeof payload!=='object')return failure('Solicitud inválida.',400);
  const data=payload as {ids?:unknown;confirmation?:unknown};
  if(data.confirmation!=='ELIMINAR DEFINITIVAMENTE')
    return failure('Se requiere confirmación explícita de la eliminación irreversible.',400);
  if(!Array.isArray(data.ids)||data.ids.length===0||data.ids.length>50||
    data.ids.some(id=>typeof id!=='string'||!UUID.test(id))||
    new Set(data.ids).size!==data.ids.length)
    return failure('Selecciona entre 1 y 50 documentos válidos y sin duplicados.',400);

  const {data:trashed,error:trashError}=await sb.from('evidence_trash').select('evidence_id')
    .in('evidence_id',data.ids);
  if(trashError)return failure('No fue posible verificar la papelera: '+trashError.message,500);
  const trashIds=new Set((trashed||[]).map(row=>row.evidence_id));
  if(data.ids.some(id=>!trashIds.has(id)))return failure('La selección incluye documentos que ya no están en la papelera. Recarga la vista.',409);
  const {data:docs,error:readError}=await sb.from('evidencias')
    .select('id,file_name,file_path,size_bytes').in('id',data.ids);
  if(readError)return failure('No se pudo verificar la selección: '+readError.message,500);
  if((docs||[]).length!==data.ids.length)return failure('Uno o más documentos ya no existen. Recarga la vista.',409);

  const success:string[]=[];
  const failed:{id:string;reason:string}[]=[];
  // Individualmente: un fallo no permite borrar los demás registros de manera inconsistente.
  for(const id of data.ids as string[]){
    const doc=docs!.find(row=>row.id===id)!;
    // Comprobar de nuevo su estado para reducir conflictos con una restauración concurrente.
    const {data:stillTrashed,error:checkError}=await sb.from('evidence_trash')
      .select('evidence_id').eq('evidence_id',id).maybeSingle();
    if(checkError||!stillTrashed){failed.push({id,reason:'El documento ya no está disponible en la papelera.'});continue;}
    const {data:storageResult,error:storageError}=await sb.storage.from('evidencias').remove([doc.file_path]);
    if(storageError || !storageResult?.length){
      failed.push({id,reason:'No se confirmó la eliminación física: '+(storageError?.message||'Sin confirmación del almacenamiento.')});
      continue;
    }
    const {data:deleted,error:dbError}=await sb.from('evidencias')
      .delete().eq('id',id).select('id');
    if(dbError||!deleted?.length){
      failed.push({id,reason:'Archivo físico eliminado, pero falta limpiar su registro. Contacta al administrador.'});
      continue;
    }
    success.push(id);
  }
  return NextResponse.json({ok:failed.length===0,deletedIds:success,failed},
    {status:failed.length?207:200,headers:{'Cache-Control':'no-store'}});
}
