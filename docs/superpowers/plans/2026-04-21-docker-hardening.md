# Docker Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all issues found in the adversarial review of PR #11 — critical security exposure, non-atomic seeding, fragile healthcheck, startup race, and missing HTTP security headers.

**Architecture:** Five independent fix groups: (1) replace the DB-backed healthcheck with Spring Actuator + ensure curl is in the JRE image, (2) wrap the SQL seed script in a transaction, (3) harden docker-compose.yml (port binding, env vars, image pins, service ordering), (4) add Nginx security headers, (5) update stale docs.

**Tech Stack:** Docker Compose, Spring Boot 3.3 (Actuator), PostgreSQL/psql, Nginx, Maven

---

## File Map

| File | Change |
|------|--------|
| `backend/pom.xml` | Add `spring-boot-starter-actuator` dependency |
| `backend/Dockerfile` | Add curl to JRE runtime stage |
| `backend/src/test/resources/test-data.sql` | Wrap all DML in `BEGIN` / `COMMIT` |
| `docker-compose.yml` | Port binding, env vars, image pins, healthcheck URL, service ordering, reuse seeder image |
| `.env.example` | New file — template for local `.env` |
| `frontend/nginx.conf` | Add HTTP security headers |
| `docs/superpowers/specs/2026-04-19-docker-sql-seeder-design.md` | Fix stale healthcheck URL and psql command snippet |
| `docs/superpowers/plans/2026-04-19-docker-sql-seeder.md` | Fix stale healthcheck URL in verification steps |

---

### Task 1: Add Spring Actuator and ensure curl in runtime image

**Files:**
- Modify: `backend/pom.xml:26-88`
- Modify: `backend/Dockerfile:8-11`

- [ ] **Step 1: Add actuator dependency to pom.xml**

In `backend/pom.xml`, add after the `spring-boot-starter-validation` block (after line 37):

```xml
        <!-- Actuator — lightweight /actuator/health for Docker healthcheck -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
```

- [ ] **Step 2: Pin image tags and install curl in the backend Dockerfile**

Replace the entire `backend/Dockerfile` with (pins build and runtime tags, installs curl):

```dockerfile
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre-jammy
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/gis-topology-backend-*.jar app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]
```

Replace the entire `frontend/Dockerfile` with (pins node and nginx tags):

```dockerfile
FROM node:20.19-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Verify the Dockerfile builds locally**

```bash
docker build -t gis-backend-test /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology/backend
```

Expected: build succeeds, no errors.

Clean up after verification:

```bash
docker rmi gis-backend-test
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology \
  add backend/pom.xml backend/Dockerfile frontend/Dockerfile
git -C /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology \
  commit -m "fix: add Spring Actuator, curl, and pin Dockerfile base image tags"
```

---

### Task 2: Wrap SQL seed script in a transaction

**Files:**
- Modify: `backend/src/test/resources/test-data.sql:1`

- [ ] **Step 1: Add BEGIN at the top and COMMIT at the bottom**

Current file starts at line 1 with a comment block and ends at line 108 with the links insert.

Add `BEGIN;` as the very first non-comment line (after the header comments, before `DELETE FROM topology_links`), and `COMMIT;` as the very last line.

The file should look like this (only the first and last substantive lines change):

```sql
-- Test data for gis_topology — 1 000 000 elements, 600 000 links.
-- [... existing comments unchanged ...]

BEGIN;

-- ── Clean slate ──────────────────────────────────────────────────────────────
DELETE FROM topology_links;
DELETE FROM network_elements;

-- [... all existing INSERT statements unchanged ...]

FROM generate_series(10, 599999) AS i;

COMMIT;
```

Exact edit: insert `BEGIN;` on a new line immediately before `DELETE FROM topology_links;` (currently line 21), and append `COMMIT;` after the final `FROM generate_series(10, 599999) AS i;` line (currently line 108).

- [ ] **Step 2: Verify SQL is valid**

```bash
docker run --rm -i postgres:16-alpine psql --no-password -c "\\i /dev/stdin" <<'EOF'
BEGIN;
DELETE FROM topology_links;
ROLLBACK;
EOF
```

Expected: `ERROR:  relation "topology_links" does not exist` — this confirms psql parsed the BEGIN/ROLLBACK framing correctly (the error is expected since we have no DB, but it shows the SQL parses).

- [ ] **Step 3: Commit**

```bash
git -C /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology \
  add backend/src/test/resources/test-data.sql
git -C /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology \
  commit -m "fix: wrap seed SQL in a transaction to prevent partial-seed state"
```

---

### Task 3: Harden docker-compose.yml and create .env.example

**Files:**
- Modify: `docker-compose.yml`
- Create: `.env.example`

Changes to docker-compose.yml:
1. Bind backend port to `127.0.0.1` (blocks external access)
2. Replace hardcoded secrets with `${VAR:-default}` env var references
3. Change healthcheck URL from `/api/topology/search?q=health` to `/actuator/health`
4. Change seeder image from `postgres:16-alpine` to `postgis/postgis:16-3.4` (already pulled, has psql)
5. Pin all floating image tags to specific minor versions
6. Gate frontend on `seeder: service_completed_successfully` + `backend: service_healthy`

- [ ] **Step 1: Create .env.example**

Create `/Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology/.env.example`:

```bash
# Copy this file to .env and adjust values for your local environment.
# .env is gitignored and never committed.

POSTGRES_PASSWORD=postgres
ADMIN_SEED_TOKEN=dev-seed-token
```

- [ ] **Step 2: Write the full updated docker-compose.yml**

Replace the entire content of `docker-compose.yml` with:

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: gis_topology
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
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
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      SPRING_PROFILES_ACTIVE: local
      ADMIN_SEED_TOKEN: ${ADMIN_SEED_TOKEN:-dev-seed-token}
    ports:
      - "127.0.0.1:8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/actuator/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 12

  seeder:
    image: postgis/postgis:16-3.4
    depends_on:
      backend:
        condition: service_healthy
    restart: "no"
    volumes:
      - ./backend/src/test/resources/test-data.sql:/test-data.sql:ro
    environment:
      PGPASSWORD: ${POSTGRES_PASSWORD:-postgres}
    command: psql -h postgres -U postgres -d gis_topology -v ON_ERROR_STOP=1 -f /test-data.sql

  frontend:
    build: ./frontend
    ports:
      - "127.0.0.1:8081:80"
    depends_on:
      backend:
        condition: service_healthy
      seeder:
        condition: service_completed_successfully

volumes:
  pgdata:
```

Key changes from the previous version:
- `postgres` and `backend` passwords use `${POSTGRES_PASSWORD:-postgres}`
- `ADMIN_SEED_TOKEN` uses `${ADMIN_SEED_TOKEN:-dev-seed-token}`
- Backend port is `127.0.0.1:8080:8080` (localhost only)
- Frontend port is `127.0.0.1:8081:80` (localhost only)
- Backend healthcheck uses `/actuator/health` (lightweight, no DB query)
- Seeder image is `postgis/postgis:16-3.4` (reuses already-pulled image)
- Frontend depends on both `backend: service_healthy` AND `seeder: service_completed_successfully`

- [ ] **Step 3: Validate the compose file**

```bash
docker compose -f /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology/docker-compose.yml config
```

Expected: full resolved config printed with no errors.

- [ ] **Step 4: Commit**

```bash
git -C /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology \
  add docker-compose.yml .env.example
git -C /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology \
  commit -m "fix: harden compose — localhost binding, env vars, actuator health, seeder gate"
```

---

### Task 4: Add HTTP security headers to Nginx

**Files:**
- Modify: `frontend/nginx.conf`

- [ ] **Step 1: Add security headers to the server block**

Current `frontend/nginx.conf`:

```nginx
server {
    listen 80;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Replace with:

```nginx
server {
    listen 80;

    root /usr/share/nginx/html;
    index index.html;

    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;

    location /api/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Validate nginx config syntax**

```bash
docker run --rm -v /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology/frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine nginx -t
```

Expected:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology \
  add frontend/nginx.conf
git -C /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology \
  commit -m "fix: add HTTP security headers and forwarding headers to Nginx"
```

---

### Task 5: Update stale documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-04-19-docker-sql-seeder-design.md`
- Modify: `docs/superpowers/plans/2026-04-19-docker-sql-seeder.md`

- [ ] **Step 1: Fix stale snippets in spec doc**

In `docs/superpowers/specs/2026-04-19-docker-sql-seeder-design.md`:

Find this line in the YAML snippet (under "## Solution"):
```yaml
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/api/topology/elements?page=0&size=1 || exit 1"]
```
Replace with:
```yaml
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/actuator/health || exit 1"]
```

Find the psql command snippet:
```yaml
    command: psql -h postgres -U postgres -d gis_topology -f /test-data.sql
```
Replace with:
```yaml
    command: psql -h postgres -U postgres -d gis_topology -v ON_ERROR_STOP=1 -f /test-data.sql
```

Find acceptance criteria item 3:
```
3. Backend API returns elements at `http://localhost:8080/api/topology/elements?page=0&size=10`.
```
Replace with:
```
3. Backend health endpoint returns `{"status":"UP"}` at `http://localhost:8080/actuator/health`.
```

- [ ] **Step 2: Fix verification commands in plan doc**

In `docs/superpowers/plans/2026-04-19-docker-sql-seeder.md`, find Step 4 (Verify backend has data):

```bash
curl -s "http://localhost:8080/api/topology/elements?page=0&size=5" | python3 -m json.tool
```
Expected: JSON response with `content` array containing elements like `el-0`, `el-1`, etc., and `totalElements` near 1000000.

Replace with:
```bash
curl -s "http://localhost:8080/api/topology/elements/el-0"
```
Expected: `{"id":"el-0","type":"router","label":"router-0","lng":0.005,"lat":51.334,"version":1,"updatedAt":"2026-01-01T00:00Z","properties":{"index":0}}`

- [ ] **Step 3: Commit**

```bash
git -C /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology \
  add docs/superpowers/specs/2026-04-19-docker-sql-seeder-design.md \
     docs/superpowers/plans/2026-04-19-docker-sql-seeder.md
git -C /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology \
  commit -m "docs: fix stale healthcheck URL and verification commands"
```

---

### Task 6: Smoke-test the fully hardened stack

**Files:** none (runtime verification only)

- [ ] **Step 1: Rebuild and restart clean**

```bash
docker compose -f /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology/docker-compose.yml down -v
docker compose -f /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology/docker-compose.yml up --build -d
```

- [ ] **Step 2: Wait for frontend to be healthy (seeder must complete first)**

```bash
docker compose -f /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology/docker-compose.yml ps
```

The frontend will only be `Up` after the seeder exits with code 0. Keep polling every 30s until frontend shows `Up`.

- [ ] **Step 3: Verify actuator health endpoint**

```bash
curl -s http://localhost:8080/actuator/health
```

Expected: `{"status":"UP"}`

- [ ] **Step 4: Verify data**

```bash
curl -s http://localhost:8080/api/topology/elements/el-0
```

Expected: `{"id":"el-0","type":"router","label":"router-0","lng":0.005,"lat":51.334,...}`

- [ ] **Step 5: Verify localhost-only binding (external access blocked)**

```bash
curl -s --connect-timeout 2 http://0.0.0.0:8080/actuator/health 2>&1 || echo "BLOCKED as expected"
```

Note: On macOS Docker Desktop, `127.0.0.1` binding still routes via the VM — this test may still succeed locally. The binding matters most in cloud/CI environments where the host has a routable external IP.

- [ ] **Step 6: Verify Nginx security headers**

```bash
curl -sI http://localhost:8081 | grep -E "X-Frame|X-Content|X-XSS|Referrer"
```

Expected:
```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```
