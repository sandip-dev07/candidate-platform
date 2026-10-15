from routes.candidates import router as candidates_router
from routes.messages import router as messages_router
from routes.provider import router as provider_router
from routes.templates import router as templates_router
from routes.webhooks import router as webhooks_router

__all__ = [
    "candidates_router",
    "messages_router",
    "provider_router",
    "templates_router",
    "webhooks_router",
]
