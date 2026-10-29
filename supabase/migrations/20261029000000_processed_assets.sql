-- Processed assets stay in the private 'submissions' bucket until the version is approved;
-- publishing copies them to the public 'course-assets' bucket (public_path).
alter table public.course_assets add column processed_path text;
alter table public.course_assets add column processed_mime text;

-- Rate limiting and "is something already under review" lookups.
create index course_versions_course_status_idx on public.course_versions (course_id, status);
