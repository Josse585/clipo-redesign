-- Historial privado de clips con retención de 24 horas.
-- Esta migración se aplica en el proyecto Clipo. Requiere pg_cron, pg_net y Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  snippet text not null default '',
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists clips_user_created_idx on public.clips(user_id, created_at desc);
create index if not exists clips_expiry_idx on public.clips(expires_at);
alter table public.clips enable row level security;
revoke all on public.clips from anon, authenticated;
grant all on public.clips to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clipo-videos', 'clipo-videos', false, 1073741824, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists clipo_users_insert_own on storage.objects;
create policy clipo_users_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'clipo-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists clipo_users_read_own on storage.objects;
create policy clipo_users_read_own on storage.objects for select to authenticated
using (bucket_id = 'clipo-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists clipo_users_delete_own on storage.objects;
create policy clipo_users_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'clipo-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.clip_deletion_queue (
  clip_id uuid primary key references public.clips(id) on delete cascade,
  storage_path text not null,
  request_id bigint,
  requested_at timestamptz not null default now()
);
revoke all on public.clip_deletion_queue from anon, authenticated;
grant all on public.clip_deletion_queue to service_role;
alter table public.clip_deletion_queue enable row level security;

create or replace function public.clipo_queue_expired_clips()
returns integer language plpgsql security definer set search_path = public, storage, net, vault
as $$
declare c record; req bigint; secret_key text; base_url text; n integer := 0;
begin
  select decrypted_secret into secret_key from vault.decrypted_secrets where name = 'clips_supabase_service_key';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'clips_supabase_url';
  if secret_key is null or base_url is null then raise exception 'Missing Clipo cleanup secrets in Vault'; end if;
  for c in
    select id, storage_path from public.clips
    where expires_at <= now()
      and not exists (select 1 from public.clip_deletion_queue q where q.clip_id = clips.id)
  loop
    insert into public.clip_deletion_queue(clip_id, storage_path, request_id)
    values (c.id, c.storage_path, null) on conflict (clip_id) do nothing;
    req := net.http_delete(
      url := base_url || '/storage/v1/object/clipo-videos/' || c.storage_path,
      headers := jsonb_build_object('Authorization', 'Bearer ' || secret_key, 'apikey', secret_key),
      timeout_milliseconds := 60000
    );
    update public.clip_deletion_queue set request_id = req, requested_at = now() where clip_id = c.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.clipo_queue_expired_clips() from public, anon, authenticated;
grant execute on function public.clipo_queue_expired_clips() to service_role;

create or replace function public.clipo_finalize_clip_deletions()
returns integer language plpgsql security definer set search_path = public, net
as $$
declare q record; n integer := 0;
begin
  for q in
    select clip_id, request_id from public.clip_deletion_queue
    where request_id is not null
      and exists (select 1 from net._http_response r where r.id = request_id)
  loop
    if exists (select 1 from net._http_response r where r.id = q.request_id and (r.status_code between 200 and 299 or r.status_code = 404)) then
      delete from public.clips where id = q.clip_id;
      n := n + 1;
    else
      update public.clip_deletion_queue set request_id = null, requested_at = now() where clip_id = q.clip_id;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.clipo_finalize_clip_deletions() from public, anon, authenticated;
grant execute on function public.clipo_finalize_clip_deletions() to service_role;

select cron.unschedule(jobid) from cron.job where jobname in ('clipo-queue-expired-clips','clipo-finalize-clip-deletions');
select cron.schedule('clipo-queue-expired-clips','*/5 * * * *','select public.clipo_queue_expired_clips()');
select cron.schedule('clipo-finalize-clip-deletions','*/5 * * * *','select public.clipo_finalize_clip_deletions()');
