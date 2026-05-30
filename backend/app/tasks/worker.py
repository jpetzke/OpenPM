from arq.connections import RedisSettings
from arq.cron import cron

from app.config import settings
from app.tasks.pipeline import (
    close_idle_change_sessions,
    mark_stale_deadlines,
    process_document,
)


class WorkerSettings:
    functions = [process_document, close_idle_change_sessions, mark_stale_deadlines]
    cron_jobs = [
        cron(close_idle_change_sessions, second=0),
        cron(mark_stale_deadlines, hour=6, minute=0),
    ]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = settings.arq_max_jobs
    job_timeout = 300
    keep_result = 300
    retry_jobs = True
    max_tries = 3
