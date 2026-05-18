from __future__ import annotations

from typing import Any, Literal, TypedDict


ConnparseKind = Literal[
    "database",
    "object_storage",
    "file",
    "stream",
    "cache",
    "analytics",
    "api",
    "unknown",
]

QueryParameterKind = Literal["string", "boolean", "number"]


class ConnparseRule(TypedDict, total=False):
    type: str
    required: bool


class ConnparseQueryParameter(TypedDict, total=False):
    type: QueryParameterKind
    allowed: list[str | int | float | bool]


class ConnparsePortRange(TypedDict, total=False):
    min: int
    max: int


class ConnparseValidation(TypedDict, total=False):
    require_host: bool
    port_range: ConnparsePortRange


class ConnparseRedaction(TypedDict, total=False):
    safe_credentials: list[str]
    sensitive_keys: list[str]


class ConnparseDefinition(TypedDict, total=False):
    id: str
    name: str
    type: ConnparseKind
    schemes: list[str]
    adapter: str
    defaults: dict[str, Any]
    authority: dict[str, Any]
    resource: ConnparseRule
    path: ConnparseRule
    credentials: dict[str, bool]
    query_parameters: dict[str, ConnparseQueryParameter]
    validation: ConnparseValidation
    options: dict[str, Any]
    redaction: ConnparseRedaction
