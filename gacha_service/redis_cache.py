import redis
import json

# Connect to Redis
cache = redis.StrictRedis(host='localhost', port=6379, decode_responses=True)


def cache_data(key, data, expiration=60):
    """Cache data with an expiration time (default 60 seconds)."""
    cache.set(key, json.dumps(data), ex=expiration)


def get_cached_data(key):
    """Retrieve cached data by key."""
    cached = cache.get(key)
    return json.loads(cached) if cached else None
