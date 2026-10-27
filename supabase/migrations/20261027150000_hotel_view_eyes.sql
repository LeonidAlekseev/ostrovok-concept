-- The lines of sight from a hotel over the buildings of EUBUCCO for every floor at once, for «Вид из отеля» on the
-- hotel page and for Эвал (src/lib/view.ts reads the answer): instead of the angles from one window
-- (`hotel_view_lines`, 20261026150000), the lowest eye above the ground from which each line passes over all the
-- buildings: `select public.hotel_view_eyes(39.4735, -0.3799, '[{"lat": 39.47, "lon": -0.33, "kind": "sea"}]')` or
-- `POST /rest/v1/rpc/hotel_view_eyes`. The page then tells the floor a target is seen from with no call per floor.
-- Reads `geo_buildings` only; writes nothing. Idempotent: safe to re-run on a database that already has this function.
-- `hotel_view_lines` stays for the clients of before it.
--
-- Rollback: `drop function if exists public.hotel_view_eyes(double precision, double precision, jsonb);` — the page
-- then says «нет данных» and Эвал that it could not check.

-- For each target point, the straight line from the hotel's point to it, at most 6 km long and at most 160 lines a call
-- (a line of 1.5 km takes ~8 ms in the centre of Valencia), and on it the buildings it crosses, but the hotel's own (the
-- one `hotel_geo` finds: the nearest within 50 m) and the one at a `point` target: each at the distance `d` of its
-- nearest crossing from the hotel (planar, ~0.1 % at 6 km), its top `h' = height − d² / (2 R')` lowered by the Earth's
-- curvature with the standard refraction (k = 0.13, R' = 6 371 km / (1 − 0.13) ≈ 7 323 km). A building is in the way
-- of an eye `e` metres above the ground while `e` is at most its `eye_m`, by the kind of the target:
--   * `point` (the default): the top of the target's building, `ht' = height − D² / (2 R')` (the ground, 0, without
--     one) `D` metres away, is seen over the building when `(h' − e) / d < (ht' − e) / D`, so
--     `eye_m = (D·h' − d·ht') / (D − d)`;
--   * `horizon`: the end of a ray, its building an obstacle like the rest; something at the angle `α` above the
--     horizontal (`angles`, degrees, up to 4 a ray: 0 the roofs, 2 the sun) is seen when `(h' − e) / d < tan α`, so
--     `eye_m = h' − d·tan α`, one for each angle;
--   * `sea`: the line to a point of the coast; the sea's horizon, `√(2e / R')` below the horizontal, is seen when
--     `e − h' > d·√(2e / R')`, so with `c = d·√(2 / R')` `eye_m = ((c + √(c² + 4h')) / 2)²` (0 when `c² + 4h' < 0`).
--     A far building just below the window's plane may hide the horizon only to a low eye too: counted as in the way
--     to the root above, the safe side.
-- Per line and angle: `eye_m` the highest of the buildings with EUBUCCO's height, `eye_upper_m` with the upper bound of
-- its confidence interval (null without buildings), and `blockers` — the 5 buildings of the highest `eye_upper_m` and
-- the one of the highest `eye_m`, each with both. And, as in `hotel_view_lines`: `covered_m`, how far the dataset
-- covers the line (a point every 100 m counts when a building stands within 0.003°), `crossed`, `target_building`.
-- Ground is taken as flat: the dataset has heights above the ground, no terrain. Lines longer than 6 km or with bad
-- coordinates come back with `checked: false`.
create or replace function public.hotel_view_eyes(
  lat double precision,
  lon double precision,
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
    where lat between -90 and 90 and lon between -180 and 180 and jsonb_typeof(targets) = 'array'
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
    select (x.k - 1)::int as i,
      case when x.v ->> 'kind' in ('horizon', 'sea') then x.v ->> 'kind' else 'point' end as kind,
      x.v -> 'angles' as angles,
      extensions.st_setsrid(extensions.st_makepoint((x.v ->> 'lon')::double precision, (x.v ->> 'lat')::double precision), 4326) as g
    from o, jsonb_array_elements(targets) with ordinality x(v, k)
    where x.k <= 160
      and jsonb_typeof(x.v -> 'lat') = 'number' and jsonb_typeof(x.v -> 'lon') = 'number'
      and (x.v ->> 'lat')::double precision between -90 and 90 and (x.v ->> 'lon')::double precision between -180 and 180
  ),
  l as (
    select t.i, t.kind, t.angles, t.g as tg, extensions.st_makeline(o.g, t.g) as line,
      sqrt(power((extensions.st_x(t.g) - extensions.st_x(o.g)) * o.kx, 2)
        + power((extensions.st_y(t.g) - extensions.st_y(o.g)) * o.ky, 2)) as len
    from t, o
  ),
  ok as (select * from l where l.len between 1 and 6000),
  -- The angles of a line: those of a ray of the horizon (0 by default, up to 4, within −10…60°), one for the others.
  aj as (
    select ok.i, a.j, a.alpha
    from ok cross join lateral (
      select (e.k - 1)::int as j,
        case when jsonb_typeof(e.v) = 'number' then e.v::text::double precision end as alpha
      from jsonb_array_elements(case when ok.kind = 'horizon' and jsonb_typeof(ok.angles) = 'array'
        and jsonb_array_length(ok.angles) > 0 then ok.angles else '[0]'::jsonb end) with ordinality e(v, k)
      where e.k <= 4
        and (ok.kind <> 'horizon'
          or (case when jsonb_typeof(e.v) = 'number' then e.v::text::double precision end) between -10 and 60)
    ) a
  ),
  tb as (
    select distinct on (ok.i) ok.i, b.id, b.height, b.height_confidence_upper, b.height_source
    from ok join public.geo_buildings b on extensions.st_intersects(b.geom, ok.tg)
    where ok.kind = 'point'
    order by ok.i, b.height desc nulls last, b.id
  ),
  hits as materialized (
    select ok.i, ok.kind, ok.len, b.id, b.height, greatest(b.height, b.height_confidence_upper) as height_upper,
      b.height_source, c.d
    from ok cross join o
    join public.geo_buildings b on extensions.st_intersects(b.geom, ok.line)
    cross join lateral (
      select sqrt(power((extensions.st_x(p.p) - extensions.st_x(o.g)) * o.kx, 2)
        + power((extensions.st_y(p.p) - extensions.st_y(o.g)) * o.ky, 2)) as d
      from (select extensions.st_closestpoint(extensions.st_intersection(b.geom, ok.line), o.g) as p) p
    ) c
    where b.height is not null
      and b.id is distinct from (select own.id from own)
      and not exists (select 1 from tb where tb.i = ok.i and tb.id = b.id)
  ),
  -- The tops lowered by the curvature, `hl` with EUBUCCO's height and `hu` with the upper bound; `tl` the target's.
  low as (
    select hits.*, hits.height - hits.d * hits.d / 14646000.0 as hl, hits.height_upper - hits.d * hits.d / 14646000.0 as hu,
      coalesce(tb.height, 0) - hits.len * hits.len / 14646000.0 as tl,
      hits.d * sqrt(2 / 7323000.0) as c
    from hits left join tb on tb.i = hits.i
  ),
  eyes as (
    select low.i, aj.j, low.id, low.d, low.height, low.height_source,
      case low.kind
        when 'point' then (low.len * low.hl - low.d * low.tl) / greatest(low.len - low.d, 0.5)
        when 'horizon' then low.hl - low.d * tan(radians(aj.alpha))
        else case when low.c * low.c + 4 * low.hl < 0 then 0 else power((low.c + sqrt(low.c * low.c + 4 * low.hl)) / 2, 2) end
      end as e,
      case low.kind
        when 'point' then (low.len * low.hu - low.d * low.tl) / greatest(low.len - low.d, 0.5)
        when 'horizon' then low.hu - low.d * tan(radians(aj.alpha))
        else case when low.c * low.c + 4 * low.hu < 0 then 0 else power((low.c + sqrt(low.c * low.c + 4 * low.hu)) / 2, 2) end
      end as eu
    from low join aj on aj.i = low.i
  ),
  ranked as (
    select eyes.*,
      row_number() over (partition by eyes.i, eyes.j order by eyes.eu desc, eyes.id) as by_upper,
      row_number() over (partition by eyes.i, eyes.j order by eyes.e desc, eyes.id) as by_height
    from eyes
  ),
  per as (
    select aj.i, aj.j,
      max(ranked.e) as eye_m, max(ranked.eu) as eye_upper_m,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', ranked.id, 'distance_m', round(ranked.d::numeric, 1), 'height', ranked.height,
        'height_source', ranked.height_source,
        'eye_m', round(ranked.e::numeric, 2), 'eye_upper_m', round(ranked.eu::numeric, 2)
      ) order by ranked.eu desc, ranked.id) filter (where ranked.eu > 0 and (ranked.by_upper <= 5 or ranked.by_height = 1)),
      '[]'::jsonb) as blockers
    from aj left join ranked on ranked.i = aj.i and ranked.j = aj.j
    group by aj.i, aj.j
  ),
  per_line as (
    select per.i, jsonb_agg(jsonb_build_object(
      'eye_m', round(per.eye_m::numeric, 2),
      'eye_upper_m', round(per.eye_upper_m::numeric, 2),
      'blockers', per.blockers
    ) order by per.j) as eyes
    from per
    group by per.i
  ),
  crossed as (select hits.i, count(*)::int as n from hits group by hits.i),
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
        'crossed', coalesce(crossed.n, 0),
        'covered_m', case when l.len between 1 and 6000
          then round(least(coalesce(gap.first_gap_m - 100, l.len), l.len)::numeric, 1) end,
        'eyes', coalesce(per_line.eyes, '[]'::jsonb),
        'target_building', case when tb.id is not null then jsonb_build_object(
          'id', tb.id, 'height', tb.height, 'height_upper', tb.height_confidence_upper, 'height_source', tb.height_source
        ) end
      ) order by l.i)
      from l
      left join per_line on per_line.i = l.i
      left join crossed on crossed.i = l.i
      left join gap on gap.i = l.i
      left join tb on tb.i = l.i
    ), '[]'::jsonb)
  )
  from (select 1) one
  where exists (select 1 from o);
$$;

revoke execute on function public.hotel_view_eyes(double precision, double precision, jsonb) from public;
grant execute on function public.hotel_view_eyes(double precision, double precision, jsonb)
  to anon, authenticated, service_role;
