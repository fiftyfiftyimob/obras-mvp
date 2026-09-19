-- Schema MVP - Sistema de Gestão de Produção em Obras

-- UsuÃ¡rios
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT UNIQUE,
    telefone TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL CHECK (perfil IN ('gestor', 'estagiario', 'operario')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Obras
CREATE TABLE IF NOT EXISTS obras (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    cliente_nome TEXT,
    cliente_contato TEXT,
    responsavel_id INTEGER REFERENCES usuarios(id),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Frentes
CREATE TABLE IF NOT EXISTS frentes (
    id SERIAL PRIMARY KEY,
    obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    nivel INTEGER NOT NULL DEFAULT 0,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ServiÃ§os
CREATE TABLE IF NOT EXISTS servicos (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    unidade TEXT NOT NULL,
    produtividade_referencia NUMERIC(10,2),
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Equipes
CREATE TABLE IF NOT EXISTS equipes (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    obra_id INTEGER REFERENCES obras(id),
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Colaboradores
CREATE TABLE IF NOT EXISTS colaboradores (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    funcao TEXT NOT NULL,
    telefone TEXT,
    cpf TEXT,
    obra_id INTEGER REFERENCES obras(id),
    equipe_principal_id INTEGER REFERENCES equipes(id),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Equipe-Colaborador
CREATE TABLE IF NOT EXISTS equipe_colaboradores (
    id SERIAL PRIMARY KEY,
    equipe_id INTEGER NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    data_inicio DATE NOT NULL,
    data_fim DATE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (equipe_id, colaborador_id, data_inicio)
);

-- Compromissos Semanais
CREATE TABLE IF NOT EXISTS compromissos_semanais (
    id SERIAL PRIMARY KEY,
    obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    semana_inicio DATE NOT NULL,
    semana_fim DATE NOT NULL,
    servico_id INTEGER NOT NULL REFERENCES servicos(id),
    frente_id INTEGER NOT NULL REFERENCES frentes(id),
    equipe_id INTEGER NOT NULL REFERENCES equipes(id),
    quantidade_meta NUMERIC(10,2) NOT NULL,
    unidade TEXT NOT NULL,
    dias_previstos TEXT,
    observacao TEXT,
    criado_por_id INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tarefas
CREATE TABLE IF NOT EXISTS tarefas (
    id SERIAL PRIMARY KEY,
    obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    compromisso_semanal_id INTEGER REFERENCES compromissos_semanais(id),
    servico_id INTEGER NOT NULL REFERENCES servicos(id),
    frente_id INTEGER NOT NULL REFERENCES frentes(id),
    equipe_id INTEGER REFERENCES equipes(id),
    colaborador_id INTEGER REFERENCES colaboradores(id),
    data DATE NOT NULL,
    turno TEXT,
    quantidade_meta NUMERIC(10,2) NOT NULL,
    unidade TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'nao_iniciada' CHECK (status IN ('nao_iniciada', 'em_execucao', 'pausada', 'concluida', 'bloqueada')),
    observacao TEXT,
    criado_por_id INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- EvoluÃ§Ãµes
CREATE TABLE IF NOT EXISTS evolucoes_tarefa (
    id SERIAL PRIMARY KEY,
    tarefa_id INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    colaborador_id INTEGER REFERENCES colaboradores(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('inicio', 'pausa', 'retomada', 'conclusao', 'impedimento')),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    quantidade_realizada NUMERIC(10,2),
    foto_url TEXT,
    observacao TEXT,
    motivo_impedimento TEXT CHECK (motivo_impedimento IS NULL OR motivo_impedimento IN ('falta_material', 'falta_ferramenta', 'frente_ocupada', 'projeto_pendente', 'chuva', 'espera_equipe', 'seguranca', 'outro')),
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    altitude NUMERIC(10, 2)
);

-- LocalizaÃ§Ãµes
CREATE TABLE IF NOT EXISTS localizacoes_periodicas (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id),
    colaborador_id INTEGER REFERENCES colaboradores(id),
    tarefa_id INTEGER REFERENCES tarefas(id),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    altitude NUMERIC(10, 2),
    precisao_metros NUMERIC(10, 2)
);

-- RDO
CREATE TABLE IF NOT EXISTS rdos (
    id SERIAL PRIMARY KEY,
    obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    clima TEXT,
    observacao_geral TEXT,
    criado_por_id INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (obra_id, data)
);

-- Itens do RDO
CREATE TABLE IF NOT EXISTS rdos_itens (
    id SERIAL PRIMARY KEY,
    rdo_id INTEGER NOT NULL REFERENCES rdos(id) ON DELETE CASCADE,
    frente_id INTEGER NOT NULL REFERENCES frentes(id),
    servico_id INTEGER NOT NULL REFERENCES servicos(id),
    equipe_id INTEGER REFERENCES equipes(id),
    quantidade_realizada NUMERIC(10,2) NOT NULL,
    unidade TEXT NOT NULL,
    observacao TEXT
);

-- Dados iniciais - ServiÃ§os
INSERT INTO servicos (nome, unidade, produtividade_referencia, descricao) VALUES
('Alvenaria', 'm2', 8.00, 'ExecuÃ§Ã£o de alvenaria'),
('Reboco', 'm2', 6.00, 'ExecuÃ§Ã£o de reboco'),
('Contrapiso', 'm2', 12.00, 'ExecuÃ§Ã£o de contrapiso'),
('Revestimento', 'm2', 5.00, 'Revestimento cerÃ¢mico'),
('Limpeza', 'm2', 50.00, 'Limpeza de Ã ¡rea')
ON CONFLICT (nome) DO NOTHING;
