# 1. Start with a base Node.js image
FROM node:18-slim

# 2. Set the working directory inside the container
WORKDIR /usr/src/app

# 3. Copy package.json and package-lock.json
COPY package*.json ./

# 4. Install production dependencies
RUN npm install --only=production

# 5. Copy the rest of your application code (including the 'dist' folder)
COPY . .

# 6. Expose the port your server runs on
EXPOSE 3001

# 7. The command to run your application
CMD [ "node", "dist/server.js" ]