FROM node:22-alpine
WORKDIR /app
COPY receiver/package.json receiver/server.mjs ./
USER node
ENV NODE_ENV=production PORT=3188
EXPOSE 3188
CMD ["node", "server.mjs"]
