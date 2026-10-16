FROM node:22-bookworm-slim
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true CHROME_PATH=/usr/bin/chromium
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation dumb-init && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && chown node:node /app
COPY --chown=node:node . .
USER node
EXPOSE 8080
ENTRYPOINT ["dumb-init","--"]
CMD ["node","server.js"]
