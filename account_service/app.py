from flask import Flask, request, jsonify
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from models import db, User
from redis_cache import cache_data, get_cached_data, delete_cache
from sqlalchemy.exc import SQLAlchemyError
from flask_sqlalchemy import SQLAlchemy
import redis
import json

app = Flask(__name__)
app.config.from_object('config.Config')

# Setup JWT
jwt = JWTManager(app)

# Setup Database
db.init_app(app)
with app.app_context():
    db.create_all()
# Setup Redis
cache = redis.StrictRedis(host='redis', port=6379, decode_responses=True)


# Status Endpoint (Health Check)
@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "Account service running"}), 200


# Registration Endpoint
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    user = User(username=username)
    user.set_password(password)
    user.currency = 1000

    try:
        db.session.add(user)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not register user"}), 500

    return jsonify({"message": "User registered successfully"}), 201


# Login Endpoint
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        access_token = create_access_token(identity=user.id)
        return jsonify({"token": access_token}), 200
    else:
        return jsonify({"error": "Invalid credentials"}), 401


# Get Current Currency
@app.route('/currency', methods=['GET'])
@jwt_required()
def get_currency():
    user_id = get_jwt_identity()

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({"currency": user.currency}), 200


# Buy Currency
@app.route('/buy-currency', methods=['POST'])
@jwt_required()
def buy_currency():
    user_id = get_jwt_identity()
    data = request.get_json()
    amount = data.get('amount')

    if amount <= 0:
        return jsonify({"error": "Invalid amount"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Update currency
    user.currency += amount
    db.session.commit()

    return jsonify({"currency": user.currency}), 200


@app.route('/deduce-currency', methods=['PUT'])
@jwt_required()
def deduce_currency():
    user_id = get_jwt_identity()
    data = request.get_json()
    amount_to_deduct = data.get("amount")

    if amount_to_deduct <= 0:
        return jsonify({"error": "Invalid deduction amount"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.currency < amount_to_deduct:
        return jsonify({"error": "Insufficient currency"}), 400

    # Deduce currency
    user.currency -= amount_to_deduct
    db.session.commit()

    return jsonify({"message": "Currency deducted", "currency": user.currency}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
