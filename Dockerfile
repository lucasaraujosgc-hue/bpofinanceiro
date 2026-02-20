# Use uma imagem leve do Node.js baseada em Alpine Linux
FROM node:18-alpine

# Instala ferramentas de compilação necessárias para o SQLite (python, make, g++)
# Isso é necessário porque o sqlite3 é um módulo nativo
RUN apk add --no-cache python3 make g++

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de definição de dependências primeiro (para aproveitar o cache do Docker)
COPY package*.json ./

# Instala as dependências do projeto
RUN npm install

# Copia o restante do código da aplicação
COPY . .

# Executa o build da aplicação React (gera a pasta estática 'dist')
RUN npm run build

# Cria o diretório onde o banco de dados será salvo
# O volume será montado aqui pelo EasyPanel/Docker
RUN mkdir -p /backup && chmod 777 /backup

# Informa ao Docker que o container escuta na porta 3000
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["npm", "start"]