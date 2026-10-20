import {createClient, type SupabaseClient} from '@supabase/supabase-js';
let sharedClient: SupabaseClient | null = null;
export function client(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)return null;return sharedClient??(sharedClient=createClient(url,key));}
export type Evidence={id:string;point_id:string;file_name:string;file_path:string;mime_type:string;size_bytes:number;uploader:string;notes:string;created_at:string};
export type Tracking={point_id:string;status:'pendiente'|'en_proceso'|'complementar'|'completo';notes:string;updated_at:string};
