from fastapi import APIRouter

from app.api.v1 import (
    connector_templates,
    dev_tools,
    graph,
    hierarchy,
    instances,
    layouts,
    manufacturing,
    nets,
    projections,
    revisions,
    shorts,
    session,
    templates,
    topology,
    validation,
    vehicles,
)

api_router = APIRouter()
api_router.include_router(session.router)
api_router.include_router(dev_tools.router)
api_router.include_router(connector_templates.router)
api_router.include_router(vehicles.router)
api_router.include_router(templates.router)
api_router.include_router(revisions.router)
api_router.include_router(instances.router)
api_router.include_router(hierarchy.router)
api_router.include_router(topology.router)
api_router.include_router(nets.router)
api_router.include_router(shorts.router)
api_router.include_router(graph.router)
api_router.include_router(projections.router)
api_router.include_router(validation.router)
api_router.include_router(manufacturing.router)
api_router.include_router(layouts.router)
