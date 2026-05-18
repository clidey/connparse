from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl, quote, unquote, urlsplit

from .builtin_definitions import BUILT_IN_DEFINITIONS
from .types import ConnparseDefinition

__all__ = [
    "ConnparseDefinition",
    "canonicalize",
    "equivalent",
    "get_built_in_definitions",
    "mask",
    "normalize_address",
    "parse",
    "parse_normalize",
    "parse_or_throw",
    "sanitize",
]


@dataclass
class _Parts:
    scheme: str
    username: str
    password: str
    host: str
    port: int | None
    hosts: list[dict[str, Any]]
    pathname: str
    path_segments: list[str]
    query: dict[str, Any]
    fragment: str | None


def parse(input: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    if not isinstance(input, str):
        return _fail("INVALID_INPUT_TYPE", "Connparse input must be a string", "raw")
    if not input.strip():
        return _fail("EMPTY_INPUT", "Connparse input cannot be empty", "raw")

    registry = _Registry(get_built_in_definitions() + copy.deepcopy(options.get("definitions", [])))
    scheme, definition = _infer_definition(input, registry, options)
    if not scheme:
        return _fail("MISSING_SCHEME", "Input must include a scheme or look like a file path", "scheme")
    if not definition:
        return _parse_unknown(input, scheme, bool(options.get("strict")))

    adapter = definition.get("adapter") or "generic-uri"
    context = {"raw": input, "safe": mask(input, definition)}
    try:
        value = _ADAPTERS[adapter](input, definition, context)
    except KeyError:
        return _fail("UNKNOWN_ADAPTER", f"{definition.get('id')} references missing adapter {adapter}", "adapter")
    except Exception as error:
        return _fail("PARSE_FAILED", str(error), "raw")

    validation = _validate_address(value, definition, options)
    return _ok(value, validation["errors"], validation["warnings"])


def parse_or_throw(input: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    result = parse(input, options)
    if result["ok"]:
        return result["value"]
    raise ValueError("; ".join(error["message"] for error in result["errors"]) or "Connparse failed")


def canonicalize(input: str | dict[str, Any], options: dict[str, Any] | None = None) -> str:
    options = options or {}
    address = parse_or_throw(input, options) if isinstance(input, str) else input
    definition = _definition_for(address, options)
    scheme = _canonical_scheme(address, definition)
    authority = _canonical_authority(address, definition, options)
    path = _canonical_path(address)
    query = _canonical_query(address, definition, options)
    fragment = _canonical_fragment(address, options)
    if scheme == "file" and not authority:
        return f"file://{path}{query}{fragment}" if path.startswith("/") else f"file:{path}{query}{fragment}"
    if not authority:
        return f"{scheme}:{path}{query}{fragment}"
    return f"{scheme}://{_canonical_userinfo(address, options)}{authority}{path}{query}{fragment}"


def equivalent(left: str | dict[str, Any], right: str | dict[str, Any], options: dict[str, Any] | None = None) -> bool:
    return canonicalize(left, options) == canonicalize(right, options)


def normalize_address(address: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    definition = _definition_for(address, options)
    canonical = options.get("canonical") or canonicalize(address, options)
    return {
        "scheme": _canonical_scheme(address, definition),
        "type": address.get("type", "unknown"),
        "authority": _normalized_authority(address, definition, options),
        "resource": {
            "type": (address.get("resource") or {}).get("type") or "none",
            "name": (address.get("resource") or {}).get("name"),
        },
        "path": address.get("path") or "",
        "query": _normalized_query(address, definition, options),
        "fragment": None if options.get("includeFragment") is False else address.get("fragment"),
        "credentials": _normalized_credentials(address, options),
        "options": {key: (address.get("options") or {})[key] for key in sorted(address.get("options") or {})},
        "raw": canonical,
        "safe": canonical,
        "canonical": canonical,
    }


def parse_normalize(input: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    result = parse(input, options)
    if not result["ok"]:
        return result
    return {**result, "value": normalize_address(result["value"], options)}


def get_built_in_definitions() -> list[ConnparseDefinition]:
    return copy.deepcopy(BUILT_IN_DEFINITIONS)


def mask(input: str, definition: dict[str, Any] | None = None) -> str:
    return _mask_sensitive_key_values(_mask_sensitive_query(_mask_userinfo(str(input)), definition), definition)


def sanitize(address: dict[str, Any], definition: dict[str, Any] | None = None) -> dict[str, Any]:
    output = copy.deepcopy(address)
    output["credentials"] = _sanitize_credentials(output.get("credentials"), definition)
    output["query"] = _sanitize_object(output.get("query"), definition)
    output["options"] = _sanitize_object(output.get("options"), definition)
    output["raw"] = output.get("safe") or ""
    return output


def _ok(value: dict[str, Any], errors: list[dict[str, Any]] | None = None, warnings: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    errors = errors or []
    warnings = warnings or []
    return {"ok": not errors, "value": None if errors else value, "errors": errors, "warnings": warnings}


def _fail(code: str, message: str, path: str = "") -> dict[str, Any]:
    return {"ok": False, "value": None, "errors": [_diagnostic(code, message, path)], "warnings": []}


def _diagnostic(code: str, message: str, path: str = "") -> dict[str, Any]:
    item = {"code": code, "message": message}
    if path:
        item["path"] = path
    return item


class _Registry:
    def __init__(self, definitions: list[dict[str, Any]]) -> None:
        self.by_id: dict[str, dict[str, Any]] = {}
        self.by_scheme: dict[str, dict[str, Any]] = {}
        for definition in definitions:
            copied = copy.deepcopy(definition)
            self.by_id[copied["id"]] = copied
            for scheme in copied.get("schemes") or []:
                self.by_scheme[str(scheme).lower()] = copied

    def get_by_id(self, id: str) -> dict[str, Any] | None:
        return self.by_id.get(id)

    def get_by_scheme(self, scheme: str) -> dict[str, Any] | None:
        return self.by_scheme.get(str(scheme or "").lower())


def _infer_definition(raw: str, registry: _Registry, options: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    if options.get("provider"):
        provider = str(options["provider"]).lower()
        return provider, registry.get_by_id(provider) or registry.get_by_scheme(provider)
    if _is_clickhouse_jdbc(raw):
        return "jdbc:clickhouse", registry.get_by_scheme("clickhouse")
    if re.match(r"^jdbc:postgresql://", raw, re.I):
        return "jdbc:postgresql", registry.get_by_scheme("postgres")
    if re.match(r"^jdbc:mysql://", raw, re.I):
        return "jdbc:mysql", registry.get_by_scheme("mysql")
    if re.match(r"^jdbc:mariadb(?::[a-z-]+)?://", raw, re.I):
        return "jdbc:mariadb", registry.get_by_scheme("mariadb")
    if _is_questdb_config(raw):
        return "questdb", registry.get_by_scheme("questdb")
    if _looks_like_duckdb_path(raw):
        return "duckdb", registry.get_by_scheme("duckdb")
    if _is_s3_http_url(raw):
        return "s3", registry.get_by_scheme("s3")
    scheme = _extract_scheme(raw)
    if not scheme and _looks_like_file_path(raw):
        return "file", registry.get_by_scheme("file")
    if not scheme:
        return None, None
    return scheme, registry.get_by_scheme(scheme)


def _parse_unknown(raw: str, scheme: str, strict: bool) -> dict[str, Any]:
    warning = _diagnostic("UNKNOWN_SCHEME", f"{scheme} does not have a registered Connparse definition", "scheme")
    if strict:
        return _fail(warning["code"], warning["message"], warning["path"])
    parsed = urlsplit(raw)
    value = _base_address(
        {"type": "unknown"},
        scheme,
        raw,
        mask(raw),
        {"host": parsed.hostname or "", "port": parsed.port},
        {"type": "unknown", "name": _split_path(parsed.path)[0] if _split_path(parsed.path) else None},
        _safe_decode(parsed.path or ""),
        _parse_query(parsed.query),
        _safe_decode(parsed.fragment) if parsed.fragment else None,
        {},
        {},
    )
    return _ok(value, [], [warning])


def _extract_scheme(input: str) -> str | None:
    match = re.match(r"^([A-Za-z][A-Za-z0-9+.-]*):", str(input))
    return match.group(1).lower() if match else None


def _parse_host_port(value: str) -> dict[str, Any]:
    if not value:
        return {"host": "", "port": None}
    if value.startswith("["):
        close = value.find("]")
        if close != -1:
            rest = value[close + 1 :]
            return {"host": value[1:close], "port": int(rest[1:]) if rest.startswith(":") and rest[1:] else None}
    colon = value.rfind(":")
    if colon > -1 and value.find(":") == colon and re.match(r"^\d+$", value[colon + 1 :]):
        return {"host": value[:colon], "port": int(value[colon + 1 :])}
    return {"host": value, "port": None}


def _parse_hierarchical(input: str) -> _Parts:
    match = re.match(r"^([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$", str(input))
    if not match:
        return _from_url(input)
    scheme, authority_text, pathname, search, fragment = match.groups()
    pathname = pathname or ""
    search = search or ""
    at = authority_text.rfind("@")
    user_info = "" if at == -1 else authority_text[:at]
    host_text = authority_text if at == -1 else authority_text[at + 1 :]
    user_parts = user_info.split(":")
    raw_username = user_parts[0] if user_parts else ""
    raw_password = ":".join(user_parts[1:])
    hosts = [_parse_host_port(part) for part in host_text.split(",") if part]
    return _Parts(
        scheme=scheme.lower(),
        username=_safe_decode(raw_username) if user_info else "",
        password=_safe_decode(raw_password) if len(user_parts) > 1 else "",
        host=hosts[0]["host"] if hosts else "",
        port=hosts[0]["port"] if hosts else None,
        hosts=hosts,
        pathname=pathname,
        path_segments=_split_path(pathname),
        query=_parse_query(search),
        fragment=None if fragment is None else _safe_decode(fragment),
    )


def _from_url(input: str) -> _Parts:
    parsed = urlsplit(input)
    host = parsed.hostname or ""
    port = parsed.port
    return _Parts(
        scheme=parsed.scheme.lower(),
        username=_safe_decode(parsed.username or ""),
        password=_safe_decode(parsed.password or ""),
        host=host,
        port=port,
        hosts=[{"host": host, "port": port}],
        pathname=parsed.path,
        path_segments=_split_path(parsed.path),
        query=_parse_query(parsed.query),
        fragment=_safe_decode(parsed.fragment) if parsed.fragment else None,
    )


def _parse_query(search: str) -> dict[str, Any]:
    query: dict[str, Any] = {}
    for key, value in parse_qsl(search[1:] if search.startswith("?") else search, keep_blank_values=True):
        if key in query:
            current = query[key]
            query[key] = current + [value] if isinstance(current, list) else [current, value]
        else:
            query[key] = value
    return query


def _safe_decode(value: str) -> str:
    try:
        return unquote(value)
    except Exception:
        return value


def _split_path(pathname: str) -> list[str]:
    text = pathname[1:] if pathname.startswith("/") else pathname
    return [_safe_decode(part) for part in text.split("/")] if text else []


def _basename(pathname: str) -> str | None:
    parts = [part for part in str(pathname or "").split("/") if part]
    return parts[-1] if parts else pathname


def _looks_like_file_path(input: str) -> bool:
    return input.startswith(("/", "./", "../", "~/")) or bool(re.match(r"^[A-Za-z]:[\\/]", input))


def _looks_like_duckdb_path(input: str) -> bool:
    return bool(re.search(r"\.(duckdb|ddb)([?#].*)?$", str(input), re.I))


def _credentials_from_parts(parts: _Parts) -> dict[str, str]:
    credentials = {}
    if parts.username:
        credentials["username"] = parts.username
    if parts.password:
        credentials["password"] = parts.password
    return credentials


def _apply_default_port(authority: dict[str, Any], defaults: dict[str, Any] | None = None) -> dict[str, Any]:
    defaults = defaults or {}
    if not defaults.get("port"):
        return authority
    if authority.get("port") is None and authority.get("host"):
        authority["port"] = defaults["port"]
    if isinstance(authority.get("hosts"), list):
        authority["hosts"] = [{**entry, "port": defaults["port"] if entry.get("port") is None else entry.get("port")} for entry in authority["hosts"]]
    return authority


def _authority_from_parts(parts: _Parts, defaults: dict[str, Any] | None = None, omit_ports: bool = False) -> dict[str, Any]:
    if len(parts.hosts) > 1:
        authority = {"hosts": [{"host": entry["host"], "port": None} for entry in parts.hosts] if omit_ports else copy.deepcopy(parts.hosts)}
        return _apply_default_port(authority, {} if omit_ports else defaults)
    authority = {"host": parts.host, "port": None if omit_ports else parts.port}
    return _apply_default_port(authority, {} if omit_ports else defaults)


def _base_address(
    definition: dict[str, Any],
    scheme: str,
    raw: str,
    safe: str,
    authority: dict[str, Any] | None = None,
    resource: dict[str, Any] | None = None,
    path: str = "",
    query: dict[str, Any] | None = None,
    fragment: str | None = None,
    credentials: dict[str, str] | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    merged_options = dict(definition.get("options") or {})
    merged_options.update(options or {})
    return {
        "scheme": scheme,
        "type": definition.get("type") or "unknown",
        "authority": authority or {},
        "resource": resource or {"type": "none", "name": None},
        "path": path or "",
        "query": query or {},
        "fragment": fragment if fragment is not None else None,
        "credentials": credentials or {},
        "options": merged_options,
        "raw": raw,
        "safe": safe,
    }


def _parse_generic_uri(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    parts = _parse_hierarchical(input)
    resource_name = parts.path_segments[0] if parts.path_segments else None
    rest = parts.path_segments[1:]
    return _base_address(
        definition,
        parts.scheme,
        context["raw"],
        context["safe"],
        _authority_from_parts(parts, definition.get("defaults")),
        {"type": (definition.get("resource") or {}).get("type") or "resource", "name": resource_name},
        "/".join(rest),
        parts.query,
        parts.fragment,
        _credentials_from_parts(parts),
        {},
    )


def _parse_jdbc(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    match = re.match(r"^jdbc:([a-z]+)(?::([a-z-]+))?://", input, re.I)
    if not match:
        raise ValueError("Invalid JDBC URL")
    provider = match.group(1).lower()
    mode_or_protocol = (match.group(2) or "").lower()
    rest = input[match.end() :]
    protocol = mode_or_protocol
    mode = ""
    if provider == "mariadb" and protocol in {"replication", "loadbalance", "sequential", "load-balance-read"}:
        mode = protocol
        protocol = ""
    parse_scheme = "clickhouse" if provider == "ch" else provider
    parts = _parse_hierarchical(f"{parse_scheme}://{rest}")
    database = parts.path_segments[0] if parts.path_segments else None
    path_rest = parts.path_segments[1:]
    default_port = _jdbc_default_port(provider, protocol, definition.get("defaults") or {})
    hosts = [{"host": entry["host"], "port": default_port if entry.get("port") is None and default_port else entry.get("port")} for entry in parts.hosts]
    authority = {"hosts": hosts} if len(hosts) > 1 else {"host": hosts[0]["host"] if hosts else "", "port": hosts[0]["port"] if hosts else None}
    options = {"jdbc": True}
    if protocol:
        options["protocol"] = protocol
    if mode:
        options["mode"] = mode
    return _base_address(
        definition,
        f"jdbc:{'ch' if provider == 'ch' else provider}",
        context["raw"],
        context["safe"],
        authority,
        {"type": (definition.get("resource") or {}).get("type") or "database", "name": database},
        "/".join(path_rest),
        parts.query,
        parts.fragment,
        _credentials_from_parts(parts),
        options,
    )


def _jdbc_default_port(provider: str, protocol: str, defaults: dict[str, Any]) -> int | None:
    if provider in {"clickhouse", "ch"}:
        if protocol == "https":
            return 8443
        if protocol == "grpc":
            return 9100
        return defaults.get("port") or 8123
    return defaults.get("port")


def _parse_mysql_compatible(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    if re.match(r"^jdbc:(mysql|mariadb)(?::[a-z-]+)?://", input, re.I):
        return _parse_jdbc(input, definition, context)
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", input):
        return _parse_generic_uri(input, definition, context)
    return _parse_generic_uri(f"{(definition.get('schemes') or ['mysql'])[0]}://{input}", definition, context)


def _split_conninfo(input: str) -> dict[str, str]:
    pairs = []
    text = input.strip()
    index = 0
    while index < len(text):
        while index < len(text) and text[index].isspace():
            index += 1
        key = ""
        while index < len(text) and text[index] != "=":
            key += text[index]
            index += 1
        if not key or index >= len(text) or text[index] != "=":
            break
        index += 1
        value = ""
        if index < len(text) and text[index] == "'":
            index += 1
            while index < len(text):
                if text[index] == "\\" and index + 1 < len(text):
                    value += text[index + 1]
                    index += 2
                    continue
                if text[index] == "'":
                    index += 1
                    break
                value += text[index]
                index += 1
        else:
            while index < len(text) and not text[index].isspace():
                value += text[index]
                index += 1
        pairs.append((key.strip(), value))
    return {key: value for key, value in pairs if key}


def _parse_host_lists(host_value: str, port_value: str, defaults: dict[str, Any] | None = None) -> dict[str, Any]:
    defaults = defaults or {}
    hosts = [host.strip() for host in str(host_value or "").split(",") if host.strip()]
    ports = [port.strip() for port in str(port_value or "").split(",")]
    if len(hosts) > 1:
        return {"hosts": [{"host": host, "port": int(ports[index]) if index < len(ports) and ports[index] else defaults.get("port")} for index, host in enumerate(hosts)]}
    parsed = _parse_host_port(hosts[0] if hosts else "")
    return {"host": parsed["host"], "port": parsed["port"] if parsed["port"] is not None else (int(ports[0]) if ports and ports[0] else defaults.get("port"))}


def _parse_postgres_compatible(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    if re.match(r"^jdbc:postgresql://", input, re.I):
        return _parse_jdbc(input, definition, context)
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", input):
        parts = _parse_hierarchical(input)
        database = parts.path_segments[0] if parts.path_segments else None
        return _base_address(
            definition,
            parts.scheme,
            context["raw"],
            context["safe"],
            _authority_from_parts(parts, definition.get("defaults")),
            {"type": (definition.get("resource") or {}).get("type") or "database", "name": database},
            "/".join(parts.path_segments[1:]),
            parts.query,
            parts.fragment,
            _credentials_from_parts(parts),
            definition.get("options") or {},
        )
    fields = _split_conninfo(input)
    credentials = {}
    if fields.get("user"):
        credentials["username"] = fields["user"]
    if fields.get("password"):
        credentials["password"] = fields["password"]
    query = dict(fields)
    for key in ["host", "hostaddr", "port", "dbname", "user", "password"]:
        query.pop(key, None)
    return _base_address(
        definition,
        (definition.get("schemes") or ["postgres"])[0],
        context["raw"],
        context["safe"],
        _parse_host_lists(fields.get("host") or fields.get("hostaddr") or "", fields.get("port") or "", definition.get("defaults")),
        {"type": (definition.get("resource") or {}).get("type") or "database", "name": fields.get("dbname")},
        "",
        query,
        None,
        credentials,
        {"conninfo": True},
    )


def _parse_mongodb(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    parts = _parse_hierarchical(input)
    database = parts.path_segments[0] if parts.path_segments else None
    srv = parts.scheme.endswith("+srv")
    return _base_address(
        definition,
        parts.scheme,
        context["raw"],
        context["safe"],
        _authority_from_parts(parts, definition.get("defaults"), omit_ports=srv),
        {"type": (definition.get("resource") or {}).get("type") or "database", "name": database},
        "/".join(parts.path_segments[1:]),
        parts.query,
        parts.fragment,
        _credentials_from_parts(parts),
        {"srv": srv},
    )


def _parse_redis_uri(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    parts = _parse_hierarchical(input)
    database = parts.path_segments[0] if parts.path_segments else None
    return _base_address(
        definition,
        parts.scheme,
        context["raw"],
        context["safe"],
        _apply_default_port({"host": parts.host, "port": parts.port}, definition.get("defaults")),
        {"type": (definition.get("resource") or {}).get("type") or "database_index", "name": database},
        "",
        parts.query,
        parts.fragment,
        _credentials_from_parts(parts),
        {"tls": parts.scheme in {"rediss", "valkeys", "dragonflys", "elasticaches", "memorydbs", "azure-managed-rediss"} or (definition.get("options") or {}).get("tls") is True},
    )


def _parse_redis(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", input):
        return _parse_redis_uri(input, definition, context)
    endpoints = []
    options: dict[str, Any] = {}
    credentials = {}
    for entry in [part.strip() for part in input.split(",") if part.strip()]:
        if "=" not in entry:
            parsed = _parse_host_port(entry)
            endpoints.append({"host": parsed["host"], "port": parsed["port"] or (definition.get("defaults") or {}).get("port") or 6379})
            continue
        key, value = entry.split("=", 1)
        if key.lower() == "password":
            credentials["password"] = value
        elif key.lower() in {"user", "username"}:
            credentials["username"] = value
        else:
            options[key] = value
    database = options.pop("defaultDatabase", None) or options.pop("defaultdatabase", None)
    return _base_address(
        definition,
        "redis",
        context["raw"],
        context["safe"],
        {"hosts": endpoints} if len(endpoints) > 1 else {"host": endpoints[0]["host"] if endpoints else "", "port": endpoints[0]["port"] if endpoints else 6379},
        {"type": (definition.get("resource") or {}).get("type") or "database_index", "name": database},
        "",
        {},
        None,
        credentials,
        {**options, "tls": str(options.get("ssl") or options.get("tls") or "").lower() == "true" or (definition.get("options") or {}).get("tls") is True},
    )


def _parse_object_storage(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    parts = _parse_hierarchical(input)
    segments = list(parts.path_segments)
    resource_type = (definition.get("resource") or {}).get("type") or "container"
    authority: dict[str, Any] = {}
    resource_name = None
    path = ""
    credentials = _credentials_from_parts(parts)

    if parts.scheme == "gs" or (parts.scheme == "gcs" and parts.host != "storage.googleapis.com"):
        resource_name = parts.host
        path = "/".join(segments)
        authority["bucket"] = resource_name
    elif parts.scheme in {"gcs", "https"} and parts.host == "storage.googleapis.com":
        resource_name = segments.pop(0) if segments else None
        path = "/".join(segments)
        authority["bucket"] = resource_name or ""
    elif parts.scheme in {"abfs", "abfss"}:
        resource_name = parts.username or None
        path = "/".join(segments)
        authority["host"] = parts.host
        authority["account"] = _account_from_host(parts.host)
        credentials = {}
    else:
        resource_name = segments.pop(0) if segments else None
        path = "/".join(segments)
        authority["host"] = parts.host
        authority["account"] = _account_from_host(parts.host)

    project = parts.query.get("project") or parts.query.get("project_id") or parts.query.get("projectId")
    if project:
        authority["project"] = str(project)

    return _base_address(
        definition,
        parts.scheme,
        context["raw"],
        context["safe"],
        authority,
        {"type": resource_type, "name": resource_name},
        path,
        parts.query,
        parts.fragment,
        credentials,
        {"source_scheme": parts.scheme, "tls": parts.scheme in {"https", "abfss"}},
    )


def _account_from_host(host: str) -> str:
    return str(host or "").split(".")[0]


def _parse_file(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    path = input
    fragment = None
    query = {}
    authority = {}
    if re.match(r"^file:", input, re.I):
        parts = _from_url(input)
        path = _safe_decode(parts.pathname)
        fragment = parts.fragment
        query = parts.query
        if parts.host:
            authority["host"] = parts.host
    else:
        path, fragment, query = _strip_file_meta(path)
    return _base_address(definition, "file", context["raw"], context["safe"], authority, {"type": "none", "name": None}, path, query, fragment, {}, {})


def _strip_file_meta(path: str) -> tuple[str, str | None, dict[str, Any]]:
    fragment = None
    query = {}
    if "#" in path:
        path, fragment = path.split("#", 1)
        fragment = _safe_decode(fragment)
    if "?" in path:
        path, search = path.split("?", 1)
        query = _parse_query(search)
    return path, fragment, query


def _parse_sqlite(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    path = ""
    query = {}
    fragment = None
    options = {}
    if input in {"sqlite::memory:", "sqlite:///:memory:"}:
        path = ":memory:"
        options = {"memory": True}
    elif re.match(r"^(sqlite|file):", input, re.I) and not re.match(r"^sqlite::memory:$", input, re.I):
        source = re.sub(r"^sqlite:file:", "file:", input, flags=re.I)
        if re.match(r"^file:[^/]", source, re.I):
            body, fragment, query = _strip_file_meta(re.sub(r"^file:", "", source, flags=re.I))
            path = body
        else:
            parts = _from_url(source)
            path = _safe_decode(parts.pathname)
            query = parts.query
            fragment = parts.fragment
    else:
        body, fragment, _ = _strip_file_meta(re.sub(r"^sqlite:", "", input, flags=re.I))
        path = body
    return _base_address(definition, "sqlite", context["raw"], context["safe"], {}, {"type": (definition.get("resource") or {}).get("type") or "database", "name": path or _basename(path)}, path, query, fragment, {}, options)


def _parse_duckdb(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    path = ""
    query = {}
    fragment = None
    options = {}
    if input in {"duckdb::memory:", ":memory:"}:
        path = ":memory:"
        options = {"memory": True}
    elif re.match(r"^duckdb://", input, re.I):
        parts = _from_url(input)
        path = _safe_decode(parts.pathname)
        query = parts.query
        fragment = parts.fragment
    else:
        path, fragment, query = _strip_file_meta(re.sub(r"^duckdb:", "", input, flags=re.I))
    return _base_address(definition, "duckdb", context["raw"], context["safe"], {}, {"type": (definition.get("resource") or {}).get("type") or "database", "name": path or _basename(path)}, path, query, fragment, {}, options)


def _is_clickhouse_jdbc(input: str) -> bool:
    return bool(re.match(r"^jdbc:(clickhouse|ch)(?::[a-z]+)?://", input, re.I))


def _parse_clickhouse(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    if _is_clickhouse_jdbc(input):
        return _parse_jdbc(input, definition, context)
    source = input if re.match(r"^https?://", input, re.I) else re.sub(r"^clickhouse:", "clickhouse:", input, flags=re.I)
    parts = _parse_hierarchical(source)
    database = parts.path_segments[0] if parts.path_segments else None
    protocol = parts.scheme if parts.scheme in {"http", "https"} else "native"
    port = parts.port if parts.port is not None else _clickhouse_default_port(protocol, definition.get("defaults") or {})
    return _base_address(definition, "clickhouse" if parts.scheme == "ch" else parts.scheme, context["raw"], context["safe"], {"host": parts.host, "port": port}, {"type": "database", "name": database}, "/".join(parts.path_segments[1:]), parts.query, parts.fragment, _credentials_from_parts(parts), {"protocol": protocol})


def _clickhouse_default_port(protocol: str, defaults: dict[str, Any]) -> int:
    if protocol == "https":
        return 8443
    if protocol == "http":
        return 8123
    if protocol == "grpc":
        return 9100
    return defaults.get("port") or 9000


def _parse_memcached(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    hosts = []
    credentials = {}
    query = {}
    tls = False
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", input):
        parts = _parse_hierarchical(input)
        hosts = [{"host": entry["host"], "port": entry["port"] or (definition.get("defaults") or {}).get("port") or 11211} for entry in parts.hosts]
        credentials = _credentials_from_parts(parts)
        query = parts.query
        tls = parts.scheme == "memcacheds"
    else:
        for part in [item.strip() for item in input.split(",") if item.strip()]:
            parsed = _parse_host_port(part)
            hosts.append({"host": parsed["host"], "port": parsed["port"] or (definition.get("defaults") or {}).get("port") or 11211})
    return _base_address(definition, "memcached", context["raw"], context["safe"], {"hosts": hosts} if len(hosts) > 1 else {"host": hosts[0]["host"] if hosts else "", "port": hosts[0]["port"] if hosts else 11211}, {"type": "none", "name": None}, "", query, None, credentials, {"tls": tls})


def _parse_elasticsearch(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    source = input
    source = re.sub(r"^elasticsearch\+https", "https", source, flags=re.I)
    source = re.sub(r"^elasticsearch\+http", "http", source, flags=re.I)
    source = re.sub(r"^elasticsearch://", "http://", source, flags=re.I)
    source = re.sub(r"^elastic://", "http://", source, flags=re.I)
    parts = _parse_hierarchical(source)
    index = parts.path_segments[0] if parts.path_segments else None
    credentials = _credentials_from_parts(parts)
    for key in ["api_key", "apiKey", "token"]:
        if parts.query.get(key):
            credentials["api_key" if key == "apiKey" else key] = str(parts.query[key])
    return _base_address(definition, "elasticsearch", context["raw"], context["safe"], {"host": parts.host, "port": parts.port or (definition.get("defaults") or {}).get("port") or 9200}, {"type": "index", "name": index}, "/".join(parts.path_segments[1:]), parts.query, parts.fragment, credentials, {"protocol": parts.scheme, "tls": parts.scheme == "https"})


def _is_questdb_config(input: str) -> bool:
    return bool(re.match(r"^(http|https|tcp|tcps)::", input, re.I))


def _parse_questdb(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    if _is_questdb_config(input):
        protocol, body = input.split("::", 1)
        entries = []
        for part in [item.strip() for item in body.split(";") if item.strip()]:
            key, _, value = part.partition("=")
            entries.append((key, value))
        grouped: dict[str, Any] = {}
        for key, value in entries:
            if key in grouped:
                grouped[key] = grouped[key] + [value] if isinstance(grouped[key], list) else [grouped[key], value]
            else:
                grouped[key] = value
        default_port = 9000 if protocol in {"http", "https"} else 9009
        addrs = grouped.get("addr") if isinstance(grouped.get("addr"), list) else ([grouped["addr"]] if grouped.get("addr") else [])
        hosts = []
        for addr in addrs:
            parsed = _parse_host_port(addr)
            hosts.append({"host": parsed["host"], "port": parsed["port"] or default_port})
        query = dict(grouped)
        query.pop("addr", None)
        credentials = {}
        for key in ["username", "password", "token"]:
            if query.get(key):
                credentials[key] = str(query[key])
                query.pop(key, None)
        return _base_address(definition, "questdb", context["raw"], context["safe"], {"hosts": hosts} if len(hosts) > 1 else {"host": hosts[0]["host"] if hosts else "", "port": hosts[0]["port"] if hosts else default_port}, {"type": "endpoint", "name": None}, "", query, None, credentials, {"ingestion": True, "protocol": protocol, "tls": protocol in {"https", "tcps"}})
    parts = _parse_hierarchical(input)
    database = parts.path_segments[0] if parts.path_segments else None
    return _base_address(definition, parts.scheme, context["raw"], context["safe"], {"host": parts.host, "port": parts.port or (definition.get("defaults") or {}).get("port") or 8812}, {"type": "database", "name": database}, "/".join(parts.path_segments[1:]), parts.query, parts.fragment, _credentials_from_parts(parts), {"compatible_with": "postgres"})


def _parse_s3_host(host: str) -> dict[str, str]:
    virtual = re.match(r"^(.+)\.s3(?:[.-]([a-z0-9-]+))?\.amazonaws\.com$", host, re.I)
    if virtual:
        return {"bucket": virtual.group(1), "region": virtual.group(2) or ""}
    path_style = re.match(r"^s3(?:[.-]([a-z0-9-]+))?\.amazonaws\.com$", host, re.I)
    if path_style:
        return {"bucket": "", "region": path_style.group(1) or ""}
    return {"bucket": "", "region": ""}


def _is_s3_http_url(input: str) -> bool:
    try:
        parsed = urlsplit(input)
    except Exception:
        return False
    if parsed.scheme not in {"http", "https"}:
        return False
    host_info = _parse_s3_host(parsed.hostname or "")
    return bool(host_info["bucket"] or (parsed.hostname or "").startswith("s3."))


def _parse_s3(input: str, definition: dict[str, Any], context: dict[str, str]) -> dict[str, Any]:
    raw_scheme = _extract_scheme(input)
    bucket = ""
    key = ""
    region = ""
    query = {}
    fragment = None
    options = {}
    if raw_scheme == "s3":
        parts = _parse_hierarchical(input)
        bucket = parts.host
        key = "/".join(parts.path_segments)
        region = parts.query.get("region") if isinstance(parts.query.get("region"), str) else ""
        query = parts.query
        fragment = parts.fragment
    else:
        parts = _from_url(input)
        host_info = _parse_s3_host(parts.host)
        region = host_info["region"]
        query = parts.query
        fragment = parts.fragment
        options = {"source_scheme": raw_scheme}
        if host_info["bucket"]:
            bucket = host_info["bucket"]
            key = "/".join(parts.path_segments)
        else:
            bucket = parts.path_segments[0] if parts.path_segments else ""
            key = "/".join(parts.path_segments[1:])
    return _base_address(definition, "s3", context["raw"], context["safe"], {"bucket": bucket, "region": region}, {"type": (definition.get("resource") or {}).get("type") or "bucket", "name": bucket or None}, key, query, fragment, {}, options)


_ADAPTERS = {
    "clickhouse": _parse_clickhouse,
    "duckdb": _parse_duckdb,
    "elasticsearch": _parse_elasticsearch,
    "file": _parse_file,
    "generic-uri": _parse_generic_uri,
    "jdbc": _parse_jdbc,
    "memcached": _parse_memcached,
    "mongodb": _parse_mongodb,
    "object-storage": _parse_object_storage,
    "mysql-compatible": _parse_mysql_compatible,
    "postgres-compatible": _parse_postgres_compatible,
    "questdb": _parse_questdb,
    "redis": _parse_redis,
    "s3": _parse_s3,
    "sqlite": _parse_sqlite,
}


def _validate_address(address: dict[str, Any], definition: dict[str, Any], options: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    errors = []
    warnings = []
    validation = definition.get("validation") or {}
    authority = address.get("authority") or {}
    if validation.get("require_host") and not authority.get("host") and not (isinstance(authority.get("hosts"), list) and authority["hosts"]):
        errors.append(_diagnostic("MISSING_HOST", f"{definition.get('name') or definition.get('id')} requires a host", "authority"))
    if (definition.get("resource") or {}).get("required") and not (address.get("resource") or {}).get("name"):
        errors.append(_diagnostic("MISSING_RESOURCE", f"{definition.get('name') or definition.get('id')} requires a resource", "resource.name"))
    if (definition.get("path") or {}).get("required") and not address.get("path"):
        errors.append(_diagnostic("MISSING_PATH", f"{definition.get('name') or definition.get('id')} requires a path", "path"))
    port_range = validation.get("port_range")
    if port_range:
        ports = []
        if authority.get("port") is not None:
            ports.append(authority["port"])
        for host in authority.get("hosts") or []:
            if host.get("port") is not None:
                ports.append(host["port"])
        for port in ports:
            if not isinstance(port, int) or port < port_range.get("min", 0) or port > port_range.get("max", 0):
                errors.append(_diagnostic("INVALID_PORT", f"Port must be between {port_range.get('min')} and {port_range.get('max')}", "authority.port"))
    query_rules = definition.get("query_parameters") or {}
    for key, value in (address.get("query") or {}).items():
        rule = query_rules.get(key)
        if not rule:
            item = _diagnostic("UNKNOWN_QUERY_PARAMETER", f"{key} is not declared for {definition.get('id')}", f"query.{key}")
            (errors if options.get("strict") else warnings).append(item)
            continue
        errors.extend(_validate_query_value(rule, key, value))
    return {"errors": errors, "warnings": warnings}


def _validate_query_value(rule: dict[str, Any], key: str, value: Any) -> list[dict[str, Any]]:
    errors = []
    for item in _values_for(value):
        if rule.get("type") == "boolean" and str(item).lower() not in {"true", "false", "1", "0", "yes", "no"}:
            errors.append(_diagnostic("INVALID_QUERY_PARAMETER_TYPE", f"{key} must be a boolean", f"query.{key}"))
        if rule.get("type") == "number" and not re.match(r"^-?\d+(\.\d+)?$", str(item)):
            errors.append(_diagnostic("INVALID_QUERY_PARAMETER_TYPE", f"{key} must be a number", f"query.{key}"))
        if isinstance(rule.get("allowed"), list) and item not in rule["allowed"]:
            errors.append(_diagnostic("INVALID_QUERY_PARAMETER_VALUE", f"{key} must be one of: {', '.join(map(str, rule['allowed']))}", f"query.{key}"))
    return errors


def _values_for(value: Any) -> list[Any]:
    return value if isinstance(value, list) else [value]


def _normalized_key(key: str) -> str:
    return str(key or "").strip().lower()


def _sensitive_keys(definition: dict[str, Any] | None = None) -> set[str]:
    return {_normalized_key(key) for key in ((definition or {}).get("redaction") or {}).get("sensitive_keys") or []}


def _safe_credential_keys(definition: dict[str, Any] | None = None) -> set[str]:
    return {_normalized_key(key) for key in ((definition or {}).get("redaction") or {}).get("safe_credentials") or []}


def _is_sensitive_key(key: str, definition: dict[str, Any] | None = None) -> bool:
    return _normalized_key(key) in _sensitive_keys(definition)


def _mask_userinfo(value: str) -> str:
    marker = value.find("://")
    start = 0 if marker == -1 else marker + 3
    end = min([index if index != -1 else len(value) for index in [value.find("/", start), value.find("?", start), value.find("#", start)]])
    authority = value[start:end]
    at = authority.rfind("@")
    if at == -1:
        return value
    user_info = authority[:at]
    if marker == -1 and ":" not in user_info:
        return value
    colon = user_info.find(":")
    if colon == -1:
        return value
    return f"{value[:start]}{user_info[:colon]}:***@{authority[at + 1:]}{value[end:]}"


def _mask_sensitive_query(value: str, definition: dict[str, Any] | None = None) -> str:
    def replace(match: re.Match[str]) -> str:
        key = _safe_decode(match.group(2))
        return f"{match.group(1)}{match.group(2)}=***" if _is_sensitive_key(key, definition) else match.group(0)

    return re.sub(r"([?&])([^=&#]+)=([^&#]*)", replace, value)


def _mask_sensitive_key_values(value: str, definition: dict[str, Any] | None = None) -> str:
    def replace(match: re.Match[str]) -> str:
        return f"{match.group(1)}{match.group(2)}=***" if _is_sensitive_key(match.group(2), definition) else match.group(0)

    return re.sub(r"(^|[;,&\s])([^=;,&\s]+)=([^;,&\s]*)", replace, value)


def _sanitize_object(value: dict[str, Any] | None, definition: dict[str, Any] | None = None) -> dict[str, Any]:
    return {key: "***" if _is_sensitive_key(key, definition) else item for key, item in (value or {}).items()}


def _sanitize_credentials(value: dict[str, Any] | None, definition: dict[str, Any] | None = None) -> dict[str, Any]:
    safe_keys = _safe_credential_keys(definition)
    return {key: item if _normalized_key(key) in safe_keys else "***" for key, item in (value or {}).items()}


def _registry_for(options: dict[str, Any]) -> _Registry:
    return _Registry(get_built_in_definitions() + copy.deepcopy(options.get("definitions", [])))


def _definition_for(address: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    if options.get("definition"):
        return options["definition"]
    registry = _registry_for(options)
    if options.get("provider"):
        provider = str(options["provider"]).lower()
        return registry.get_by_id(provider) or registry.get_by_scheme(provider) or {}
    scheme = str(address.get("scheme") or "").lower()
    if scheme.startswith("jdbc:"):
        return registry.get_by_scheme(scheme.split(":")[1]) or {}
    return registry.get_by_scheme(scheme) or {}


def _canonical_scheme(address: dict[str, Any], definition: dict[str, Any]) -> str:
    scheme = str(address.get("scheme") or "").strip().lower()
    if scheme.startswith("jdbc:"):
        return scheme
    schemes = [str(item).lower() for item in definition.get("schemes") or []]
    return schemes[0] if scheme in schemes and schemes else scheme


def _default_port(definition: dict[str, Any]) -> int | None:
    port = (definition.get("defaults") or {}).get("port")
    return port if isinstance(port, int) else None


def _authority_entries(address: dict[str, Any]) -> list[dict[str, Any]]:
    authority = address.get("authority") or {}
    if isinstance(authority.get("hosts"), list):
        return authority["hosts"]
    host = authority.get("host") or authority.get("bucket") or ((address.get("resource") or {}).get("name") if (address.get("resource") or {}).get("type") == "bucket" else "")
    return [{"host": host, "port": authority.get("port")}] if host else []


def _format_host(host: str) -> str:
    value = str(host or "").lower()
    return f"[{value}]" if ":" in value and not value.startswith("[") else value


def _format_port(port: Any, definition: dict[str, Any], options: dict[str, Any]) -> str:
    if port is None or port == "":
        return ""
    numeric = int(port)
    if not options.get("includeDefaultPort") and numeric == _default_port(definition):
        return ""
    return f":{numeric}"


def _canonical_authority(address: dict[str, Any], definition: dict[str, Any], options: dict[str, Any]) -> str:
    return ",".join(f"{_format_host(entry.get('host'))}{_format_port(entry.get('port'), definition, options)}" for entry in _authority_entries(address))


def _encode_path(path: str) -> str:
    return "/".join(quote(part, safe="") for part in str(path or "").split("/")) if path else ""


def _canonical_path(address: dict[str, Any]) -> str:
    path = str(address.get("path") or "")
    if address.get("type") == "file" or address.get("scheme") == "file":
        return _encode_path(path)
    segments = []
    resource = address.get("resource") or {}
    if resource.get("name") not in (None, "") and resource.get("type") not in {"none", "bucket"}:
        segments.append(quote(str(resource["name"]), safe=""))
    if path:
        segments.extend(quote(part, safe="") for part in path.split("/") if part)
    return f"/{'/'.join(segments)}" if segments else ""


def _canonical_userinfo(address: dict[str, Any], options: dict[str, Any]) -> str:
    if not options.get("includeCredentials"):
        return ""
    credentials = address.get("credentials") or {}
    username = credentials.get("username") or ""
    password = credentials.get("password") or ""
    if not username and not password:
        return ""
    return f"{quote(username, safe='')}{(':' + quote(password, safe='')) if password else ''}@"


def _normalize_query_value(key: str, value: Any, definition: dict[str, Any], options: dict[str, Any]) -> str:
    if not options.get("includeSensitive") and _normalized_key(key) in _sensitive_keys(definition):
        return "***"
    rule = (definition.get("query_parameters") or {}).get(key)
    if rule and rule.get("type") == "boolean":
        text = str(value).lower()
        if text in {"true", "1", "yes"}:
            return "true"
        if text in {"false", "0", "no"}:
            return "false"
    return str(value)


def _canonical_query(address: dict[str, Any], definition: dict[str, Any], options: dict[str, Any]) -> str:
    parts = []
    for key in sorted(address.get("query") or {}):
        for value in _values_for(address["query"][key]):
            parts.append(f"{quote(key, safe='')}={quote(_normalize_query_value(key, value, definition, options), safe='')}")
    return f"?{'&'.join(parts)}" if parts else ""


def _canonical_fragment(address: dict[str, Any], options: dict[str, Any]) -> str:
    if options.get("includeFragment") is False or address.get("fragment") in (None, ""):
        return ""
    return f"#{quote(str(address['fragment']), safe='')}"


def _normalized_port(port: Any, definition: dict[str, Any], options: dict[str, Any]) -> int | None:
    if port is None or port == "":
        return None
    numeric = int(port)
    return None if not options.get("includeDefaultPort") and numeric == _default_port(definition) else numeric


def _normalized_authority(address: dict[str, Any], definition: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    entries = _authority_entries(address)
    if not entries:
        return {}
    if len(entries) > 1:
        return {"hosts": [{"host": str(entry.get("host") or "").lower(), "port": _normalized_port(entry.get("port"), definition, options)} for entry in entries]}
    entry = entries[0]
    if (address.get("resource") or {}).get("type") == "bucket":
        output = {"bucket": str(entry.get("host") or "").lower()}
        region = (address.get("authority") or {}).get("region")
        if region:
            output["region"] = region
        return output
    return {"host": str(entry.get("host") or "").lower(), "port": _normalized_port(entry.get("port"), definition, options)}


def _normalized_query(address: dict[str, Any], definition: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    output = {}
    for key in sorted(address.get("query") or {}):
        values = [_normalize_query_value(key, value, definition, options) for value in _values_for(address["query"][key])]
        output[key] = values[0] if len(values) == 1 else values
    return output


def _normalized_credentials(address: dict[str, Any], options: dict[str, Any]) -> dict[str, str]:
    if not options.get("includeCredentials"):
        return {}
    return {key: (address.get("credentials") or {})[key] for key in sorted(address.get("credentials") or {})}


def _json_default(value: Any) -> str:
    return json.dumps(value)
