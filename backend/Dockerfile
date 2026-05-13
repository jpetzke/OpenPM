FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libgit2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .
RUN chmod +x entrypoint.sh migrate.sh

ENTRYPOINT ["sh", "entrypoint.sh"]
