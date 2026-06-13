from fastapi import APIRouter, Depends

from app.api.v1 import (
    admin,
    auth,
    connections,
    realtime,
    connector_templates,
    graph,
    hierarchy,
    instances,
    layouts,
    manufacturing,
    nets,
    pin_names,
    pin_templates,
    projections,
    revisions,
    shorts,
    templates,
    topology,
    validation,
    vehicles,
)
from app.core.auth_context import get_current_user

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(realtime.router)

protected_router = APIRouter(dependencies=[Depends(get_current_user)])
protected_router.include_router(admin.router)
protected_router.include_router(connector_templates.router)
protected_router.include_router(vehicles.router)
protected_router.include_router(templates.router)
protected_router.include_router(revisions.router)
protected_router.include_router(instances.router)
protected_router.include_router(hierarchy.router)
protected_router.include_router(topology.router)
protected_router.include_router(nets.router)
protected_router.include_router(pin_names.router)
protected_router.include_router(pin_templates.router)
protected_router.include_router(connections.router)
protected_router.include_router(shorts.router)
protected_router.include_router(graph.router)
protected_router.include_router(projections.router)
protected_router.include_router(validation.router)
protected_router.include_router(manufacturing.router)
protected_router.include_router(layouts.router)

api_router.include_router(protected_router)
