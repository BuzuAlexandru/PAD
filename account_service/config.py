import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ.get("FLASK_SECRET_KEY")
    SECRET_KEY = "your_flask_secret_key"
    JWT_ALGORITHM= "HS256"
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
