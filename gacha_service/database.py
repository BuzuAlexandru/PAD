import os

from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()


def init_db(app):
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ["DATABASE_URL"]
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = "your_flask_secret_key"
    app.config['JWT_SECRET_KEY'] = os.environ.get("FLASK_SECRET_KEY")
    app.config['JWT_ALGORITHM'] = "HS256"
    db.init_app(app)
