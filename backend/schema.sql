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
    -- Police Stations
    ('Andheri Police Station',       'Police Station', '022-26361818', ST_SetSRID(ST_MakePoint(72.8479, 19.1136), 4326)),
    ('Bandra Police Station',        'Police Station', '022-26422056', ST_SetSRID(ST_MakePoint(72.8369, 19.0596), 4326)),
    ('Juhu Police Station',          'Police Station', '022-26700824', ST_SetSRID(ST_MakePoint(72.8296, 19.1075), 4326)),
    ('Santacruz Police Station',     'Police Station', '022-26492212', ST_SetSRID(ST_MakePoint(72.8412, 19.0805), 4326)),
    ('Powai Police Station',         'Police Station', '022-28572211', ST_SetSRID(ST_MakePoint(72.9066, 19.1182), 4326)),
    ('Goregaon Police Station',      'Police Station', '022-28721166', ST_SetSRID(ST_MakePoint(72.8497, 19.1559), 4326)),
    ('Malad Police Station',         'Police Station', '022-28811166', ST_SetSRID(ST_MakePoint(72.8486, 19.1868), 4326)),
    ('Borivali Police Station',      'Police Station', '022-28921166', ST_SetSRID(ST_MakePoint(72.8574, 19.2288), 4326)),
    ('Dadar Police Station',         'Police Station', '022-24127755', ST_SetSRID(ST_MakePoint(72.8438, 19.0178), 4326)),
    ('Colaba Police Station',        'Police Station', '022-22821817', ST_SetSRID(ST_MakePoint(72.8327, 18.9068), 4326)),
    ('Marine Drive Police Station',  'Police Station', '022-22811818', ST_SetSRID(ST_MakePoint(72.8235, 18.9432), 4326)),
    ('Kurla Police Station',         'Police Station', '022-25033344', ST_SetSRID(ST_MakePoint(72.8792, 19.0726), 4326)),
    ('Vile Parle Police Station',    'Police Station', '022-26125566', ST_SetSRID(ST_MakePoint(72.8489, 19.0963), 4326)),
    ('Worli Police Station',         'Police Station', '022-24937755', ST_SetSRID(ST_MakePoint(72.8183, 19.0145), 4326)),

    -- Hospitals
    ('Kokilaben Hospital',             'Hospital', '022-30999999', ST_SetSRID(ST_MakePoint(72.8300, 19.1071), 4326)),
    ('Lilavati Hospital',              'Hospital', '022-26751000', ST_SetSRID(ST_MakePoint(72.8267, 19.0462), 4326)),
    ('Hinduja Hospital',               'Hospital', '022-24452222', ST_SetSRID(ST_MakePoint(72.8397, 19.0356), 4326)),
    ('Nanavati Hospital',              'Hospital', '022-26267500', ST_SetSRID(ST_MakePoint(72.8371, 19.0931), 4326)),
    ('Bombay Hospital',                'Hospital', '022-22067676', ST_SetSRID(ST_MakePoint(72.8277, 18.9390), 4326)),
    ('KEM Hospital',                   'Hospital', '022-24136051', ST_SetSRID(ST_MakePoint(72.8410, 19.0001), 4326)),
    ('Sion Hospital',                  'Hospital', '022-24076381', ST_SetSRID(ST_MakePoint(72.8616, 19.0408), 4326)),
    ('Holy Family Hospital',           'Hospital', '022-26427700', ST_SetSRID(ST_MakePoint(72.8340, 19.0430), 4326)),
    ('Hiranandani Hospital (Powai)',   'Hospital', '022-25763300', ST_SetSRID(ST_MakePoint(72.9080, 19.1195), 4326)),
    ('Fortis Hospital (Mulund)',       'Hospital', '022-67998500', ST_SetSRID(ST_MakePoint(72.9574, 19.1735), 4326)),
    ('Wockhardt Hospital (Mira Road)', 'Hospital', '022-28555000', ST_SetSRID(ST_MakePoint(72.8726, 19.2813), 4326)),
    ('JJ Hospital',                    'Hospital', '022-23735555', ST_SetSRID(ST_MakePoint(72.8350, 18.9611), 4326)),
    ('Cooper Hospital',                'Hospital', '022-26207254', ST_SetSRID(ST_MakePoint(72.8307, 19.0874), 4326)),
    ('Jaslok Hospital',                'Hospital', '022-66573333', ST_SetSRID(ST_MakePoint(72.8121, 18.9720), 4326)),

    -- Fire Stations
    ('Bandra Fire Station',    'Fire Station', '022-26401243', ST_SetSRID(ST_MakePoint(72.8353, 19.0578), 4326)),
    ('Andheri Fire Station',   'Fire Station', '022-26834343', ST_SetSRID(ST_MakePoint(72.8461, 19.1198), 4326)),
    ('Dadar Fire Station',     'Fire Station', '022-24220019', ST_SetSRID(ST_MakePoint(72.8440, 19.0200), 4326)),
    ('Borivali Fire Station',  'Fire Station', '022-28932232', ST_SetSRID(ST_MakePoint(72.8560, 19.2270), 4326)),
    ('Colaba Fire Station',    'Fire Station', '022-22180078', ST_SetSRID(ST_MakePoint(72.8313, 18.9125), 4326)),

    -- 24/7 Pharmacies
    ('Apollo Pharmacy (Bandra)',  '24/7 Pharmacy', '022-26407200', ST_SetSRID(ST_MakePoint(72.8356, 19.0545), 4326)),
    ('MedPlus (Andheri West)',    '24/7 Pharmacy', '022-26730100', ST_SetSRID(ST_MakePoint(72.8363, 19.1190), 4326)),
    ('Wellness Forever (Powai)',  '24/7 Pharmacy', '022-61504050', ST_SetSRID(ST_MakePoint(72.9050, 19.1175), 4326))
ON CONFLICT DO NOTHING;