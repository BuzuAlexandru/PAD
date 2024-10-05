# Use Node.js 18 as the base image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
