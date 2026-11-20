FROM node:22.23.4-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_PUBLIC_BASE_PATH=/bambam NEXT_PUBLIC_API_BASE_URL=/bambam/api/v1 NEXT_PUBLIC_USE_MOCKS=false NEXT_PUBLIC_ROLE_SWITCHER=false
RUN npm run build
FROM node:22.23.4-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_PUBLIC_BASE_PATH=/bambam NEXT_PUBLIC_API_BASE_URL=/bambam/api/v1 NEXT_PUBLIC_USE_MOCKS=false NEXT_PUBLIC_ROLE_SWITCHER=false HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
