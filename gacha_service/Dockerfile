FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .


# Run the application using Flask-SocketIO
CMD ["python", "app.py"]
