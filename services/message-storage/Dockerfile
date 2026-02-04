# Multi-stage build for message-storage service

# ---- Builder Stage ----
FROM node:18-slim AS builder
WORKDIR /usr/src/app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# ---- Production Stage ----
FROM node:18-slim AS production
WORKDIR /usr/src/app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled code from builder
COPY --from=builder /usr/src/app/dist ./dist

# Copy SQL schema file (needed at runtime)
COPY --from=builder /usr/src/app/src/database/schema.sql ./dist/database/

# Run the service
CMD ["node", "dist/index.js"]
