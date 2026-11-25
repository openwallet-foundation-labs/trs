# syntax=docker/dockerfile:1

FROM node:26-alpine AS build
RUN npm install -g pnpm@10
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/trqp-core/package.json packages/trqp-core/
COPY trs/package.json trs/
RUN pnpm install --frozen-lockfile

COPY packages/trqp-core packages/trqp-core
COPY trs trs
RUN pnpm build:core && pnpm --filter trs build

# Production node_modules for the server only (trqp-core is copied in, not linked).
RUN pnpm --filter trs deploy --prod --legacy /out \
 && cp -r trs/dist /out/dist

FROM node:26-alpine
ENV NODE_ENV=production \
    TRS_PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.TRS_PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/apps/resolver/main.js"]
