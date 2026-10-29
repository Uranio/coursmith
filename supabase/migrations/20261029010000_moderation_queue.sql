-- Functions are executable by PUBLIC by default, and PostgREST exposes them as /rpc endpoints.
-- Publishing must only happen from the server after moderation.
revoke execute on function public.publish_course_version(uuid, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.refresh_course_rating() from public, anon, authenticated;
revoke execute on function public.refresh_learner_count() from public, anon, authenticated;
grant execute on function public.publish_course_version(uuid, text) to service_role;

-- Claims the next moderation job. Jobs stuck in 'running' longer than p_stale_after (a crashed worker)
-- are claimed again. SKIP LOCKED lets several workers run concurrently without taking the same job.
create function public.claim_moderation_job(p_stale_after interval default interval '10 minutes')
returns setof public.moderation_jobs
language sql security definer set search_path = '' as $$
  update public.moderation_jobs j
     set status = 'running', locked_at = now(), attempts = j.attempts + 1, updated_at = now()
   where j.id = (
     select id from public.moderation_jobs
      where (status = 'queued' and run_after <= now())
         or (status = 'running' and locked_at < now() - p_stale_after)
      order by run_after
      limit 1
      for update skip locked)
  returning j.*;
$$;
revoke execute on function public.claim_moderation_job(interval) from public, anon, authenticated;
grant execute on function public.claim_moderation_job(interval) to service_role;
