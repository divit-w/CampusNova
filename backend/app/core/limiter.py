from slowapi import Limiter
from slowapi.util import get_remote_address

# Single shared limiter instance.
# Imported by app/main.py (to register state & handler) and by endpoints (to apply @limiter.limit).
limiter = Limiter(key_func=get_remote_address)
