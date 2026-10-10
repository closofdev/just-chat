# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8081
COPY package.json ./
COPY server.cjs ./
COPY --from=build /app/dist ./dist
EXPOSE 8081
CMD ["node", "server.cjs"]
