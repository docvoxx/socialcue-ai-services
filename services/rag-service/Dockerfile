# Multi-stage build for RAG service
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY services/rag-service/package*.json ./services/rag-service/

# Install dependencies
RUN npm ci

# Install service dependencies
RUN cd services/rag-service && npm ci

# Copy shared code and build
COPY shared/ ./shared/
RUN cd shared && npm run build

# Copy service code and build
COPY services/rag-service/src/ ./services/rag-service/src/
COPY services/rag-service/tsconfig.json ./services/rag-service/
RUN cd services/rag-service && npm run build

# Production stage
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S skippy && \
    adduser -S skippy -u 1001 -G skippy

# Install runtime dependencies
RUN apk add --no-cache curl dumb-init && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files and install production dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/shared/package*.json ./shared/
COPY --from=builder /app/services/rag-service/package*.json ./services/rag-service/

RUN npm ci --only=production && \
    cd services/rag-service && npm ci --only=production && \
    npm cache clean --force

# Copy built application
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/services/rag-service/dist ./services/rag-service/dist

# Create directories for data
RUN mkdir -p /app/logs /app/cache && \
    chown -R skippy:skippy /app

# Switch to non-root user
USER skippy

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "services/rag-service/dist/index.js"]
