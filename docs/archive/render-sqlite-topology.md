# Render + file-based SQLite (retired)

`render.yaml` proposed running the frontend on Render with a persistent disk
holding `file:/data/glimmora.db`, reconciled to `schema.prisma` by
`npx prisma db push` on every boot.

It is retired for two independent reasons:

1. **It would destroy data.** `prisma db push` reconciles the WHOLE database to
   the Prisma schema. The production database is shared with the FastAPI backend,
   which owns snake_case tables that `schema.prisma` does not declare — and
   `.do/app.yaml:14-18` records that this exact command drops them.
2. **The schema is not SQLite.** `schema.prisma` declares
   `provider = "postgresql"`. Pointing `db push` at a file-based SQLite database
   reconciles a PostgreSQL schema into a SQLite file.

The topology itself — a persistent disk holding a local database — is a
reasonable choice for a small single-service deployment that does not share a
database with anything. DigitalOcean App Platform with one managed PostgreSQL
instance is the supported topology; see `.do/app.yaml`.

Two things the retired file got right and that are kept elsewhere:

- `startCommand` should be idempotent across boots, which the current
  `prisma migrate deploy` in the `migrate` job is.
- A persistent disk is a real consideration for any stateful service. The current
  topology keeps state in PostgreSQL instead, so there is no disk to persist.
