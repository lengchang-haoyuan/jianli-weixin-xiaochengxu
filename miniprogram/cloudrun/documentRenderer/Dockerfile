FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-noto-cjk \
        libreoffice-writer \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /tmp --shell /usr/sbin/nologin appuser

WORKDIR /app
COPY renderer.py server.py templates.py ./

USER appuser
EXPOSE 8080
CMD ["python", "-u", "server.py"]

