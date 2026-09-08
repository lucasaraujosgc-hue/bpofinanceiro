# Imagem leve do Node.js (Alpine)
FROM node:18-alpine

WORKDIR /app

# Dependências primeiro (aproveita o cache de layer do Docker)
COPY package*.json ./

# npm ci = build reprodutível a partir do package-lock.json
RUN npm ci

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
