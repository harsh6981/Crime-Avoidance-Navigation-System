-- ═══════════════════════════════════════════════════════════
-- SafePath — PostgreSQL + PostGIS Schema
-- Run this file once to initialize your database.
--
-- HOW TO RUN:
--   psql -U postgres -d safepath -f schema.sql
--
-- PREREQS:
--   1. Install PostgreSQL: https://www.postgresql.org/download/
--   2. Install PostGIS: https://postgis.net/documentation/getting_started/
--   3. Create the database: CREATE DATABASE safepath;
-- ═══════════════════════════════════════════════════════════

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;  -- For advanced routing (optional)


CREATE TABLE IF NOT EXISTS users (
    user_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             VARCHAR(100) NOT NULL,
    email            VARCHAR(100) UNIQUE NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    trusted_contacts JSONB,   -- e.g. [{"name": "Mom", "phone": "+91XXXXXXXXXX"}]
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS road_nodes (
    node_id BIGINT PRIMARY KEY,  -- Maps to OpenStreetMap Node ID
    geom    GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS road_nodes_geom_idx ON road_nodes USING GIST (geom);


CREATE TABLE IF NOT EXISTS road_edges (
    edge_id           BIGINT PRIMARY KEY,  -- Maps to OSM Way ID
    source_node       BIGINT REFERENCES road_nodes(node_id),
    target_node       BIGINT REFERENCES road_nodes(node_id),
    geom              GEOMETRY(LineString, 4326) NOT NULL,
    length_meters     FLOAT NOT NULL,
    road_type         VARCHAR(50),        -- 'residential', 'highway', 'pedestrian', 'footway'
    is_lit            BOOLEAN DEFAULT FALSE,
    base_safety_score FLOAT DEFAULT 5.0   -- Updated nightly by the AI clustering script
);

CREATE INDEX IF NOT EXISTS road_edges_geom_idx    ON road_edges USING GIST (geom);
CREATE INDEX IF NOT EXISTS road_edges_source_idx  ON road_edges (source_node);
CREATE INDEX IF NOT EXISTS road_edges_target_idx  ON road_edges (target_node);


CREATE TABLE IF NOT EXISTS historical_crimes (
    crime_id        SERIAL PRIMARY KEY,
    crime_type      VARCHAR(50) NOT NULL,    -- 'theft', 'assault', 'robbery'
    severity_weight FLOAT NOT NULL,          -- 0.0 to 1.0
    date_reported   DATE NOT NULL,
    time_of_day     TIME,
    geom            GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS crimes_geom_idx ON historical_crimes USING GIST (geom);


CREATE TABLE IF NOT EXISTS safe_havens (
    haven_id       SERIAL PRIMARY KEY,
    name           VARCHAR(100),
    type           VARCHAR(50),        -- 'Police Station', 'Hospital', '24/7 Pharmacy'
    contact_number VARCHAR(20),
    geom           GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS havens_geom_idx ON safe_havens USING GIST (geom);


INSERT INTO safe_havens (name, type, contact_number, geom) VALUES
    ('Andheri Police Station',    'Police Station', '022-26361818', ST_SetSRID(ST_MakePoint(72.8479, 19.1136), 4326)),
    ('Bandra Police Station',     'Police Station', '022-26422056', ST_SetSRID(ST_MakePoint(72.8369, 19.0596), 4326)),
    ('Kokilaben Hospital',        'Hospital',       '022-30999999', ST_SetSRID(ST_MakePoint(72.8300, 19.1071), 4326)),
    ('Lilavati Hospital',         'Hospital',       '022-26751000', ST_SetSRID(ST_MakePoint(72.8267, 19.0462), 4326))
ON CONFLICT DO NOTHING;