FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ARG COMMIT_SHA=local
ARG BUILD_CHANNEL=custom
LABEL org.opencontainers.image.revision=$COMMIT_SHA
WORKDIR /app
ENV NODE_ENV=production PORT=9304 DATA_DIR=/config COMMIT_SHA=$COMMIT_SHA BUILD_CHANNEL=$BUILD_CHANNEL
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir /config && chown node:node /config
USER node
EXPOSE 9304
HEALTHCHECK --interval=15s --timeout=3s CMD node -e 'fetch("http://127.0.0.1:"+process.env.PORT+"/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
CMD ["node", "dist/server/index.js"]
