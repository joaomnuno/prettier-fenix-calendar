# syntax=docker/dockerfile:1

# Dependencies: bun owns the lockfile, so it installs them. Debian-based to match
# the Node runtime's glibc for the packages that ship native binaries.
FROM oven/bun:1-debian AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Build: vinext emits dist/standalone — a Node server plus only the packages it
# imports at runtime. The vinext CLI needs Node, not bun.
FROM node:22.13-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Called directly rather than through `bun run build`: scripts/build-verified.sh
# exists for the sandboxed dev environment and imposes a wall-clock timeout that
# image builds should not inherit.
RUN node ./node_modules/.bin/vinext build

# Runtime: the standalone output only. No sources, no bun, no dev dependencies.
FROM node:22.13-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

# Run unprivileged. The image ships no writable application state.
COPY --from=build --chown=node:node /app/dist/standalone ./

USER node
EXPOSE 3000

# Exec form, so signals reach the server directly and the container stops cleanly.
CMD ["node", "server.js"]
