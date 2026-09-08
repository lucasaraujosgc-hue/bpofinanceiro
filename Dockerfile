# Debian slim (glibc) — Node 20 LTS.
# Alpine/musl + os binários nativos do Tailwind v4 (@tailwindcss/oxide) davam
# "Cannot find native binding" no build. Debian/glibc resolve isso.
FROM node:20-slim

WORKDIR /app

# Dependências primeiro (cache de layer)
COPY package*.json ./

# --include=optional garante os binários por-plataforma (oxide/rollup/esbuild).
RUN npm ci --no-audit --include=optional

# Restante do código
COPY . .

# Build do SPA (usa devDependencies) → gera dist/
RUN npm run build

# A partir daqui o processo roda em modo produção: server.js serve dist/
# estático em vez de subir o dev server do Vite. Precisa vir DEPOIS do build.
ENV NODE_ENV=production

# Diretório do volume persistente (logos). Montado pelo EasyPanel/Docker.
RUN mkdir -p /backup && chown -R node:node /backup /app

USER node
EXPOSE 3000
CMD ["npm", "start"]
