-- PostGIS for spatial queries; pg_trgm for trigram-based ILIKE search
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Network elements table
-- lng/lat stored as plain doubles for simple MyBatis mapping.
-- location is a generated stored column providing the spatial index.
CREATE TABLE network_elements
(
    id         VARCHAR(64)      NOT NULL PRIMARY KEY,
    type       VARCHAR(64)      NOT NULL,
    label      VARCHAR(256)     NOT NULL,
    lng        DOUBLE PRECISION NOT NULL,
    lat        DOUBLE PRECISION NOT NULL,
    location   GEOMETRY(Point, 4326)
                   GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
    version    INTEGER          NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ      NOT NULL,
    properties JSONB            NOT NULL DEFAULT '{}'
);

-- Spatial index for ST_Within tile bbox queries
CREATE INDEX idx_elements_location_gist ON network_elements USING GIST (location);
-- Btree index for type filtering
CREATE INDEX idx_elements_type ON network_elements (type);
-- GIN index for JSONB containment queries (prop.* filters)
CREATE INDEX idx_elements_properties_gin ON network_elements USING GIN (properties);
-- Trigram index for fast ILIKE search on label
CREATE INDEX idx_elements_label_trgm ON network_elements USING GIN (label gin_trgm_ops);

-- Topology links table
CREATE TABLE topology_links
(
    id         VARCHAR(64)      NOT NULL PRIMARY KEY,
    type       VARCHAR(64)      NOT NULL,
    source_id  VARCHAR(64)      NOT NULL REFERENCES network_elements (id) ON DELETE CASCADE,
    target_id  VARCHAR(64)      NOT NULL REFERENCES network_elements (id) ON DELETE CASCADE,
    directed   BOOLEAN          NOT NULL DEFAULT FALSE,
    weight     DOUBLE PRECISION,
    status     VARCHAR(64),
    version    INTEGER          NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ      NOT NULL,
    properties JSONB            NOT NULL DEFAULT '{}'
);

-- Btree indexes for BFS neighbor traversal and link lookups
CREATE INDEX idx_links_source_id ON topology_links (source_id);
CREATE INDEX idx_links_target_id ON topology_links (target_id);
