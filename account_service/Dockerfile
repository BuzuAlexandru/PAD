# Account Service Dockerfile

FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the current directory contents into the container
COPY . .

# Expose the port the application will run on
EXPOSE 5000

# Set environment variables for PostgreSQL
ENV POSTGRES_USER=user
ENV POSTGRES_PASSWORD=password
ENV POSTGRES_DB=account_db
ENV POSTGRES_HOST=postgres

# Run the application
CMD ["python", "app.py"]
