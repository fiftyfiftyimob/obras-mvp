create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  telefone text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, telefone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'telefone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table public.obras
  add column if not exists dono_id uuid references auth.users(id) on delete cascade;

create index if not exists obras_dono_id_idx on public.obras (dono_id);
create index if not exists frentes_obra_id_idx on public.frentes (obra_id);

alter table public.perfis enable row level security;
alter table public.obras enable row level security;
alter table public.frentes enable row level security;

drop policy if exists "Usuarios leem o proprio perfil" on public.perfis;
create policy "Usuarios leem o proprio perfil"
  on public.perfis for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Usuarios atualizam o proprio perfil" on public.perfis;
create policy "Usuarios atualizam o proprio perfil"
  on public.perfis for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Usuarios leem as proprias obras" on public.obras;
create policy "Usuarios leem as proprias obras"
  on public.obras for select
  to authenticated
  using ((select auth.uid()) = dono_id);

drop policy if exists "Usuarios criam as proprias obras" on public.obras;
create policy "Usuarios criam as proprias obras"
  on public.obras for insert
  to authenticated
  with check ((select auth.uid()) = dono_id);

drop policy if exists "Usuarios atualizam as proprias obras" on public.obras;
create policy "Usuarios atualizam as proprias obras"
  on public.obras for update
  to authenticated
  using ((select auth.uid()) = dono_id)
  with check ((select auth.uid()) = dono_id);

drop policy if exists "Usuarios excluem as proprias obras" on public.obras;
create policy "Usuarios excluem as proprias obras"
  on public.obras for delete
  to authenticated
  using ((select auth.uid()) = dono_id);

drop policy if exists "Usuarios leem frentes das proprias obras" on public.frentes;
create policy "Usuarios leem frentes das proprias obras"
  on public.frentes for select
  to authenticated
  using (
    exists (
      select 1 from public.obras
      where obras.id = frentes.obra_id
        and obras.dono_id = (select auth.uid())
    )
  );

drop policy if exists "Usuarios criam frentes nas proprias obras" on public.frentes;
create policy "Usuarios criam frentes nas proprias obras"
  on public.frentes for insert
  to authenticated
  with check (
    exists (
      select 1 from public.obras
      where obras.id = frentes.obra_id
        and obras.dono_id = (select auth.uid())
    )
  );

drop policy if exists "Usuarios atualizam frentes das proprias obras" on public.frentes;
create policy "Usuarios atualizam frentes das proprias obras"
  on public.frentes for update
  to authenticated
  using (
    exists (
      select 1 from public.obras
      where obras.id = frentes.obra_id
        and obras.dono_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.obras
      where obras.id = frentes.obra_id
        and obras.dono_id = (select auth.uid())
    )
  );

drop policy if exists "Usuarios excluem frentes das proprias obras" on public.frentes;
create policy "Usuarios excluem frentes das proprias obras"
  on public.frentes for delete
  to authenticated
  using (
    exists (
      select 1 from public.obras
      where obras.id = frentes.obra_id
        and obras.dono_id = (select auth.uid())
    )
  );

