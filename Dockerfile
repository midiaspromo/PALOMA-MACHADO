# NutriMatch — Coolify/Docker deployment
FROM node:20-bookworm-slim

WORKDIR /app

# Native dependency better-sqlite3 requires build tools during installation.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++     && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Persistent SQLite database and session store should live in /app/data.
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["npm", "start"]
