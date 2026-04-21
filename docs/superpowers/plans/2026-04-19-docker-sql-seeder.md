# Docker SQL Seeder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the API-based seeder in `docker-compose.yml` with a `psql` seeder that loads `backend/src/test/resources/test-data.sql` (1M elements, 600K links) for realistic manual testing.

**Architecture:** The `seeder` service is changed from a `curlimages/curl` container calling the REST API to a `postgres:16-alpine` container that runs `psql` directly against the database after the backend is healthy (ensuring Flyway migrations have run). The SQL file is mounted read-only.

**Tech Stack:** Docker Compose, PostgreSQL 16 (`psql`), existing PostGIS DB

---

## File Map

| File | Change |
|------|--------|
| `docker-compose.yml` | Modify `seeder` service (lines 35–44) |

---

### Task 1: Replace seeder service in docker-compose.yml

**Files:**
- Modify: `docker-compose.yml:35-44`

- [ ] **Step 1: Edit the seeder service**

Open `docker-compose.yml` and replace lines 35–44 (the `seeder` service block) with:

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

The full `docker-compose.yml` after the change:

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: gis_topology
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d gis_topology"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/gis_topology
      SPRING_DATASOURCE_USERNAME: postgres
      SPRING_DATASOURCE_PASSWORD: postgres
      SPRING_PROFILES_ACTIVE: local
      ADMIN_SEED_TOKEN: dev-seed-token
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/actuator/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 12

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

  frontend:
    build: ./frontend
    ports:
      - "8081:80"
    depends_on:
      - backend

volumes:
  pgdata:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: seed DB from test-data.sql (1M elements, 600K links)"
```

---

### Task 2: Build and run the stack

**Files:** none (runtime only)

- [ ] **Step 1: Bring down any running stack and wipe the volume**

```bash
docker compose down -v
```

Expected: containers stopped, `pgdata` volume removed (ensures clean DB for Flyway + seeder).

- [ ] **Step 2: Build and start all services**

```bash
docker compose up --build
```

Expected sequence in logs:
1. `postgres` starts and passes health check
2. `backend` starts, Flyway runs migrations, health check passes (may take 1–2 min for Maven build on first run)
3. `seeder` connects and begins loading SQL (2–5 min for 1M rows)
4. `frontend` starts (Nginx ready)

- [ ] **Step 3: Verify frontend**

Open `http://localhost:8081` in a browser.
Expected: Vue app loads without errors.

- [ ] **Step 4: Verify backend has data**

```bash
curl -s "http://localhost:8080/api/topology/elements/el-0"
```

Expected: `{"id":"el-0","type":"router","label":"router-0","lng":0.005,"lat":51.334,"version":1,"updatedAt":"2026-01-01T00:00Z","properties":{"index":0}}`

- [ ] **Step 5: Verify link count (optional)**

```bash
docker compose exec postgres psql -U postgres -d gis_topology \
  -c "SELECT COUNT(*) FROM network_elements; SELECT COUNT(*) FROM topology_links;"
```

Expected:
```
  count
---------
 1000000

  count
--------
 600000
```
