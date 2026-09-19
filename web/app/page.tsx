import Link from 'next/link';

export default function Home() {
  return <><nav className="nav"><strong>Obras MVP</strong><div className="nav-links"><Link href="/login">Entrar</Link><Link href="/tarefas">Tarefas</Link></div></nav><main className="container"><div className="card"><h1>Gestão de produção em obras</h1><p>Organize equipes, distribua tarefas e acompanhe a execução.</p><Link className="button" href="/login">Acessar sistema</Link></div><div className="grid"><div className="card"><h2>Obras</h2><p>Cadastre e acompanhe suas obras.</p></div><div className="card"><h2>Tarefas</h2><p>Distribua e registre a evolução dos serviços.</p></div><div className="card"><h2>RDO</h2><p>Prepare o relatório diário de obra.</p></div></div></main></>;
}
