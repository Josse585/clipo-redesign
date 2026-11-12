-- ============================================================
-- CortaClips · base de datos (Supabase)
-- Pega TODO este archivo en Supabase -> SQL Editor -> Run
-- ============================================================

-- Un perfil por usuario con su plan actual.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'basic', 'pro')),
  paypal_subscription_id text,
  created_at timestamptz not null default now()
);

-- Segundos de video procesados por usuario y por día.
create table if not exists public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  seconds integer not null default 0,
  primary key (user_id, day)
);

create index if not exists profiles_subscription_idx on public.profiles (paypal_subscription_id);

-- Seguridad: nadie puede leer ni escribir estas tablas desde el navegador.
-- Solo el servidor (con la clave service_role) las toca.
alter table public.profiles enable row level security;
alter table public.usage enable row level security;

-- Crear el perfil automáticamente cuando alguien se registra.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Plan + segundos usados HOY. El día cambia a medianoche de Bolivia (America/La_Paz).
create or replace function public.user_status(p_user uuid)
returns table (plan text, seconds_today integer)
language sql security definer set search_path = public stable as $$
  select
    coalesce(p.plan, 'free'),
    coalesce((select u.seconds from public.usage u
              where u.user_id = p_user and u.day = (now() at time zone 'America/La_Paz')::date), 0)
  from (select p_user as id) x
  left join public.profiles p on p.id = x.id;
$$;

-- Suma segundos de uso de hoy de forma atómica.
create or replace function public.add_usage(p_user uuid, p_seconds integer)
returns integer language plpgsql security definer set search_path = public as $$
declare total integer;
begin
  insert into public.usage (user_id, day, seconds)
  values (p_user, (now() at time zone 'America/La_Paz')::date, p_seconds)
  on conflict (user_id, day) do update set seconds = public.usage.seconds + excluded.seconds
  returning seconds into total;
  return total;
end;
$$;

-- Estas funciones solo las puede llamar el servidor.
revoke all on function public.user_status(uuid) from public, anon, authenticated;
revoke all on function public.add_usage(uuid, integer) from public, anon, authenticated;
grant execute on function public.user_status(uuid) to service_role;
grant execute on function public.add_usage(uuid, integer) to service_role;

-- Si ya tenías usuarios antes de ejecutar este archivo, esto les crea su perfil.
insert into public.profiles (id)
select id from auth.users
on conflict do nothing;
