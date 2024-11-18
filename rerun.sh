docker compose -p loki-clickhouse down;
docker compose -p loki-clickhouse -f docker-compose.yaml up --build -d --remove-orphans;
