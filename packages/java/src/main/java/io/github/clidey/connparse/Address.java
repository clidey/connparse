package io.github.clidey.connparse;

import java.util.LinkedHashMap;
import java.util.Map;

public final class Address {
    public final String scheme;
    public final String type;
    public final Map<String, Object> authority;
    public final Resource resource;
    public final String path;
    public final Map<String, Object> query;
    public final String fragment;
    public final Map<String, String> credentials;
    public final Map<String, Object> options;
    public final String raw;
    public final String safe;

    public Address(
            String scheme,
            String type,
            Map<String, Object> authority,
            Resource resource,
            String path,
            Map<String, Object> query,
            String fragment,
            Map<String, String> credentials,
            Map<String, Object> options,
            String raw,
            String safe) {
        this.scheme = scheme == null ? "" : scheme;
        this.type = type == null ? "unknown" : type;
        this.authority = new LinkedHashMap<>(authority == null ? Map.of() : authority);
        this.resource = resource == null ? new Resource("none", null) : resource;
        this.path = path == null ? "" : path;
        this.query = new LinkedHashMap<>(query == null ? Map.of() : query);
        this.fragment = fragment;
        this.credentials = new LinkedHashMap<>(credentials == null ? Map.of() : credentials);
        this.options = new LinkedHashMap<>(options == null ? Map.of() : options);
        this.raw = raw == null ? "" : raw;
        this.safe = safe == null ? "" : safe;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("scheme", scheme);
        output.put("type", type);
        output.put("authority", authority);
        output.put("resource", resource.toMap());
        output.put("path", path);
        output.put("query", query);
        output.put("fragment", fragment);
        output.put("credentials", credentials);
        output.put("options", options);
        output.put("raw", raw);
        output.put("safe", safe);
        return output;
    }

    public static final class Resource {
        public final String type;
        public final String name;

        public Resource(String type, String name) {
            this.type = type == null ? "none" : type;
            this.name = name;
        }

        public Map<String, Object> toMap() {
            Map<String, Object> output = new LinkedHashMap<>();
            output.put("type", type);
            output.put("name", name);
            return output;
        }
    }
}
