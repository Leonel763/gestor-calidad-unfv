'use client';

import {useEffect,useState,type ReactNode,type FormEvent} from 'react';
import type {User} from '@supabase/supabase-js';
import {Landmark,Mail,LockKeyhole,LogIn,LogOut,UserRound,UserPlus,RefreshCw} from 'lucide-react';
import {client} from '../lib/supabase';

export type ApprovedIdentity={id:string;full_name:string;role:'colaborador'|'admin';approved:true};
type AccountProfile={id:string;full_name:string;role:'colaborador'|'admin';approved:boolean};

export function AuthGate({children}:{children:(identity:ApprovedIdentity)=>ReactNode}){
  const sb=client();
  const [user,setUser]=useState<User|null>(null);
  const [booting,setBooting]=useState(true);
  const [profile,setProfile]=useState<AccountProfile|null>(null);
  const [profileLoading,setProfileLoading]=useState(false);
  const [profileError,setProfileError]=useState('');
  const [mode,setMode]=useState<'login'|'signup'>('login');
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);

  useEffect(()=>{
    if(!sb){setBooting(false);return;}
    let active=true;
    const {data:{subscription}}=sb.auth.onAuthStateChange((_event,session)=>{
      if(!active)return;
      setUser(session?.user??null);
      setBooting(false);
    });
    void sb.auth.getUser().then(({data,error:authError})=>{
      if(!active)return;
      setUser(authError?null:data.user);
      setBooting(false);
    }).catch(()=>{if(active){setUser(null);setBooting(false);}});
    return ()=>{active=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!sb||!user){setProfile(null);setProfileLoading(false);return;}
    let active=true;
    setProfileLoading(true);
    setProfileError('');
    void sb.from('profiles').select('id,full_name,approved,role')
      .eq('id',user.id).maybeSingle().then(({data,error:readError})=>{
        if(!active)return;
        setProfile(readError?null:data as AccountProfile|null);
        setProfileError(readError?.message||'');
        setProfileLoading(false);
      }).catch(()=>{
        if(active){setProfile(null);setProfileError('No se pudo cargar el perfil.');setProfileLoading(false);}
      });
    return ()=>{active=false;};
  },[user?.id,reload]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError('');setMessage('');
    if(!sb){setError('No se configuró la conexión con Supabase.');return;}
    if(mode==='signup'&&name.trim().length<2){setError('Escribe tu nombre y apellido.');return;}
    if(mode==='signup'&&password.length<10){setError('Usa al menos 10 caracteres en la contraseña.');return;}
    setSubmitting(true);
    try{
      if(mode==='login'){
        const {error:authError}=await sb.auth.signInWithPassword({email:email.trim(),password});
        if(authError)throw authError;
      }else{
        const {data,error:authError}=await sb.auth.signUp({
          email:email.trim(),password,
          options:{data:{full_name:name.trim()},emailRedirectTo:window.location.origin},
        });
        if(authError)throw authError;
        setPassword('');
        setMessage(data.session
          ? 'Cuenta creada. Espera la aprobación del administrador para entrar.'
          : 'Revisa tu correo y confirma tu cuenta. Luego solicita su aprobación al administrador.');
      }
    }catch(e){setError(e instanceof Error?e.message:'Error al autenticar la cuenta.');}
    finally{setSubmitting(false);}
  }
  async function signOut(){
    if(!sb)return;
    await sb.auth.signOut();
    setUser(null);setProfile(null);setError('');setPassword('');
  }

  if(!sb)return <main className="unfv-auth-screen"><div className="unfv-auth-card">Falta configurar Supabase en esta versión.</div></main>;
  if(booting||(user&&profileLoading))return <main className="unfv-auth-screen"><div className="unfv-auth-card">Comprobando sesión...</div></main>;

  if(user){
    if(profileError||!profile)return (
      <main className="unfv-auth-screen"><section className="unfv-auth-card">
        <h1>No se pudo cargar tu perfil</h1><p>{profileError||'Solicita asistencia al administrador.'}</p>
        <button className="unfv-auth-action" onClick={()=>setReload(x=>x+1)}><RefreshCw size={17}/> Reintentar</button>
        <button className="unfv-auth-switch" onClick={()=>void signOut()}>Cerrar sesión</button>
      </section></main>
    );
    if(!profile.approved)return (
      <main className="unfv-auth-screen"><section className="unfv-auth-card unfv-auth-pending">
        <div className="unfv-auth-logo"><Landmark size={26}/></div>
        <h1>Cuenta pendiente de aprobación</h1>
        <p><strong>{profile.full_name}</strong>, tu cuenta está registrada, pero todavía no tiene acceso a los documentos institucionales.</p>
        <p>Solicita al administrador de Gestión de Calidad que apruebe tu cuenta.</p>
        <button className="unfv-auth-action" onClick={()=>setReload(x=>x+1)}><RefreshCw size={17}/> Comprobar aprobación</button>
        <button className="unfv-auth-switch" onClick={()=>void signOut()}><LogOut size={15}/> Cerrar sesión</button>
      </section></main>
    );
    return <>{children(profile as ApprovedIdentity)}</>;
  }

  return <main className="unfv-auth-screen">
    <section className="unfv-auth-card">
      <div className="unfv-auth-heading"><span className="unfv-auth-logo"><Landmark size={25}/></span>
        <span><strong>UNFV · Gestión de Calidad</strong><small>Facultad de Derecho y Ciencia Política</small></span>
      </div>
      <h1>{mode==='login'?'Iniciar sesión':'Solicitar una cuenta'}</h1>
      <p>{mode==='login'?'Ingresa con tu cuenta para consultar y cargar evidencias.':'Tu nombre aparecerá automáticamente como autor de cada documento.'}</p>
      <form className="unfv-auth-form" onSubmit={event=>void submit(event)}>
        {mode==='signup'&&<label>Nombre y apellido
          <span><UserRound size={16}/><input required maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre y apellidos"/></span>
        </label>}
        <label>Correo electrónico
          <span><Mail size={16}/><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="correo@ejemplo.com"/></span>
        </label>
        <label>Contraseña
          <span><LockKeyhole size={16}/><input required type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:10} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Tu contraseña"/></span>
        </label>
        {error&&<div className="unfv-auth-error" role="alert">{error}</div>}
        {message&&<div className="unfv-auth-success" role="status">{message}</div>}
        <button className="unfv-auth-action" type="submit" disabled={submitting}>
          {mode==='login'?<LogIn size={17}/>:<UserPlus size={17}/>}
          {submitting?'Procesando...':mode==='login'?'Ingresar':'Crear cuenta'}
        </button>
      </form>
      <button className="unfv-auth-switch" type="button"
        onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');setMessage('');setPassword('');}}>
        {mode==='login'?'¿No tienes una cuenta? Solicítala':'¿Ya tienes una cuenta? Inicia sesión'}
      </button>
      <small className="unfv-auth-note">Las cuentas necesitan aprobación de un administrador antes de acceder.</small>
    </section>
  </main>;
}
