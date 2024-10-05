import redis
import json

# Connect to Redis
cache = redis.StrictRedis(host='redis', port=6379, decode_responses=True)

def cache_data(key, data, expiration=60):
    """Cache data with an expiration time."""
    cache.set(key, json.dumps(data), ex=expiration)

def get_cached_data(key):
    """Retrieve cached data from Redis."""
    cached = cache.get(key)
    return json.loads(cached) if cached else None

def delete_cache(key):
    """Delete cache for a specific key."""
    cache.delete(key)
