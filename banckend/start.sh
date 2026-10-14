#!/usr/bin/env bash
# Comando de inicialização na Railway
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Cria o login da dona na primeira vez (usa as variáveis DJANGO_SUPERUSER_*).
# Se ele já existir, o erro é ignorado.
python manage.py createsuperuser --noinput || true

exec gunicorn core.wsgi --bind 0.0.0.0:${PORT:-8000} --workers 2