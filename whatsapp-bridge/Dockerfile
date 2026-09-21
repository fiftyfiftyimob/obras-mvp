FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 \
    libxrandr2 unzip xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY whatsapp-bridge/package.json whatsapp-bridge/package-lock.json ./
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
RUN npm ci --omit=dev \
  && rm -rf "$PUPPETEER_CACHE_DIR" \
  && npx puppeteer browsers install chrome
COPY whatsapp-bridge/src ./src

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
