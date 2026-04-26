# Project: high-performance-gis-topology

## Stack

- **Frontend:** Vue 3 + Vite (served by Nginx on port 8081 in Docker)
- **Backend:** Spring Boot 3 / Java 21 (port 8080)
- **Database:** PostgreSQL 16 + PostGIS 3.4

## Local Docker Deploy (Manual Testing)

Maven's `dependency:go-offline` fails inside Docker on macOS due to TLS issues with Maven Central through Docker Desktop's network stack. The workaround is to build the JAR locally first, then let Docker copy it in.

### Steps

**1. Build the backend JAR locally**
```sh
cd backend && mvn package -DskipTests -q && cd ..
```

**2. Build Docker images**
```sh
docker compose --profile seed build
```

**3. Start the stack with seed data**
```sh
docker compose --profile seed up -d
```

**4. Verify**
```sh
curl http://localhost:8080/actuator/health   # should return {"status":"UP"}
# Frontend: http://localhost:8081
```

The `seeder` service runs once (restart: "no") and loads `backend/src/test/resources/test-data.sql` into PostgreSQL. It exits automatically after inserting ~1.6M rows.

### Tear Down
```sh
docker compose --profile seed down
```

To also wipe the database volume:
```sh
docker compose --profile seed down -v
```

## Key Files

- `docker-compose.yml` — defines postgres, backend, frontend, and seeder (profile: seed) services
- `backend/Dockerfile` — copies pre-built JAR from `target/`; does not build from source inside Docker
- `backend/.dockerignore` — `target/` must NOT be excluded for the Docker copy step to work
- `backend/src/test/resources/test-data.sql` — seed data loaded by the seeder container
- `.env` / `.env.example` — `POSTGRES_PASSWORD`, `ADMIN_SEED_TOKEN`
