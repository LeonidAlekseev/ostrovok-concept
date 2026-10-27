-- Where the buildings of EUBUCCO are known, for the lines of sight of «Вид из отеля» (`hotel_view_eyes`,
-- 20261027150000): the dataset is the city of Valencia (city_id ES46250), so a line is covered up to the border of the
-- municipality — over the sea, the port's water, the parks, the riverbed and the Albufera too, where no building
-- stands — and not covered from where it enters the land of another municipality, whose buildings the dataset lacks.
-- Before, a point of a line counted as covered when a building stood within 0.003°: a line over the sea or a park
-- without buildings was «нет данных» though nothing could stand in its way.
-- The table is filled by `scripts/load-valencia-geo.py coverage` from OpenStreetMap; without its row every line comes
-- back with `covered_m: null` and the page says «нет данных». `hotel_view_eyes` also gives each line and building the
-- eye over the lower bound of EUBUCCO's height interval (`eye_lower_m`) and the bounds themselves, so the page tells a
-- building surely in the way from one that is by EUBUCCO's estimate only. Idempotent: safe to re-run.
--
-- Rollback: re-apply 20261027150000_hotel_view_eyes.sql, then `drop table if exists public.geo_coverage;`.

create table if not exists public.geo_coverage (
  -- The dataset whose coverage this is.
  dataset text primary key references public.geo_datasets (id) on delete cascade,
  -- «València»: the municipality the dataset's buildings are of.
  name text not null,
  -- The municipality: the dataset's buildings are known within it.
  covered extensions.geometry(MultiPolygon, 4326) not null,
  -- The land around it within ~25 km (the province but the municipality): the dataset has no buildings there.
  -- What is in neither is the sea.
  uncovered extensions.geometry(MultiPolygon, 4326) not null,
  -- Where the boundaries come from, with their licence.
  source text not null,
  loaded_at timestamptz not null default now()
);

-- Nobody reads the table directly: `hotel_view_eyes` is the way in. Only the service role writes it.
alter table public.geo_coverage enable row level security;
revoke all on public.geo_coverage from anon, authenticated;

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
  -- The bounds of EUBUCCO's height interval, the height itself when the interval lacks one (a measured height).
  hits as materialized (
    select ok.i, ok.kind, ok.len, b.id, b.height,
      least(b.height, coalesce(b.height_confidence_lower, b.height)) as height_lower,
      greatest(b.height, coalesce(b.height_confidence_upper, b.height)) as height_upper,
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
  -- The tops lowered by the curvature: `hl` with EUBUCCO's height, `hlo` its lower bound, `hu` its upper; `tl` the
  -- target's.
  low as (
    select hits.*, hits.height - hits.d * hits.d / 14646000.0 as hl,
      hits.height_lower - hits.d * hits.d / 14646000.0 as hlo,
      hits.height_upper - hits.d * hits.d / 14646000.0 as hu,
      coalesce(tb.height, 0) - hits.len * hits.len / 14646000.0 as tl,
      hits.d * sqrt(2 / 7323000.0) as c
    from hits left join tb on tb.i = hits.i
  ),
  eyes as (
    select low.i, aj.j, low.id, low.d, low.height, low.height_lower, low.height_upper, low.height_source, x.e, x.el, x.eu
    from low join aj on aj.i = low.i
    cross join lateral (
      select
        case low.kind
          when 'point' then (low.len * low.hl - low.d * low.tl) / greatest(low.len - low.d, 0.5)
          when 'horizon' then low.hl - low.d * tan(radians(aj.alpha))
          else case when low.c * low.c + 4 * low.hl < 0 then 0 else power((low.c + sqrt(low.c * low.c + 4 * low.hl)) / 2, 2) end
        end as e,
        case low.kind
          when 'point' then (low.len * low.hlo - low.d * low.tl) / greatest(low.len - low.d, 0.5)
          when 'horizon' then low.hlo - low.d * tan(radians(aj.alpha))
          else case when low.c * low.c + 4 * low.hlo < 0 then 0 else power((low.c + sqrt(low.c * low.c + 4 * low.hlo)) / 2, 2) end
        end as el,
        case low.kind
          when 'point' then (low.len * low.hu - low.d * low.tl) / greatest(low.len - low.d, 0.5)
          when 'horizon' then low.hu - low.d * tan(radians(aj.alpha))
          else case when low.c * low.c + 4 * low.hu < 0 then 0 else power((low.c + sqrt(low.c * low.c + 4 * low.hu)) / 2, 2) end
        end as eu
    ) x
  ),
  ranked as (
    select eyes.*,
      row_number() over (partition by eyes.i, eyes.j order by eyes.eu desc, eyes.id) as by_upper,
      row_number() over (partition by eyes.i, eyes.j order by eyes.e desc, eyes.id) as by_height,
      row_number() over (partition by eyes.i, eyes.j order by eyes.el desc, eyes.id) as by_lower
    from eyes
  ),
  per as (
    select aj.i, aj.j,
      max(ranked.e) as eye_m, max(ranked.el) as eye_lower_m, max(ranked.eu) as eye_upper_m,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', ranked.id, 'distance_m', round(ranked.d::numeric, 1), 'height', ranked.height,
        'height_lower', ranked.height_lower, 'height_upper', ranked.height_upper,
        'height_source', ranked.height_source,
        'eye_m', round(ranked.e::numeric, 2), 'eye_lower_m', round(ranked.el::numeric, 2),
        'eye_upper_m', round(ranked.eu::numeric, 2)
      ) order by ranked.eu desc, ranked.id) filter (where ranked.eu > 0 and (ranked.by_upper <= 5 or ranked.by_height = 1 or ranked.by_lower = 1)),
      '[]'::jsonb) as blockers
    from aj left join ranked on ranked.i = aj.i and ranked.j = aj.j
    group by aj.i, aj.j
  ),
  per_line as materialized (
    select per.i, jsonb_agg(jsonb_build_object(
      'eye_m', round(per.eye_m::numeric, 2),
      'eye_lower_m', round(per.eye_lower_m::numeric, 2),
      'eye_upper_m', round(per.eye_upper_m::numeric, 2),
      'blockers', per.blockers
    ) order by per.j) as eyes
    from per
    group by per.i
  ),
  crossed as materialized (select hits.i, count(*)::int as n from hits group by hits.i),
  cov as (select c.uncovered from public.geo_coverage c where c.dataset = 'eubucco-v0.2'),
  -- Where a line enters the land without the dataset's buildings: the point of its part there nearest the hotel.
  gap as materialized (
    select ok.i,
      sqrt(power((extensions.st_x(p.p) - extensions.st_x(o.g)) * o.kx, 2)
        + power((extensions.st_y(p.p) - extensions.st_y(o.g)) * o.ky, 2)) as entry_m
    from ok cross join o cross join cov
    cross join lateral (
      select extensions.st_closestpoint(extensions.st_intersection(ok.line, cov.uncovered), o.g) as p
    ) p
    where extensions.st_intersects(ok.line, cov.uncovered)
  )
  select jsonb_build_object(
    'own_building', (select own.id from own),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'i', l.i,
        'distance_m', round(l.len::numeric, 1),
        'checked', l.len between 1 and 6000,
        'crossed', coalesce(crossed.n, 0),
        'covered_m', case when l.len between 1 and 6000 and exists (select 1 from cov)
          then round(least(coalesce(gap.entry_m, l.len), l.len)::numeric, 1) end,
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

comment on function public.hotel_view_eyes(double precision, double precision, jsonb) is
$$The lines of sight from a hotel over the buildings of EUBUCCO for every floor at once (20261027150000), the
coverage by the municipality's border (20261027170000): per line and angle `eye_m`, the lowest eye above the ground
the line passes over all the buildings from with EUBUCCO's height, `eye_lower_m` and `eye_upper_m` with the bounds of
its interval (the height itself for a measured one; null without buildings), and `blockers` — the 5 buildings of the
highest `eye_upper_m` and the ones of the highest `eye_m` and `eye_lower_m`, each with its height, bounds and the
three eyes.
`covered_m`: how far from the hotel the line stays out of `geo_coverage.uncovered`, the land of the other
municipalities (the line's length when it never enters it; null without the coverage loaded). `crossed`,
`target_building` and the kinds of targets as in 20261027150000. Lines longer than 6 km or with bad coordinates come
back with `checked: false`.$$;

revoke execute on function public.hotel_view_eyes(double precision, double precision, jsonb) from public;
grant execute on function public.hotel_view_eyes(double precision, double precision, jsonb)
  to anon, authenticated, service_role;
