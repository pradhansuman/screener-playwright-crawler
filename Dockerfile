# Screener Playwright Crawler — Render web service image
# Uses Playwright's official Docker image so Chromium + deps are preinstalled

FROM mcr.microsoft.com/playwright:v1.45.0-jammy

WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc || true

# Copy static assets
COPY index.html ./
COPY nginx.conf ./

# Reports + generated tests volume (persist on Render disk if attached)
RUN mkdir -p reports generated-tests

ENV PORT=10000
EXPOSE 10000

# Server entry (the Express API). For CLI mode, override command:
#   node dist/index.js --mode full --url <target>
CMD ["node", "dist/server.js"]
