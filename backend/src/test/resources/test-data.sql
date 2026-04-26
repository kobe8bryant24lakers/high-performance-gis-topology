-- Test data for gis_topology — 1 000 000 elements, 600 000 links.
--
-- Type distribution (realistic network pyramid):
--   access-point : 40%  (~400 000)  — dense access layer
--   switch       : 30%  (~300 000)  — distribution + access switches
--   server       : 15%  (~150 000)  — application / infrastructure servers
--   router       : 10%  (~100 000)  — core / edge routers
--   firewall     :  5%  ( ~50 000)  — perimeter / zone firewalls
--
-- Element layout:
--   el-0..el-9    : inside tile 14/2620/6332 near San Francisco
--                   (west=-122.432°, east=-122.410°, south=37.771°, north=37.788°)
--                   and tile 8/40/98 (west=-123.750°, east=-122.344°, south=37.719°, north=38.823°)
--                   mixed types — supports all tile + neighbour integration tests.
--   el-10..el-999 999 : distributed inside the California bounding box, type assigned by (i % 20) threshold.
--
-- Link layout:
--   link-0..link-9      : fixed neighbour edges from el-0 (depth 1-3 reachable).
--   link-10..link-599 999: generated mesh (source ≠ target guaranteed by formula).

BEGIN;

-- ── Clean slate ──────────────────────────────────────────────────────────────
DELETE FROM topology_links;
DELETE FROM network_elements;

-- ── 10 fixed elements inside tile 14/2620/6332 ───────────────────────────────
INSERT INTO network_elements (id, type, label, lng, lat, version, updated_at, properties)
VALUES
  -- 2 router, 3 switch, 1 server, 4 access-point (≈ pyramid ratios; 0 firewall by design)
  ('el-0', 'router',       'router-0',       -122.4310, 37.7720, 1, '2026-01-01 00:00:00+00', '{"index":0}'::jsonb),
  ('el-1', 'router',       'router-1',       -122.4280, 37.7740, 1, '2026-01-01 00:00:00+00', '{"index":1}'::jsonb),
  ('el-2', 'access-point', 'access-point-2', -122.4245, 37.7770, 1, '2026-01-01 00:00:00+00', '{"index":2}'::jsonb),
  ('el-3', 'switch',       'switch-3',       -122.4300, 37.7715, 1, '2026-01-01 00:00:00+00', '{"index":3}'::jsonb),
  ('el-4', 'switch',       'switch-4',       -122.4215, 37.7800, 1, '2026-01-01 00:00:00+00', '{"index":4}'::jsonb),
  ('el-5', 'server',       'server-5',       -122.4270, 37.7730, 1, '2026-01-01 00:00:00+00', '{"index":5}'::jsonb),
  ('el-6', 'access-point', 'access-point-6', -122.4180, 37.7840, 1, '2026-01-01 00:00:00+00', '{"index":6}'::jsonb),
  ('el-7', 'access-point', 'access-point-7', -122.4250, 37.7750, 1, '2026-01-01 00:00:00+00', '{"index":7}'::jsonb),
  ('el-8', 'access-point', 'access-point-8', -122.4220, 37.7785, 1, '2026-01-01 00:00:00+00', '{"index":8}'::jsonb),
  ('el-9', 'switch',       'switch-9',       -122.4290, 37.7735, 1, '2026-01-01 00:00:00+00', '{"index":9}'::jsonb);

-- ── 999 990 California-bounded elements (el-10 to el-999 999) ────────────────
-- Type assigned by (i % 20) threshold — maps exactly to the pyramid ratios:
--   i%20 in  0.. 7 → access-point  (8/20 = 40%)
--   i%20 in  8..13 → switch        (6/20 = 30%)
--   i%20 in 14..16 → server        (3/20 = 15%)
--   i%20 in 17..18 → router        (2/20 = 10%)
--   i%20 = 19      → firewall      (1/20 =  5%)
-- lng = california_west + ((i*7) % 1000000) / 999999 * california_width
-- lat = california_south + ((i*11) % 1000000) / 999999 * california_height
-- Multipliers 7 and 11 are coprime to 1 000 000 → near-uniform coverage inside California.

INSERT INTO network_elements (id, type, label, lng, lat, version, updated_at, properties)
SELECT
    'el-' || i,
    CASE
        WHEN (i % 20) <  8 THEN 'access-point'
        WHEN (i % 20) < 14 THEN 'switch'
        WHEN (i % 20) < 17 THEN 'server'
        WHEN (i % 20) < 19 THEN 'router'
        ELSE                     'firewall'
    END,
    CASE
        WHEN (i % 20) <  8 THEN 'access-point'
        WHEN (i % 20) < 14 THEN 'switch'
        WHEN (i % 20) < 17 THEN 'server'
        WHEN (i % 20) < 19 THEN 'router'
        ELSE                     'firewall'
    END || '-' || i,
    -124.482003 + (((i * 7) % 1000000) / 999999.0) * (-114.131211 - -124.482003),
    32.528832 + (((i * 11) % 1000000) / 999999.0) * (42.009518 - 32.528832),
    1,
    '2026-01-01 00:00:00+00'::timestamptz,
    '{}'::jsonb
FROM generate_series(10, 999999) AS i;

-- Assign every element to its containing region via PostGIS so the regions table
-- (V2__add_regions.sql) remains the single source of truth for the grid layout.
UPDATE network_elements ne SET
    country_region_id = (
        SELECT r.id FROM regions r
        WHERE r.level = 'country' AND ST_Intersects(r.geom, ne.location)
        ORDER BY r.id LIMIT 1
    ),
    province_region_id = (
        SELECT r.id FROM regions r
        WHERE r.level = 'province' AND ST_Intersects(r.geom, ne.location)
        ORDER BY r.id LIMIT 1
    ),
    city_region_id = (
        SELECT r.id FROM regions r
        WHERE r.level = 'city' AND ST_Intersects(r.geom, ne.location)
        ORDER BY r.id LIMIT 1
    );

-- ── 10 fixed links establishing el-0 neighbourhood ───────────────────────────
-- depth-1 from el-0: el-1, el-2, el-10, el-20
-- depth-2 from el-0: el-30, el-40, el-50, el-60
-- depth-3 from el-0: el-70, el-80  (guarantees depth-3 ≥ depth-1)

INSERT INTO topology_links (id, type, source_id, target_id, directed, version, updated_at, properties)
VALUES
  ('link-0', 'connection', 'el-0',  'el-1',  false, 1, '2026-01-01 00:00:00+00', '{}'::jsonb),
  ('link-1', 'connection', 'el-0',  'el-2',  false, 1, '2026-01-01 00:00:00+00', '{}'::jsonb),
  ('link-2', 'connection', 'el-0',  'el-10', false, 1, '2026-01-01 00:00:00+00', '{}'::jsonb),
  ('link-3', 'connection', 'el-0',  'el-20', false, 1, '2026-01-01 00:00:00+00', '{}'::jsonb),
  ('link-4', 'connection', 'el-1',  'el-30', false, 1, '2026-01-01 00:00:00+00', '{}'::jsonb),
  ('link-5', 'connection', 'el-1',  'el-40', false, 1, '2026-01-01 00:00:00+00', '{}'::jsonb),
  ('link-6', 'connection', 'el-10', 'el-50', false, 1, '2026-01-01 00:00:00+00', '{}'::jsonb),
  ('link-7', 'connection', 'el-20', 'el-60', false, 1, '2026-01-01 00:00:00+00', '{}'::jsonb),
  ('link-8', 'connection', 'el-30', 'el-70', false, 1, '2026-01-01 00:00:00+00', '{}'::jsonb),
  ('link-9', 'connection', 'el-40', 'el-80', false, 1, '2026-01-01 00:00:00+00', '{}'::jsonb);

-- ── 599 990 generated mesh links (link-10 to link-599 999) ───────────────────
-- source = (i * 7)      % 1 000 000   → el-0..el-999999
-- target = (i * 31 + 500001) % 1 000 000   → el-0..el-999999, never equals source
--   Proof: source = target iff i*7 ≡ i*31+500001 (mod 10^6)
--          iff -i*24 ≡ 500001 (mod 10^6).  gcd(24,10^6)=8 and 8∤500001 → no solution.

INSERT INTO topology_links (id, type, source_id, target_id, directed, version, updated_at, properties)
SELECT
    'link-' || i,
    'connection',
    'el-' || ((i * 7)       % 1000000),
    'el-' || ((i * 31 + 500001) % 1000000),
    false,
    1,
    '2026-01-01 00:00:00+00'::timestamptz,
    '{}'::jsonb
FROM generate_series(10, 599999) AS i;

COMMIT;
