FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001

# Set environment variables for PostgreSQL
ENV POSTGRES_USER=user
ENV POSTGRES_PASSWORD=password
ENV POSTGRES_DB=gacha_db
ENV POSTGRES_HOST=postgres

# Run the application using Flask-SocketIO
CMD ["python", "app.py"]
