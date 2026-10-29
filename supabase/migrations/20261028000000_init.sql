-- Coursmith: initial schema.
-- Write paths that need validation (submissions, moderation, quiz grading, reviews) go through the
-- Next.js server with the service role; RLS below covers what browsers may read or write directly.

create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('user', 'admin');
create type public.difficulty as enum ('beginner', 'intermediate', 'advanced');
create type public.course_status as enum ('draft', 'published', 'removed');
create type public.version_status as enum (
  'pending_upload',  -- created, waiting for the CLI to upload assets and finalize
  'validating',      -- deterministic checks and asset processing
  'in_review',       -- LLM moderation running
  'needs_revision',
  'approved',        -- the live version of the course
  'rejected',
  'superseded'       -- was approved, replaced by a newer approved version
);
create type public.moderation_decision as enum ('approved', 'needs_revision', 'rejected');
create type public.job_status as enum ('queued', 'running', 'done', 'failed');
create type public.player_mode as enum ('stepper', 'scrolly', 'slides', 'document');
create type public.review_status as enum ('visible', 'hidden');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique check (username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text check (char_length(bio) <= 600),
  avatar_url text,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text := lower(regexp_replace(split_part(coalesce(new.email, 'learner'), '@', 1), '[^a-z0-9]', '', 'gi'));
begin
  if char_length(base) < 3 then base := 'learner'; end if;
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    left(base, 20) || '-' || substr(md5(new.id::text), 1, 6),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', left(base, 80))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- CLI authentication: device flow and API tokens (hashes only, never plaintext)
-- ---------------------------------------------------------------------------

create table public.device_codes (
  id uuid primary key default gen_random_uuid(),
  device_code_hash text not null unique,
  user_code text not null unique check (user_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  client_name text not null,
  client_version text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_by uuid references auth.users (id) on delete cascade,
  approved_at timestamptz,
  denied_at timestamptz,
  consumed_at timestamptz,
  last_polled_at timestamptz
);

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
create index api_tokens_user_idx on public.api_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.categories (
  slug text primary key,
  name text not null,
  sort smallint not null
);

insert into public.categories (slug, name, sort) values
  ('technology', 'Technology', 1),
  ('programming', 'Programming', 2),
  ('data-ai', 'Data & AI', 3),
  ('science', 'Science', 4),
  ('mathematics', 'Mathematics', 5),
  ('engineering', 'Engineering', 6),
  ('business', 'Business', 7),
  ('finance', 'Finance', 8),
  ('marketing', 'Marketing', 9),
  ('design', 'Design', 10),
  ('arts-music', 'Arts & Music', 11),
  ('languages', 'Languages', 12),
  ('history', 'History', 13),
  ('humanities', 'Humanities', 14),
  ('health-wellness', 'Health & Wellness', 15),
  ('environment', 'Environment', 16),
  ('law-policy', 'Law & Policy', 17),
  ('personal-development', 'Personal Development', 18),
  ('education', 'Education', 19),
  ('other', 'Other', 20);

-- array_to_string is only STABLE; generated columns need an IMMUTABLE expression.
create function public.tags_text(tags text[]) returns text
language sql immutable parallel safe as $$ select array_to_string(tags, ' ') $$;

-- One row per course. Catalog fields are copied from the live (approved) version on publish,
-- so anonymous visitors can read title, description, cover and outline without the lesson content.
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  slug citext unique,
  status public.course_status not null default 'draft',
  current_version_id uuid,
  title text,
  subtitle text,
  description text,
  language text,
  difficulty public.difficulty,
  category text references public.categories (slug),
  tags text[] not null default '{}',
  estimated_minutes integer,
  cover_url text,
  accent_color text,
  outline jsonb,
  rating_avg numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  learner_count integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(subtitle, '')), 'B') ||
    setweight(to_tsvector('simple', public.tags_text(tags)), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) stored
);
create index courses_search_idx on public.courses using gin (search);
create index courses_title_trgm_idx on public.courses using gin (title gin_trgm_ops);
create index courses_catalog_idx on public.courses (status, category, difficulty, language);
create index courses_author_idx on public.courses (author_id);

create table public.course_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  version_no integer not null,
  status public.version_status not null default 'pending_upload',
  content jsonb not null,
  schema_version text not null,
  client_version text,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (course_id, version_no)
);
create index course_versions_submitter_idx on public.course_versions (submitted_by, created_at desc);
-- At most one live version per course.
create unique index course_versions_one_approved_idx on public.course_versions (course_id) where status = 'approved';

alter table public.courses
  add constraint courses_current_version_fk
  foreign key (current_version_id) references public.course_versions (id) on delete set null;

create table public.course_assets (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_versions (id) on delete cascade,
  asset_id text not null,
  upload_path text not null,      -- private 'submissions' bucket, as uploaded by the CLI
  public_path text,               -- public 'course-assets' bucket, after processing
  mime text not null,
  bytes integer not null,
  sha256 text not null,
  width integer,
  height integer,
  unique (version_id, asset_id)
);

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------

create table public.moderation_jobs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null unique references public.course_versions (id) on delete cascade,
  status public.job_status not null default 'queued',
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index moderation_jobs_queue_idx on public.moderation_jobs (status, run_after);

create table public.moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_versions (id) on delete cascade,
  decision public.moderation_decision not null,
  summary text not null,
  issues jsonb not null default '[]',
  models jsonb not null default '{}',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  overridden_by uuid references auth.users (id),  -- set when an admin overrides the agent
  created_at timestamptz not null default now()
);
create index moderation_reviews_version_idx on public.moderation_reviews (version_id, created_at desc);

-- Publishes an approved version atomically: supersedes the previous one and copies catalog fields.
create function public.publish_course_version(p_version_id uuid, p_cover_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.course_versions;
  m jsonb;
  base_slug text;
begin
  select * into v from public.course_versions where id = p_version_id for update;
  if not found then raise exception 'version % not found', p_version_id; end if;

  update public.course_versions set status = 'superseded'
    where course_id = v.course_id and status = 'approved' and id <> v.id;
  update public.course_versions set status = 'approved', decided_at = now() where id = v.id;

  m := v.content -> 'meta';
  base_slug := trim(both '-' from left(regexp_replace(lower(m ->> 'title'), '[^a-z0-9]+', '-', 'g'), 60));
  if base_slug = '' then base_slug := 'course'; end if;

  update public.courses c set
    current_version_id = v.id,
    status = case when c.status = 'removed' then c.status else 'published' end,
    slug = coalesce(c.slug, base_slug || '-' || substr(replace(c.id::text, '-', ''), 1, 6)),
    title = m ->> 'title',
    subtitle = m ->> 'subtitle',
    description = m ->> 'description',
    language = m ->> 'language',
    difficulty = (m ->> 'difficulty')::public.difficulty,
    category = m ->> 'category',
    tags = coalesce(array(select jsonb_array_elements_text(m -> 'tags')), '{}'),
    estimated_minutes = (m ->> 'estimatedMinutes')::integer,
    accent_color = m ->> 'accentColor',
    cover_url = p_cover_url,
    outline = jsonb_build_object(
      'sections', (
        select jsonb_agg(jsonb_build_object(
          'id', s -> 'id', 'title', s -> 'title', 'summary', s -> 'summary',
          'steps', (select jsonb_agg(jsonb_build_object('id', st -> 'id', 'title', st -> 'title'))
                    from jsonb_array_elements(s -> 'steps') st)))
        from jsonb_array_elements(v.content -> 'sections') s),
      'learningObjectives', m -> 'learningObjectives',
      'prerequisites', m -> 'prerequisites',
      'quizQuestions', jsonb_array_length(v.content -> 'finalQuiz' -> 'questions')),
    published_at = coalesce(c.published_at, now()),
    updated_at = now()
  where c.id = v.course_id;
end $$;

-- ---------------------------------------------------------------------------
-- Learning
-- ---------------------------------------------------------------------------

create table public.enrollments (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  version_id uuid not null references public.course_versions (id),
  completed_steps text[] not null default '{}',
  last_step_id text,
  preferred_mode public.player_mode not null default 'stepper',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, course_id)
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  version_id uuid not null references public.course_versions (id),
  seed text not null,
  answers jsonb,
  result jsonb,
  correct_count integer,
  total integer,
  score_percent numeric(5, 1),
  passed boolean,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, course_id, started_at desc);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{10}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  version_id uuid not null references public.course_versions (id),
  attempt_id uuid not null references public.quiz_attempts (id),
  score_percent numeric(5, 1) not null,
  issued_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table public.course_reviews (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 2000),
  status public.review_status not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create function public.refresh_course_rating() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := coalesce(new.course_id, old.course_id);
begin
  update public.courses set
    rating_avg = coalesce((select round(avg(rating), 2) from public.course_reviews where course_id = cid and status = 'visible'), 0),
    rating_count = (select count(*) from public.course_reviews where course_id = cid and status = 'visible')
  where id = cid;
  return null;
end $$;

create trigger course_reviews_rating
  after insert or update or delete on public.course_reviews
  for each row execute function public.refresh_course_rating();

create function public.refresh_learner_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.courses set learner_count = learner_count + 1 where id = new.course_id;
  return null;
end $$;

create trigger enrollments_learner_count
  after insert on public.enrollments
  for each row execute function public.refresh_learner_count();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('offensive', 'inaccurate', 'spam', 'copyright', 'other')),
  details text check (char_length(details) <= 2000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.device_codes enable row level security;
alter table public.api_tokens enable row level security;
alter table public.categories enable row level security;
alter table public.courses enable row level security;
alter table public.course_versions enable row level security;
alter table public.course_assets enable row level security;
alter table public.moderation_jobs enable row level security;
alter table public.moderation_reviews enable row level security;
alter table public.enrollments enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.certificates enable row level security;
alter table public.course_reviews enable row level security;
alter table public.reports enable row level security;

-- device_codes and moderation_jobs: no policies, service role only.

create policy "profiles are public" on public.profiles for select using (true);
create policy "users edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (username, display_name, bio, avatar_url) on public.profiles to authenticated;

create policy "users list own tokens" on public.api_tokens for select to authenticated using (user_id = auth.uid());
revoke select on public.api_tokens from anon, authenticated;
grant select (id, user_id, name, token_prefix, created_at, last_used_at, expires_at, revoked_at)
  on public.api_tokens to authenticated;

create policy "categories are public" on public.categories for select using (true);

create policy "published courses are public" on public.courses for select
  using (status = 'published' or author_id = auth.uid() or public.is_admin());

-- Lesson content is served by the server after an auth check; browsers only see their own submissions.
create policy "authors read own versions" on public.course_versions for select to authenticated
  using (submitted_by = auth.uid() or public.is_admin());

create policy "authors read own assets" on public.course_assets for select to authenticated
  using (exists (select 1 from public.course_versions v where v.id = version_id and v.submitted_by = auth.uid())
         or public.is_admin());

create policy "authors read own reviews" on public.moderation_reviews for select to authenticated
  using (exists (select 1 from public.course_versions v where v.id = version_id and v.submitted_by = auth.uid())
         or public.is_admin());

create policy "learners read own enrollments" on public.enrollments for select to authenticated
  using (user_id = auth.uid());

create policy "learners read own attempts" on public.quiz_attempts for select to authenticated
  using (user_id = auth.uid());

create policy "certificates are public" on public.certificates for select using (true);

create policy "visible reviews are public" on public.course_reviews for select
  using (status = 'visible' or user_id = auth.uid() or public.is_admin());

create policy "users file reports" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "users read own reports" on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('submissions', 'submissions', false, 3145728, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('course-assets', 'course-assets', true, 3145728, array['image/webp', 'image/svg+xml', 'image/png']);
-- Uploads to 'submissions' use server-issued signed URLs; 'course-assets' is written by the server only.
