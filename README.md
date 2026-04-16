# Tieba Viewer Next

Next.js app for browsing Baidu Tieba threads, posts, and comments, designed for data crawled by [tieba-archive](https://github.com/lywlywly/tieba-archive).

For an all-in-one Docker Compose setup (archive + viewer + PostgreSQL), see [tieba-stack](https://github.com/lywlywly/tieba-stack).

## Tech Stack

- Next.js 16
- Tailwind CSS 4
- shadcn/ui
- SQLite (`better-sqlite3`) and PostgreSQL (`pg`)

## Main Features

- Thread feed with forum filter and sort modes
- Thread detail page with floor-based pagination and nested comments
- User profile tabs: Overview, Threads, Comments
- Keyword search across threads, posts, and comments

## Quick Start

```bash
cp .env.example .env
pnpm install
pnpm dev
```

App URL: `http://localhost:3000`

## Configuration

Set these values in `.env` or provide them as environment variables.

- `DB_DRIVER=sqlite|postgres`
- SQLite mode: `DB_PATH=/path/to/db.sqlite`
- Postgres mode: `DATABASE_URL=postgresql://...`
- `IMAGE_BASE_DIRS=/path/one,/path/two`

## Docker

### Dev (hot reload)

```bash
docker build -t tieba-viewer-next:dev --target dev .

docker run --rm -it \
  -p 3000:3000 \
  -e DB_DRIVER=postgres \
  -e DATABASE_URL='postgresql://user@host.docker.internal:5432/tieba' \
  -e IMAGE_BASE_DIRS='/data/img' \
  -e CHOKIDAR_USEPOLLING=1 \
  -e WATCHPACK_POLLING=true \
  -v "$PWD":/app \
  -v tieba_viewer_node_modules:/app/node_modules \
  -v tieba_viewer_pnpm_store:/pnpm/store \
  -v /path/to/images/output1:/data/img:ro \
  tieba-viewer-next:dev
```

### Prod (build + start)

```bash
docker build -t tieba-viewer-next:prod --target prod .

docker run --rm -it \
  -p 3000:3000 \
  -e DB_DRIVER=postgres \
  -e DATABASE_URL='postgresql://user@host.docker.internal:5432/tieba' \
  -e IMAGE_BASE_DIRS='/data/img' \
  -v /path/to/images/output1:/data/img:ro \
  tieba-viewer-next:prod
```
