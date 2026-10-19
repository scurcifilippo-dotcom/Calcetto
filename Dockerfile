FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# Optional custom trust bundle for development environments with a corporate TLS proxy.
# The CA is mounted only during this step and is never included in the image.
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca npm_config_cafile=/run/secrets/npm_ca; fi; \
    npm ci --no-audit --no-fund --fetch-retries=1 --fetch-timeout=30000
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Admin-invite/backup commands use the source modules and esbuild, kept out of the browser.
COPY --from=build --chown=node:node /app/lib ./lib
COPY --from=build --chown=node:node /app/scripts/admin-invite.mjs /app/scripts/backup.mjs ./scripts/
COPY --from=build --chown=node:node /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=build --chown=node:node /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /var/data /app/data && chown node:node /var/data /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
