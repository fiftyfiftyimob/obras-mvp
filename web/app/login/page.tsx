'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  async function enviar(e: FormEvent) { e.preventDefault(); setErro(''); setCarregando(true); try { const data = await login(telefone, senha); localStorage.setItem('token', data.access_token); localStorage.setItem('usuario', JSON.stringify(data.usuario)); router.push('/tarefas'); } catch { setErro('Telefone ou senha inválidos, ou API indisponível.'); } finally { setCarregando(false); } }
  return <main className="container"><div className="card" style={{maxWidth:420,margin:'60px auto'}}><h1>Entrar</h1><form onSubmit={enviar}><label>Telefone</label><input className="input" value={telefone} onChange={e=>setTelefone(e.target.value)} required/><label>Senha</label><input className="input" type="password" value={senha} onChange={e=>setSenha(e.target.value)} required/>{erro&&<p style={{color:'crimson'}}>{erro}</p>}<button className="button" disabled={carregando}>{carregando?'Entrando...':'Entrar'}</button></form></div></main>;
}
