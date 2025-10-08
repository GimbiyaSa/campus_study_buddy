# Stage 1: build the TypeScript source
FROM node:22.2-bullseye AS builder
WORKDIR /workspace

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and config, then build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: runtime image
FROM node:22.2-bullseye
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder stage
COPY --from=builder /workspace/dist ./dist

EXPOSE 5000
CMD ["node", "dist/app.js"]
