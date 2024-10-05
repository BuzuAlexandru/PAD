import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///account_service.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'supersecretkey')
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
