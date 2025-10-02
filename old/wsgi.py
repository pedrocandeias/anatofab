from app import create_app

# WSGI entrypoint
# - Gunicorn: use module "wsgi:app"
# - Apache mod_wsgi/Passenger: default variable name is "application"
app = create_app()
application = app
