import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const failure = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!projectUrl || !anonKey) return failure('No está configurada la conexión a Supabase.', 503);

  const origin = request.headers.get('origin');
  if (origin && new URL(origin).origin !== new URL(request.url).origin)
    return failure('Origen no autorizado.', 403);

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return failure('Inicia sesión para eliminar documentos.', 401);

  // Todas las operaciones de datos usan el token del usuario, nunca service_role.
  // Las políticas RLS de Supabase verifican además la aprobación y autoría.
  const sb = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer ' + token } },
  });

  const { data: { user }, error: identityError } = await sb.auth.getUser(token);
  if (identityError || !user) return failure('La sesión no es válida. Ingresa nuevamente.', 401);

  const { data: profile, error: profileError } = await sb.from('profiles')
    .select('approved,role,full_name').eq('id', user.id).maybeSingle();
  if (profileError || !profile?.approved) return failure('Cuenta no autorizada.', 403);

  let payload: { id?: string; action?: 'trash'|'restore' };
  try { payload = await request.json(); }
  catch { return failure('Solicitud inválida.', 400); }
  if (!payload.id || !/^[a-f0-9-]{36}$/i.test(payload.id))
    return failure('Identificador inválido.', 400);

  const { data: document, error: readError } = await sb.from('evidencias')
    .select('id,file_path,uploaded_by').eq('id', payload.id).maybeSingle();
  if (readError) return failure('No se pudo consultar el documento.', 500);
  if (!document) return failure('Documento no encontrado.', 404);

  if (profile.role !== 'admin' && document.uploaded_by !== user.id)
    return failure('Solo el autor o un administrador puede eliminar el documento.', 403);

  // Solo borrado lógico. NUNCA se elimina el objeto de Storage ni el registro.
  if (payload.action === 'restore') {
    const {data,error}=await sb.from('evidence_trash')
      .delete().eq('evidence_id',document.id).select('evidence_id');
    if (error) return failure('No se pudo recuperar el documento: '+error.message,500);
    if (!data?.length) return failure('Este documento no estaba en la papelera.',404);
    return NextResponse.json({ok:true,action:'restored'},{headers:{'Cache-Control':'no-store'}});
  }
  const {error:trashError}=await sb.from('evidence_trash').insert({
    evidence_id:document.id,
    trashed_by:user.id,
    trashed_by_name:profile.full_name,
  });
  if (trashError) return failure('No se pudo mover a la papelera: '+trashError.message,500);
  return NextResponse.json({ok:true,action:'trashed'},{headers:{'Cache-Control':'no-store'}});

}
