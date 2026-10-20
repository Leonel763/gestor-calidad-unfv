import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
const failure = (error: string, status: number) => NextResponse.json({error}, {status, headers:{'Cache-Control':'no-store'}});

function constantTimePassword(input:string, expected:string){
  const a=Buffer.from(input,'utf8'), b=Buffer.from(expected,'utf8');
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function POST(request:Request){
  const projectUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminPassword=process.env.ADMIN_DELETE_PASSWORD;
  if(!projectUrl||!serverKey||!adminPassword){
    return failure('La eliminación aún no está habilitada. Configura las variables de administrador en Vercel.',503);
  }
  if(request.headers.get('origin') && new URL(request.headers.get('origin')!).origin!==new URL(request.url).origin){
    return failure('Origen no autorizado',403);
  }
  let payload:{id?:string,password?:string};
  try{payload=await request.json()}catch{return failure('Solicitud inválida',400)}
  if(!payload.id||!(/^[a-f0-9-]{36}$/i.test(payload.id))||typeof payload.password!=='string')return failure('Solicitud inválida',400);
  if(!constantTimePassword(payload.password,adminPassword))return failure('Clave incorrecta',403);
  const admin=createClient(projectUrl,serverKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data,error}=await admin.from('evidencias').select('id,file_path').eq('id',payload.id).maybeSingle();
  if(error)return failure('No se pudo consultar el documento',500);
  if(!data)return failure('Documento no encontrado',404);
  // Eliminar primero de Storage evita registros fantasma cuando falla el borrado del archivo.
  const {error:storageError}=await admin.storage.from('evidencias').remove([data.file_path]);
  if(storageError)return failure('No se pudo borrar el archivo del almacenamiento',500);
  const {error:dbError}=await admin.from('evidencias').delete().eq('id',data.id);
  if(dbError)return failure('Se borró el archivo, pero no se pudo quitar su registro. Contacta al administrador.',500);
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}