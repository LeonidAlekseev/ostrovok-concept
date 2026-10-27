-- `hotel_view_lines` (20261026150000) with the rays of the horizon: a target `{"lat", "lon", "horizon": true}` is only the
-- end of a ray, so the building standing there is an obstacle like the rest, not the target whose top is seen. The
-- rest is as in 20261026150000. Idempotent: safe to re-run on a database that already has this function.
--
-- Rollback: re-run 20261026150000_hotel_view.sql (the `horizon` key is then ignored).

-- For each target point, the straight line from the hotel's point to it, at most 6 km long and at most 160 lines a call
-- (a line of 1.5 km takes ~8 ms in the centre of Valencia), and on it:
--   * the buildings it crosses, but the hotel's own (the one `hotel_geo` finds: the nearest within 50 m) and the one at
--     the target point: each at the distance of its nearest crossing from the hotel (planar, ~0.1 % at 6 km), seen at the
--     angle above the window's horizontal `atan((height − eye_m − d² / (2 R')) / d)`, where `d² / (2 R')` is how far the
--     Earth's curvature lowers it with the standard refraction (k = 0.13, R' = 6 371 km / (1 − 0.13) ≈ 7 323 km);
--     `max_angle` with EUBUCCO's height, `max_angle_upper` with the upper bound of its confidence interval, `blocker`
--     the building of `max_angle`, `first_above_m` the nearest one whose top is above the window;
--   * `covered_m`: how far from the hotel the dataset covers the line — a point every 100 m counts when a building of
--     the dataset stands within 0.003° of it (~330 m north–south, ~260 m east–west at Valencia's latitude); past the first point that does not, the dataset may lack buildings (another
--     municipality, a gap) and nothing is known;
--   * `target_building`: the building of the dataset at the target point, if any — its top is what is seen of it. A
--     target with `"horizon": true` is only the end of a ray of the horizon: its building is an obstacle like the rest.
-- Ground is taken as flat: the dataset has heights above the ground, no terrain. Lines longer than 6 km or with bad
-- coordinates come back with `checked: false`.
create or replace function public.hotel_view_lines(
  lat double precision,
  lon double precision,
  eye_m double precision,
  targets jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with o as (
    select extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326) as g,
      111320 * cos(radians(lat)) as kx, 110574.0::double precision as ky
    where lat between -90 and 90 and lon between -180 and 180 and eye_m between 0 and 1000
      and jsonb_typeof(targets) = 'array'
  ),
  own as (
    select n.id
    from o cross join lateral (
      select b.id, extensions.st_distance(b.geom::extensions.geography, o.g::extensions.geography) as distance_m
      from public.geo_buildings b
      order by b.geom operator(extensions.<->) o.g
      limit 1
    ) n
    where n.distance_m <= 50
  ),
  t as (
    select (x.k - 1)::int as i, coalesce(x.v -> 'horizon' = 'true'::jsonb, false) as horizon,
      extensions.st_setsrid(extensions.st_makepoint((x.v ->> 'lon')::double precision, (x.v ->> 'lat')::double precision), 4326) as g
    from o, jsonb_array_elements(targets) with ordinality x(v, k)
    where x.k <= 160
      and jsonb_typeof(x.v -> 'lat') = 'number' and jsonb_typeof(x.v -> 'lon') = 'number'
      and (x.v ->> 'lat')::double precision between -90 and 90 and (x.v ->> 'lon')::double precision between -180 and 180
  ),
  l as (
    select t.i, t.horizon, t.g as tg, extensions.st_makeline(o.g, t.g) as line,
      sqrt(power((extensions.st_x(t.g) - extensions.st_x(o.g)) * o.kx, 2)
        + power((extensions.st_y(t.g) - extensions.st_y(o.g)) * o.ky, 2)) as len
    from t, o
  ),
  ok as (select * from l where l.len between 1 and 6000),
  tb as (
    select distinct on (ok.i) ok.i, b.id, b.height, b.height_confidence_upper, b.height_source
    from ok join public.geo_buildings b on extensions.st_intersects(b.geom, ok.tg)
    where not ok.horizon
    order by ok.i, b.height desc nulls last, b.id
  ),
  hits as materialized (
    select ok.i, b.id, b.height, greatest(b.height, b.height_confidence_upper) as height_upper, b.height_source,
      sqrt(power((extensions.st_x(c.p) - extensions.st_x(o.g)) * o.kx, 2)
        + power((extensions.st_y(c.p) - extensions.st_y(o.g)) * o.ky, 2)) as d
    from ok cross join o
    join public.geo_buildings b on extensions.st_intersects(b.geom, ok.line)
    cross join lateral (select extensions.st_closestpoint(extensions.st_intersection(b.geom, ok.line), o.g) as p) c
    where b.height is not null
      and b.id is distinct from (select own.id from own)
      and not exists (select 1 from tb where tb.i = ok.i and tb.id = b.id)
  ),
  ang as (
    select hits.*,
      degrees(atan2(hits.height - eye_m - hits.d * hits.d / 14646000.0, greatest(hits.d, 0.5))) as a,
      degrees(atan2(hits.height_upper - eye_m - hits.d * hits.d / 14646000.0, greatest(hits.d, 0.5))) as au
    from hits
  ),
  per as (
    select ang.i, max(ang.a) as max_a, max(ang.au) as max_au, min(ang.d) filter (where ang.a > 0) as first_above,
      count(*)::int as crossed
    from ang
    group by ang.i
  ),
  top as (
    select distinct on (ang.i) ang.i, ang.id, ang.d, ang.height, ang.height_source, ang.a
    from ang
    order by ang.i, ang.a desc, ang.id
  ),
  gap as (
    select ok.i, min(s.k) * 100 as first_gap_m
    from ok cross join lateral generate_series(1, floor(ok.len / 100)::int) s(k)
    cross join lateral (select extensions.st_lineinterpolatepoint(ok.line, least(s.k * 100 / ok.len, 1)) as p) q
    where not exists (
      select 1 from public.geo_buildings b
      where extensions.st_dwithin(b.geom, q.p, 0.003)
    )
    group by ok.i
  )
  select jsonb_build_object(
    'own_building', (select own.id from own),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'i', l.i,
        'distance_m', round(l.len::numeric, 1),
        'checked', l.len between 1 and 6000,
        'crossed', coalesce(per.crossed, 0),
        'max_angle', round(per.max_a::numeric, 3),
        'max_angle_upper', round(per.max_au::numeric, 3),
        'first_above_m', round(per.first_above::numeric, 1),
        'covered_m', case when l.len between 1 and 6000
          then round(least(coalesce(gap.first_gap_m - 100, l.len), l.len)::numeric, 1) end,
        'blocker', case when top.id is not null then jsonb_build_object(
          'id', top.id, 'distance_m', round(top.d::numeric, 1), 'height', top.height,
          'height_source', top.height_source, 'angle', round(top.a::numeric, 3)
        ) end,
        'target_building', case when tb.id is not null then jsonb_build_object(
          'id', tb.id, 'height', tb.height, 'height_upper', tb.height_confidence_upper, 'height_source', tb.height_source
        ) end
      ) order by l.i)
      from l
      left join per on per.i = l.i
      left join top on top.i = l.i
      left join gap on gap.i = l.i
      left join tb on tb.i = l.i
    ), '[]'::jsonb)
  )
  from (select 1) one
  where exists (select 1 from o);
$$;

revoke execute on function public.hotel_view_lines(double precision, double precision, double precision, jsonb) from public;
grant execute on function public.hotel_view_lines(double precision, double precision, double precision, jsonb)
  to anon, authenticated, service_role;
