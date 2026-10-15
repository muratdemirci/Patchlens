# Deployment

Run `docker compose up --build` to start the optional Next.js UI/API at `http://localhost:3000`. Compose binds to loopback by default. For remote access, place it behind an authenticated TLS reverse proxy. The API only accepts bounded diff text and does not browse server repositories. To use the CLI in CI, install dependencies and run `node apps/cli/dist/index.js --repo PATH --base REF --format sarif`.
