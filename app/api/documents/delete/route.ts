import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export const runtime='nodejs';
const failure=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request:Request){
  const projectUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serverKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!projectUrl||!anonKey||!serverKey)return failure('El servicio de eliminación no está configurado.',503);
  if(request.headers.get('origin')&&new URL(request.headers.get('origin')!).origin!==new URL(request.url).origin)
    return failure('Origen no autorizado',403);

  const bearer=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!bearer)return failure('Debes iniciar sesión.',401);

  const auth=createClient(projectUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(bearer);
  if(authError||!user)return failure('Sesión no válida o caducada.',401);

  const admin=createClient(projectUrl,serverKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:profile,error:profileError}=await admin.from('profiles')
    .select('approved,role').eq('id',user.id).maybeSingle();
  if(profileError||!profile?.approved)return failure('Cuenta sin autorización.',403);

  let payload:{id?:string};
  try{payload=await request.json();}catch{return failure('Solicitud inválida.',400);}
  if(!payload.id||!/^[a-f0-9-]{36}$/i.test(payload.id))return failure('ID inválido.',400);

  const {data:doc,error:readError}=await admin.from('evidencias')
    .select('id,file_path,uploaded_by').eq('id',payload.id).maybeSingle();
  if(readError)return failure('Error consultando el documento.',500);
  if(!doc)return failure('Documento no encontrado.',404);

  // Documentos anteriores al login solo pueden ser eliminados por el administrador.
  if(profile.role!=='admin'&&doc.uploaded_by!==user.id)
    return failure('Solo el propietario o un administrador puede eliminar este documento.',403);

  const {error:storageError}=await admin.storage.from('evidencias').remove([doc.file_path]);
  if(storageError)return failure('No se pudo quitar el archivo del almacenamiento.',500);

  const {error:dbError}=await admin.from('evidencias').delete().eq('id',doc.id);
  if(dbError)return failure('El archivo se borró, pero no se pudo eliminar el registro. Contacta al administrador.',500);

  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}
