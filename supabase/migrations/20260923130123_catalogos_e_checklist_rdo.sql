alter table public.rdos_itens
  add column if not exists tarefa_id integer references public.tarefas(id) on delete set null;

create unique index if not exists rdos_itens_rdo_tarefa_idx
  on public.rdos_itens (rdo_id, tarefa_id)
  where tarefa_id is not null;

create index if not exists tarefas_obra_data_idx
  on public.tarefas (obra_id, data);

grant delete on public.rdos_itens to authenticated;

drop policy if exists itens_delete on public.rdos_itens;
create policy itens_delete
  on public.rdos_itens for delete to authenticated
  using (
    exists (
      select 1
      from public.rdos r
      where r.id = rdo_id
        and private.possui_obra(r.obra_id)
    )
  );

create or replace function private.validar_item_rdo_tarefa()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tarefa public.tarefas;
  obra_diario integer;
begin
  if new.tarefa_id is null then
    return new;
  end if;

  select * into tarefa
  from public.tarefas
  where id = new.tarefa_id;

  select obra_id into obra_diario
  from public.rdos
  where id = new.rdo_id;

  if tarefa.id is null or obra_diario is null then
    raise exception 'Tarefa ou diário não encontrado.';
  end if;

  if tarefa.obra_id is distinct from obra_diario
    or tarefa.data is distinct from (select data from public.rdos where id = new.rdo_id)
    or tarefa.frente_id is distinct from new.frente_id
    or tarefa.servico_id is distinct from new.servico_id
    or tarefa.equipe_id is distinct from new.equipe_id
    or tarefa.unidade is distinct from new.unidade then
    raise exception 'O item deve corresponder à tarefa planejada para este diário.';
  end if;

  return new;
end;
$$;

drop trigger if exists validar_item_rdo_tarefa on public.rdos_itens;
create trigger validar_item_rdo_tarefa
before insert or update on public.rdos_itens
for each row execute function private.validar_item_rdo_tarefa();

insert into public.servicos (nome, unidade, produtividade_referencia, descricao, dono_id)
select catalogo.nome, catalogo.unidade, catalogo.produtividade, catalogo.descricao, null
from (
  values
    ('Pintura', 'm²', 8.00::numeric, 'Pintura de paredes e tetos'),
    ('Concretagem', 'm³', 2.00::numeric, 'Lançamento e acabamento de concreto'),
    ('Forma', 'm²', 6.00::numeric, 'Montagem e desmontagem de formas'),
    ('Armação', 'kg', 80.00::numeric, 'Corte, dobra e montagem de armaduras'),
    ('Instalação elétrica', 'un', null::numeric, 'Pontos e instalações elétricas'),
    ('Instalação hidráulica', 'un', null::numeric, 'Pontos e instalações hidráulicas'),
    ('Assentamento de piso', 'm²', 5.00::numeric, 'Assentamento de pisos'),
    ('Gesso', 'm²', 10.00::numeric, 'Forros e revestimentos em gesso'),
    ('Impermeabilização', 'm²', 6.00::numeric, 'Execução de impermeabilização')
) as catalogo(nome, unidade, produtividade, descricao)
where not exists (
  select 1
  from public.servicos s
  where s.dono_id is null
    and lower(s.nome) = lower(catalogo.nome)
);
