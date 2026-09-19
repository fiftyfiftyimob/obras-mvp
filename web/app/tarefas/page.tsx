'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getTarefas } from '../../lib/api';

export default function TarefasPage() {
  const [tarefas, setTarefas] = useState<any[]>([]); const [erro, setErro] = useState('');
  useEffect(() => { getTarefas(new Date().toISOString().slice(0,10)).then(setTarefas).catch(() => setErro('Faça login e verifique se a API está disponível.')); }, []);
  return <><nav className="nav"><strong>Obras MVP</strong><Link href="/">Início</Link></nav><main className="container"><div className="card"><h1>Tarefas de hoje</h1>{erro&&<p style={{color:'crimson'}}>{erro}</p>}{tarefas.length===0&&!erro?<p>Nenhuma tarefa encontrada.</p>:<table className="table"><thead><tr><th>Serviço</th><th>Frente</th><th>Equipe</th><th>Status</th><th>Meta</th></tr></thead><tbody>{tarefas.map(t=><tr key={t.id}><td>{t.servico?.nome||'-'}</td><td>{t.frente?.nome||'-'}</td><td>{t.equipe?.nome||t.colaborador?.nome||'-'}</td><td><span className="badge">{t.status}</span></td><td>{t.quantidadeMeta} {t.unidade}</td></tr>)}</tbody></table>}</div></main></>;
}
