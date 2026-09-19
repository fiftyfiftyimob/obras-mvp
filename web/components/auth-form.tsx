'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HardHat, ArrowRight, ShieldCheck } from 'lucide-react';
import { mensagemErro, supabase } from '../lib/supabase';
export default function AuthForm({ mode }: { mode: 'login'|'cadastro'|'recuperar'|'nova' }) {
 const router=useRouter(); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
 const signup=mode==='cadastro'; const title={login:'Bem-vindo de volta',cadastro:'Comece a organizar suas obras',recuperar:'Recuperar senha',nova:'Defina sua nova senha'}[mode];
 async function submit(e:FormEvent<HTMLFormElement>) { e.preventDefault(); const f=new FormData(e.currentTarget); setBusy(true);setError('');setNotice('');
  try { const email=String(f.get('email')||'').trim(); const password=String(f.get('senha')||'');
   if ((signup||mode==='nova') && password!==f.get('confirmar')) throw new Error('As senhas não coincidem.');
   if (mode==='login') { const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;router.replace('/obras'); }
   if (signup) {const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+'/obras',data:{nome:String(f.get('nome')).trim(),telefone:String(f.get('telefone')||'').trim()}}});if(error)throw error;if(data.session)router.replace('/obras');else setNotice('Confira seu e-mail para confirmar o cadastro. Depois, entre na sua conta.');}
   if (mode==='recuperar') {const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/nova-senha'});if(error)throw error;setNotice('Se houver uma conta com esse e-mail, você receberá as instruções de recuperação.');}
   if(mode==='nova') {const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Abra o link de recuperação recebido por e-mail.');const {error}=await supabase.auth.updateUser({password});if(error)throw error;router.replace('/obras');}
  }catch(e){setError(mensagemErro(e));}finally{setBusy(false);}
 }
 return <div className="auth-layout"><aside className="auth-aside"><Link href="/" className="brand"><HardHat size={30}/><span>obras<span className="brand-dot">.</span></span></Link><div><p className="eyebrow">DO PLANEJAMENTO À EXECUÇÃO</p><h1>Sua obra.<br/>Cada etapa<br/><em>sob controle.</em></h1><p>Reúna pessoas, organize o trabalho e acompanhe o que acontece no canteiro.</p><div className="auth-lines"><span>01 &nbsp; Planeje com clareza</span><span>02 &nbsp; Acompanhe sua equipe</span><span>03 &nbsp; Registre cada avanço</span></div></div><small>Gestão de obras, sem complicação.</small></aside><main className="auth-main"><div className="auth-card"><span className="pill"><ShieldCheck size={15}/> Seu espaço de gestão</span><h2>{title}</h2><p className="muted">{signup?'Crie sua conta de gestor para começar.':'Acesse suas obras e acompanhe o dia a dia.'}</p><form onSubmit={submit}>
 {signup&&<><label>Nome completo<input name="nome" autoComplete="name" required maxLength={120}/></label><label>Telefone<input name="telefone" type="tel" autoComplete="tel" maxLength={30}/></label></>}
 {mode!=='nova'&&<label>E-mail<input name="email" type="email" autoComplete="email" required/></label>}
 {mode!=='recuperar'&&<label>Senha<input name="senha" type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:8} required/>{mode!=='login'&&<small>Mínimo de 8 caracteres.</small>}</label>}
 {(signup||mode==='nova')&&<label>Confirmar senha<input name="confirmar" type="password" autoComplete="new-password" required minLength={8}/></label>}
 {error&&<p className="alert error" role="alert">{error}</p>}{notice&&<p className="alert success" role="status">{notice}</p>}
 <button className="primary full" disabled={busy}>{busy?'Aguarde…':{login:'Entrar',cadastro:'Criar conta',recuperar:'Enviar instruções',nova:'Salvar senha'}[mode]}<ArrowRight size={18}/></button></form>
 {mode==='login'?<><Link className="text-link" href="/recuperar-senha">Esqueci minha senha</Link><p className="auth-footer">Ainda não tem conta? <Link href="/cadastro">Criar conta</Link></p></>:<p className="auth-footer"><Link href="/login">Voltar para entrar</Link></p>}
 </div></main></div>;
}
