# APEX Trading System v5.0 — Production Dockerfile
# Runs both Python engine + Node.js server in a single container

FROM node:20-slim AS frontend-build

WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN npm install --production=false

COPY packages/shared packages/shared
COPY packages/client packages/client
RUN cd packages/client && npx vite build

# Final image
FROM python:3.11-slim

# Install Node.js 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies
COPY packages/engine/requirements.txt packages/engine/
RUN pip install --no-cache-dir -r packages/engine/requirements.txt

# Node dependencies
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm install --production

# Copy source
COPY packages/engine packages/engine
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY --from=frontend-build /app/packages/client/dist packages/client/dist

# Copy config files
COPY .env.example .env
COPY start.sh .

ENV NODE_ENV=production
ENV ENGINE_URL=http://localhost:8000
ENV NODE_PORT=3001

EXPOSE 3001

# Start both services
CMD ["bash", "-c", "cd packages/engine && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 & sleep 3 && cd /app/packages/server && npx tsx src/index.ts"]
