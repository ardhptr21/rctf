# Logging TCP proxy the instancer puts in front of tcp-ssl exposes.
# Build from the repository root:
#   docker build -t tiny-instancer-tcplog:latest apps/docker-instancer/tcplog
FROM python:3.13-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY tcplog.py /app/tcplog.py

USER 65534:65534
ENTRYPOINT ["python3", "/app/tcplog.py"]
