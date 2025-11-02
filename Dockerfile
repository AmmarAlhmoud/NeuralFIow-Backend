FROM node:20-alpine AS base

FROM base AS production
WORKDIR /app

COPY package*.json ./

# Install ALL dependencies (including PM2)
RUN npm ci && npm cache clean --force

COPY . .

EXPOSE 8080

# Start with PM2
CMD ["npx", "pm2-runtime", "start", "ecosystem.config.js"]