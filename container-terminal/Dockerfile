FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
USER node
EXPOSE 8080
CMD ["node","src/server.mjs"]
