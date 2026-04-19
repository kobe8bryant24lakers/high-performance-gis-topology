# Docker SQL Seeder Design

**Date:** 2026-04-19  
**Goal:** Deploy the full project in Docker for manual testing, seeding the database from `test-data.sql` instead of the API endpoint.

## Problem

The existing `seeder` service calls the Spring Boot API to seed 500 elements and 300 links — too small for realistic manual testing. The test-data SQL file provides a production-scale dataset (1M elements, 600K links) with realistic type distribution and fixed neighbourhood edges needed for integration testing.

## Solution

Replace the `seeder` service in `docker-compose.yml` to run `psql` directly against the Postgres container, mounting `backend/src/test/resources/test-data.sql` as a read-only volume.

```yaml
seeder:
  image: postgres:16-alpine
  depends_on:
    backend:
      condition: service_healthy
  restart: "no"
  volumes:
    - ./backend/src/test/resources/test-data.sql:/test-data.sql:ro
  environment:
    PGPASSWORD: postgres
  command: psql -h postgres -U postgres -d gis_topology -f /test-data.sql
```

## Key Decisions

- **Depends on `backend` (not `postgres`):** Tables (`network_elements`, `topology_links`) are created by Flyway when the backend starts. Depending only on `postgres` would race against migration.
- **`restart: "no"`:** Seeder is one-shot; it must not retry on failure or loop.
- **Read-only mount (`:ro`):** SQL file is source-of-truth; container should not modify it.

## Data Profile

| Entity | Count | Notes |
|--------|-------|-------|
| network_elements | 1,000,000 | 40% access-point, 30% switch, 15% server, 10% router, 5% firewall |
| topology_links | 600,000 | 10 fixed neighbourhood edges + 599,990 mesh links |

Expected seed time: 2–5 minutes.

## Acceptance Criteria

1. `docker compose up --build` completes without errors.
2. Frontend is reachable at `http://localhost:8081`.
3. Backend API returns elements at `http://localhost:8080/api/topology/elements?page=0&size=10`.
4. Database contains ~1M elements and ~600K links after seeder exits.
