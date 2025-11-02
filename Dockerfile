FROM node:20-alpine AS base

# Production stage
FROM base AS production
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Start application
CMD ["node", "src/server.js src/workers/ai-worker.js"]
