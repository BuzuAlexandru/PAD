from flask import Flask, jsonify, request
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity
from models import Item, GachaHistory, Banner
from database import init_db, db
from redis_cache import cache, get_cached_data, cache_data
import random
from flask_socketio import SocketIO, emit, send
from flask_jwt_extended import jwt_required
from models import Item, GachaHistory
import requests

app = Flask(__name__)

# JWT setup
app.config['JWT_SECRET_KEY'] = 'your_jwt_secret_key'
jwt = JWTManager(app)
init_db(app)
with app.app_context():
    db.create_all()


# db.init_app(app)


@app.route('/status')
def status():
    from models import Banner, Item
    # hero_banner = Banner(name='Hero Banner')
    # equipment_banner = Banner(name='Equipment Banner')
    #
    # # Add banners to the session
    # db.session.add_all([hero_banner, equipment_banner])
    # db.session.commit()
    #
    # hero_items = [
    #     # Rare
    #     Item(name='Common Knight', rarity='rare', banner_id=hero_banner.id),
    #     Item(name='Foot Soldier', rarity='rare', banner_id=hero_banner.id),
    #     Item(name='Rookie Archer', rarity='rare', banner_id=hero_banner.id),
    #     Item(name='Apprentice Mage', rarity='rare', banner_id=hero_banner.id),
    #     Item(name='Novice Healer', rarity='rare', banner_id=hero_banner.id),
    #
    #     # Super Rare
    #     Item(name='Elite Knight', rarity='super rare', banner_id=hero_banner.id),
    #     Item(name='Veteran Archer', rarity='super rare', banner_id=hero_banner.id),
    #     Item(name='Master Mage', rarity='super rare', banner_id=hero_banner.id),
    #     Item(name='Battle Healer', rarity='super rare', banner_id=hero_banner.id),
    #     Item(name='Champion Swordsman', rarity='super rare', banner_id=hero_banner.id),
    #
    #     # Ultra Rare
    #     Item(name='Dragon Slayer', rarity='ultra rare', banner_id=hero_banner.id),
    #     Item(name='Archmage', rarity='ultra rare', banner_id=hero_banner.id),
    #     Item(name='Shadow Assassin', rarity='ultra rare', banner_id=hero_banner.id),
    #     Item(name='Divine Healer', rarity='ultra rare', banner_id=hero_banner.id),
    #     Item(name='Paladin of Light', rarity='ultra rare', banner_id=hero_banner.id)
    # ]
    #
    # # Equipment Banner Items
    # equipment_items = [
    #     # Rare
    #     Item(name='Iron Sword', rarity='rare', banner_id=equipment_banner.id),
    #     Item(name='Leather Armor', rarity='rare', banner_id=equipment_banner.id),
    #     Item(name='Wooden Shield', rarity='rare', banner_id=equipment_banner.id),
    #     Item(name='Simple Helm', rarity='rare', banner_id=equipment_banner.id),
    #     Item(name='Training Boots', rarity='rare', banner_id=equipment_banner.id),
    #
    #     # Super Rare
    #     Item(name='Silver Sword', rarity='super rare', banner_id=equipment_banner.id),
    #     Item(name='Steel Armor', rarity='super rare', banner_id=equipment_banner.id),
    #     Item(name='Reinforced Shield', rarity='super rare', banner_id=equipment_banner.id),
    #     Item(name='Battle Helm', rarity='super rare', banner_id=equipment_banner.id),
    #     Item(name='War Boots', rarity='super rare', banner_id=equipment_banner.id),
    #
    #     # Ultra Rare
    #     Item(name='Excalibur', rarity='ultra rare', banner_id=equipment_banner.id),
    #     Item(name='Dragon Scale Armor', rarity='ultra rare', banner_id=equipment_banner.id),
    #     Item(name='Aegis Shield', rarity='ultra rare', banner_id=equipment_banner.id),
    #     Item(name='Crown of Kings', rarity='ultra rare', banner_id=equipment_banner.id),
    #     Item(name='Boots of Speed', rarity='ultra rare', banner_id=equipment_banner.id)
    # ]
    #
    # db.session.add_all(hero_items + equipment_items)
    # db.session.commit()
    return jsonify({"status": "Gacha Service is running"}), 200


@app.route('/items', methods=['GET'])
# @cache
def get_items():
    """Retrieve available items and their rarities with caching."""
    cached_items = get_cached_data("cached-items")
    if cached_items:
        return jsonify({"cache": cached_items}), 200

    items = Item.query.all()
    result = [{"name": item.name, "rarity": item.rarity} for item in items]

    # Cache the result for future requests
    cache_data("cached-items", result)

    return jsonify(result), 200


RARITY_CHANCES = {
    'rare': 0.7,  # 70% chance
    'super rare': 0.25,  # 25% chance
    'ultra rare': 0.05  # 5% chance
}


@app.route('/chances', methods=['GET'])
# @cache
def get_rarity_chances():
    return jsonify(RARITY_CHANCES), 200


socketio = SocketIO(app)


@app.route('/gacha/banner/<int:banner_id>', methods=['GET'])
@jwt_required()
def banner_info(banner_id):
    # Assuming banners are pre-defined item pools
    items = Item.query.filter_by(banner_id=banner_id).all()
    return jsonify([{"id": item.id, "name": item.name, "rarity": item.rarity} for item in items])


ACCOUNT_SERVICE_URL = "http://localhost:5000"


# Function to check the user's current currency
def check_user_currency(user_id, required_amount, token):
    """Check user's currency balance from the Account Service."""
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.get(f"{ACCOUNT_SERVICE_URL}/currency", headers=headers)
    if response.status_code == 200:
        current_currency = response.json().get("currency")
        return current_currency >= required_amount
    else:
        return False


# Function to deduct currency after a successful pull
def deduct_currency(user_id, amount, token):
    """Send request to Account Service to deduct currency."""
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.post(f"{ACCOUNT_SERVICE_URL}/currency/deduct", json={"amount": amount}, headers=headers)
    if response.status_code != 200:
        raise Exception("Currency deduction failed")
    return response.json()


@socketio.on('pull', namespace='/gacha')
@jwt_required()
def handle_pull_items(data):
    user_id = data.get('user_id')
    banner_id = data.get('banner_id')

    # Check if the banner exists
    banner = Banner.query.get(banner_id)
    if not banner:
        send({'error': 'Invalid banner selected'})
        return

    # Fetch the user currency
    response = requests.get(f"{ACCOUNT_SERVICE_URL}/currency", headers={'Authorization': data['token']})
    currency = response.json().get('currency')

    # Check if the user has enough currency (1000 currency per pull)
    if currency < 1000:
        send({'error': 'Insufficient currency'})
        return

    # Deduce 1000 currency from the account
    requests.put(f"{ACCOUNT_SERVICE_URL}/deduce-currency", json={'amount': 1000},
                 headers={'Authorization': data['token']})

    # Get items grouped by rarity
    items_by_rarity = {
        'rare': [item for item in banner.items if item.rarity == 'rare'],
        'super rare': [item for item in banner.items if item.rarity == 'super rare'],
        'ultra rare': [item for item in banner.items if item.rarity == 'ultra rare']
    }

    # Pull 10 items based on rarity distribution
    pulled_items = []
    for _ in range(10):
        rarity = random.choices(list(RARITY_CHANCES.keys()), weights=RARITY_CHANCES.values(), k=1)[0]
        selected_item = random.choice(items_by_rarity[rarity])
        pulled_items.append(selected_item.name)

    # Record the pull in the gacha history
    gacha_history = GachaHistory(
        user_id=user_id,
        banner_id=banner_id,
        pulled_items=pulled_items
    )
    db.session.add(gacha_history)
    db.session.commit()

    # Send back the pulled items
    send({
        'message': 'Gacha pull successful',
        'items': pulled_items
    })


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001, debug=True, allow_unsafe_werkzeug=True)
