-- Client-side audio recording replaces Daily's server-side cloud recording
-- (which bills per recorded minute from minute one, no free tier). Audio is
-- now captured in the browser (merged local + remote via Web Audio API) and
-- uploaded straight here — same "free like text" cost profile as the rest
-- of the archive.

insert into storage.buckets (id, name, public)
values ('battle-recordings', 'battle-recordings', true)
on conflict (id) do nothing;

-- Anyone can read (archive/matches pages are public, same as recording-link
-- was before).
drop policy if exists "public read battle recordings" on storage.objects;
create policy "public read battle recordings" on storage.objects
  for select
  using (bucket_id = 'battle-recordings');

-- Only a participant in the battle a file is named after may upload/replace
-- it. Object name is "<battle_id>.webm", so we match that against the
-- battles table the same way the "participants update battle" policy on
-- eztren.battles already does.
drop policy if exists "participants upload own battle recording" on storage.objects;
create policy "participants upload own battle recording" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'battle-recordings'
    and exists (
      select 1 from eztren.battles b
      where b.id::text = split_part(storage.objects.name, '.', 1)
        and (
          b.player_a_id in (select id from eztren.players where user_id = auth.uid())
          or b.player_b_id in (select id from eztren.players where user_id = auth.uid())
        )
    )
  );

drop policy if exists "participants overwrite own battle recording" on storage.objects;
create policy "participants overwrite own battle recording" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'battle-recordings'
    and exists (
      select 1 from eztren.battles b
      where b.id::text = split_part(storage.objects.name, '.', 1)
        and (
          b.player_a_id in (select id from eztren.players where user_id = auth.uid())
          or b.player_b_id in (select id from eztren.players where user_id = auth.uid())
        )
    )
  );
