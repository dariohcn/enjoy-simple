begin;

create table enjoy.blog_posts (
 id uuid primary key,
 seq bigint generated always as identity,
 author uuid not null references enjoy.profiles(id) on delete cascade,
 parent uuid references enjoy.blog_posts(id) on delete cascade,
 title text,
 body text not null check (char_length(body) between 1 and 3000),
 created timestamptz not null default now(),
 check ((parent is null and title is not null and char_length(title) between 1 and 120)
        or (parent is not null and title is null))
);
create index blog_posts_parent_seq_idx on enjoy.blog_posts(parent, seq desc);
create index blog_posts_author_created_idx on enjoy.blog_posts(author, created desc);
alter table enjoy.blog_posts enable row level security;
revoke all on enjoy.blog_posts from public, anon, authenticated;

create function public.enjoy_blog(action text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 me enjoy.profiles;
 post enjoy.blog_posts;
 saved enjoy.blog_posts;
 topic_id uuid := nullif(payload->>'topic','')::uuid;
 write_id uuid;
 cursor_seq bigint := nullif(payload->>'before','')::bigint;
 subject text := nullif(btrim(payload->>'title'),'');
 content text := nullif(btrim(payload->>'body'),'');
 topic jsonb;
 items jsonb;
begin
 perform enjoy.assert_allowed_ip();
 if auth.uid() is null then raise exception 'Debe iniciar sesión.' using errcode='42501'; end if;
 select * into me from enjoy.profiles where id=auth.uid();
 if not found or me.role not in ('admin','owner') then raise exception 'No existe un perfil autorizado.' using errcode='42501'; end if;
 if me.role='owner' and not exists (
  select 1 from enjoy.workshops w where w.id=me.workshop and w.status='approved' and w.deleted_at is null
 ) then raise exception 'El taller no tiene acceso autorizado.' using errcode='42501'; end if;

 if topic_id is not null then
  select * into post from enjoy.blog_posts where id=topic_id and parent is null;
  if not found then raise exception 'No se encontró el tema.'; end if;
 end if;

 if action='blog-publish' then
  write_id := nullif(payload->>'id','')::uuid;
  if write_id is null or content is null or char_length(content)>3000
    or (topic_id is null and (subject is null or char_length(subject)>120)) then
   raise exception 'Complete los campos y revise su longitud.';
  end if;
  if topic_id is not null then subject := null; end if;
  perform pg_advisory_xact_lock(hashtextextended(me.id::text,91));
  select * into saved from enjoy.blog_posts where id=write_id;
  if not found then
   if (select count(*) from enjoy.blog_posts where author=me.id and created>now()-interval '1 minute')>=8 then
    raise exception 'Espere un momento antes de publicar de nuevo.';
   end if;
   insert into enjoy.blog_posts(id,author,parent,title,body) values(write_id,me.id,topic_id,subject,content)
   on conflict(id) do nothing;
   select * into saved from enjoy.blog_posts where id=write_id;
  end if;
  if saved.author is distinct from me.id or saved.parent is distinct from topic_id
    or saved.title is distinct from subject or saved.body is distinct from content then
   raise exception 'Identificador de publicación ya utilizado.';
  end if;
  return jsonb_build_object('id',saved.id);
 end if;

 if action not in ('blog-list','blog-topic') or (action='blog-topic' and topic_id is null)
   or (action='blog-list' and topic_id is not null) then raise exception 'Operación no disponible.'; end if;

 if topic_id is not null then
  select jsonb_build_object('id',post.id,'title',post.title,'body',post.body,'created',post.created,
   'name',case when p.role='admin' then 'Administración' else coalesce(w.name,'Taller socio') end)
  into topic from enjoy.profiles p left join enjoy.workshops w on w.id=p.workshop where p.id=post.author;
 end if;

 select coalesce(jsonb_agg(row_data.item order by row_data.seq desc),'[]'::jsonb) into items
 from (
  select b.seq,jsonb_build_object('id',b.id,'cursor',b.seq::text,'title',b.title,'created',b.created,
   'body',case when topic_id is null then left(b.body,220) else b.body end,
   'name',case when p.role='admin' then 'Administración' else coalesce(w.name,'Taller socio') end) item
  from enjoy.blog_posts b join enjoy.profiles p on p.id=b.author
  left join enjoy.workshops w on w.id=p.workshop
  where ((topic_id is null and b.parent is null) or b.parent=topic_id)
   and (cursor_seq is null or b.seq<cursor_seq)
  order by b.seq desc limit 16
 ) row_data;
 return jsonb_build_object('topic',topic,'items',items);
end $$;

revoke all on function public.enjoy_blog(text,jsonb) from public, anon, authenticated;
grant execute on function public.enjoy_blog(text,jsonb) to authenticated;

commit;
