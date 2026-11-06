import os


# instancer.core.config reads these at import time
os.environ.setdefault('AUTH_TOKEN', 'test-token')
os.environ.setdefault('INSTANCES_HOST', 'instances.example.com')
os.environ.setdefault('REDIS_PASSWORD', 'test')
