CREATE TABLE regions
(
    id           VARCHAR(64) NOT NULL PRIMARY KEY,
    level        VARCHAR(32) NOT NULL,
    name         VARCHAR(128) NOT NULL,
    parent_id    VARCHAR(64) REFERENCES regions (id) ON DELETE CASCADE,
    centroid_lng DOUBLE PRECISION NOT NULL,
    centroid_lat DOUBLE PRECISION NOT NULL,
    bbox_west    DOUBLE PRECISION NOT NULL,
    bbox_south   DOUBLE PRECISION NOT NULL,
    bbox_east    DOUBLE PRECISION NOT NULL,
    bbox_north   DOUBLE PRECISION NOT NULL,
    geom         GEOMETRY(Polygon, 4326) NOT NULL
);

CREATE INDEX idx_regions_level ON regions (level);
CREATE INDEX idx_regions_parent_id ON regions (parent_id);
CREATE INDEX idx_regions_geom_gist ON regions USING GIST (geom);

INSERT INTO regions (id, level, name, parent_id, centroid_lng, centroid_lat, bbox_west, bbox_south, bbox_east, bbox_north, geom)
SELECT
    'country-' || c,
    'country',
    'Country ' || (c + 1),
    NULL,
    -180.0 + c * 90.0 + 45.0,
    0.0,
    -180.0 + c * 90.0,
    -90.0,
    -180.0 + (c + 1) * 90.0,
    90.0,
    ST_MakeEnvelope(-180.0 + c * 90.0, -90.0, -180.0 + (c + 1) * 90.0, 90.0, 4326)
FROM generate_series(0, 3) AS c;

INSERT INTO regions (id, level, name, parent_id, centroid_lng, centroid_lat, bbox_west, bbox_south, bbox_east, bbox_north, geom)
SELECT
    'province-' || c || '-' || p,
    'province',
    'Province ' || (c + 1) || '-' || (p + 1),
    'country-' || c,
    -180.0 + c * 90.0 + 45.0,
    -90.0 + p * 60.0 + 30.0,
    -180.0 + c * 90.0,
    -90.0 + p * 60.0,
    -180.0 + (c + 1) * 90.0,
    -90.0 + (p + 1) * 60.0,
    ST_MakeEnvelope(-180.0 + c * 90.0, -90.0 + p * 60.0, -180.0 + (c + 1) * 90.0, -90.0 + (p + 1) * 60.0, 4326)
FROM generate_series(0, 3) AS c
CROSS JOIN generate_series(0, 2) AS p;

INSERT INTO regions (id, level, name, parent_id, centroid_lng, centroid_lat, bbox_west, bbox_south, bbox_east, bbox_north, geom)
SELECT
    'city-' || c || '-' || p || '-' || city,
    'city',
    'City ' || (c + 1) || '-' || (p + 1) || '-' || (city + 1),
    'province-' || c || '-' || p,
    -180.0 + c * 90.0 + city * 30.0 + 15.0,
    -90.0 + p * 60.0 + 30.0,
    -180.0 + c * 90.0 + city * 30.0,
    -90.0 + p * 60.0,
    -180.0 + c * 90.0 + (city + 1) * 30.0,
    -90.0 + (p + 1) * 60.0,
    ST_MakeEnvelope(
        -180.0 + c * 90.0 + city * 30.0,
        -90.0 + p * 60.0,
        -180.0 + c * 90.0 + (city + 1) * 30.0,
        -90.0 + (p + 1) * 60.0,
        4326
    )
FROM generate_series(0, 3) AS c
CROSS JOIN generate_series(0, 2) AS p
CROSS JOIN generate_series(0, 2) AS city;

ALTER TABLE network_elements ADD COLUMN country_region_id VARCHAR(64) REFERENCES regions (id) ON DELETE SET NULL;
ALTER TABLE network_elements ADD COLUMN province_region_id VARCHAR(64) REFERENCES regions (id) ON DELETE SET NULL;
ALTER TABLE network_elements ADD COLUMN city_region_id VARCHAR(64) REFERENCES regions (id) ON DELETE SET NULL;

CREATE INDEX idx_elements_country_region ON network_elements (country_region_id);
CREATE INDEX idx_elements_province_region ON network_elements (province_region_id);
CREATE INDEX idx_elements_city_region ON network_elements (city_region_id);
