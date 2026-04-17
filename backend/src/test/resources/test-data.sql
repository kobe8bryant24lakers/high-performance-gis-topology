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
--   el-0..el-9    : inside tile 14/8192/5460 (west=0.0, east=0.022°, south=51.331°, north=51.344°)
--                   and tile 8/128/85 (west=0.0, east=1.406°, south=50.736°, north=51.618°)
--                   mixed types — supports all tile + neighbour integration tests.
--   el-10..el-999 999 : globally distributed, type assigned by (i % 20) threshold.
--
-- Link layout:
--   link-0..link-9      : fixed neighbour edges from el-0 (depth 1-3 reachable).
--   link-10..link-599 999: generated mesh (source ≠ target guaranteed by formula).

-- ── Clean slate ──────────────────────────────────────────────────────────────
DELETE FROM topology_links;
DELETE FROM network_elements;

-- ── 10 fixed elements inside tile 14/8192/5460 ───────────────────────────────
INSERT INTO network_elements (id, type, label, lng, lat, version, updated_at, properties)
VALUES
  -- 2 router, 3 switch, 1 server, 4 access-point (≈ pyramid ratios; 0 firewall by design)
  ('el-0', 'router',       'router-0',        0.005, 51.334, 1, '2026-01-01 00:00:00+00', '{"index":0}'::jsonb),
  ('el-1', 'router',       'router-1',        0.010, 51.337, 1, '2026-01-01 00:00:00+00', '{"index":1}'::jsonb),
  ('el-2', 'access-point', 'access-point-2',  0.016, 51.341, 1, '2026-01-01 00:00:00+00', '{"index":2}'::jsonb),
  ('el-3', 'switch',       'switch-3',        0.007, 51.332, 1, '2026-01-01 00:00:00+00', '{"index":3}'::jsonb),
  ('el-4', 'switch',       'switch-4',        0.013, 51.339, 1, '2026-01-01 00:00:00+00', '{"index":4}'::jsonb),
  ('el-5', 'server',       'server-5',        0.004, 51.333, 1, '2026-01-01 00:00:00+00', '{"index":5}'::jsonb),
  ('el-6', 'access-point', 'access-point-6',  0.018, 51.342, 1, '2026-01-01 00:00:00+00', '{"index":6}'::jsonb),
  ('el-7', 'access-point', 'access-point-7',  0.009, 51.336, 1, '2026-01-01 00:00:00+00', '{"index":7}'::jsonb),
  ('el-8', 'access-point', 'access-point-8',  0.012, 51.338, 1, '2026-01-01 00:00:00+00', '{"index":8}'::jsonb),
  ('el-9', 'switch',       'switch-9',        0.006, 51.335, 1, '2026-01-01 00:00:00+00', '{"index":9}'::jsonb);

-- ── 999 990 globally distributed elements (el-10 to el-999 999) ──────────────
-- Type assigned by (i % 20) threshold — maps exactly to the pyramid ratios:
--   i%20 in  0.. 7 → access-point  (8/20 = 40%)
--   i%20 in  8..13 → switch        (6/20 = 30%)
--   i%20 in 14..16 → server        (3/20 = 15%)
--   i%20 in 17..18 → router        (2/20 = 10%)
--   i%20 = 19      → firewall      (1/20 =  5%)
-- lng = ((i*7) % 360000) * 0.001 - 180   → spread across -180..180 with 0.001° step
-- lat = ((i*11) % 180000) * 0.001 - 90   → spread across -90..90  with 0.001° step
-- Multipliers 7 and 11 are coprime to 360000/180000 → near-uniform global coverage.

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
    ((i * 7) % 360000) * 0.001 - 180.0,
    ((i * 11) % 180000) * 0.001 - 90.0,
    1,
    '2026-01-01 00:00:00+00'::timestamptz,
    '{}'::jsonb
FROM generate_series(10, 999999) AS i;

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
