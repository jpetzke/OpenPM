#!/bin/sh
set -e
sh migrate.sh
arq app.tasks.worker.WorkerSettings &
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
