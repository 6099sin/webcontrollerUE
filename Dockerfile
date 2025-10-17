# ---- Stage 1: Build the Frontend ----
FROM node:20-slim AS ui-builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .



RUN npm run build:ui


# ---- Stage 2: Build the Backend ----
FROM node:20-slim AS server-builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build


# ---- Stage 3: Create the Final Production Image ----
FROM node:20-slim AS production

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY --from=server-builder /usr/src/app/dist ./dist

COPY --from=ui-builder /usr/src/app/dist ./dist/public

EXPOSE 3001

CMD [ "node", "dist/server.js" ]