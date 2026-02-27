# Multi-stage build for LLM service
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake \
    build-base

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY services/llm-service/package*.json ./services/llm-service/

# Install dependencies
RUN npm ci

# Install service dependencies
RUN cd services/llm-service && npm ci

# Copy shared code and build
COPY shared/ ./shared/
RUN cd shared && npm run build

# Copy service code and build
COPY services/llm-service/src/ ./services/llm-service/src/
COPY services/llm-service/tsconfig.json ./services/llm-service/
RUN cd services/llm-service && npm run build

# Production stage
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S skippy && \
    adduser -S skippy -u 1001 -G skippy

# Install runtime dependencies
RUN apk add --no-cache curl dumb-init libstdc++ && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files and install production dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/shared/package*.json ./shared/
COPY --from=builder /app/services/llm-service/package*.json ./services/llm-service/

RUN npm ci --only=production && \
    cd services/llm-service && npm ci --only=production && \
    npm cache clean --force

# Copy built application
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/services/llm-service/dist ./services/llm-service/dist

# Create directories for models and data
RUN mkdir -p /app/models /app/logs /app/cache && \
    chown -R skippy:skippy /app

# Switch to non-root user
USER skippy

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "services/llm-service/dist/index.js"]
