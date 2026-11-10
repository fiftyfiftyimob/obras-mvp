create unique index if not exists colaboradores_obra_telefone_unique_idx
  on public.colaboradores (
    obra_id,
    (
      case
        when pg_catalog.length(pg_catalog.regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g')) in (12, 13)
          and pg_catalog.left(pg_catalog.regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), 2) = '55'
        then pg_catalog.substr(pg_catalog.regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), 3)
        else pg_catalog.regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g')
      end
    )
  )
  where obra_id is not null
    and nullif(pg_catalog.regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), '') is not null;

create unique index if not exists colaboradores_obra_cpf_unique_idx
  on public.colaboradores (
    obra_id,
    (pg_catalog.regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g'))
  )
  where obra_id is not null
    and nullif(pg_catalog.regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g'), '') is not null;

create or replace function private.prevent_duplicate_colaborador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_phone text := pg_catalog.regexp_replace(coalesce(new.telefone, ''), '[^0-9]', '', 'g');
  new_cpf text := pg_catalog.regexp_replace(coalesce(new.cpf, ''), '[^0-9]', '', 'g');
  new_name text := pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(new.nome, ''), '[[:space:]]+', ' ', 'g')));
  new_role text := pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(new.funcao, ''), '[[:space:]]+', ' ', 'g')));
begin
  if new_phone like '55%' and pg_catalog.length(new_phone) in (12, 13) then
    new_phone := pg_catalog.substr(new_phone, 3);
  end if;

  if new.obra_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.colaboradores c
    cross join lateral (
      select
        case
          when pg_catalog.length(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g')) in (12, 13)
            and pg_catalog.left(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 2) = '55'
          then pg_catalog.substr(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 3)
          else pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g')
        end as telefone,
        pg_catalog.regexp_replace(coalesce(c.cpf, ''), '[^0-9]', '', 'g') as cpf
    ) normalized
    where c.obra_id = new.obra_id
      and c.id is distinct from new.id
      and (
        (new_phone <> '' and normalized.telefone = new_phone)
        or (new_cpf <> '' and normalized.cpf = new_cpf)
        or (
          new_name <> ''
          and new_role <> ''
          and new_name = pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(c.nome, ''), '[[:space:]]+', ' ', 'g')))
          and new_role = pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(c.funcao, ''), '[[:space:]]+', ' ', 'g')))
          and not (
            (new_phone <> '' and normalized.telefone <> '' and new_phone <> normalized.telefone)
            or (new_cpf <> '' and normalized.cpf <> '' and new_cpf <> normalized.cpf)
          )
        )
      )
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'colaboradores_obra_duplicado',
      message = 'Telefone, CPF ou colaborador duplicado nesta obra.';
  end if;

  return new;
end;
$function$;

revoke all on function private.prevent_duplicate_colaborador() from public, anon, authenticated;

drop trigger if exists colaboradores_prevent_duplicate on public.colaboradores;
create trigger colaboradores_prevent_duplicate
before insert or update of nome, funcao, telefone, cpf, obra_id
on public.colaboradores
for each row
execute function private.prevent_duplicate_colaborador();