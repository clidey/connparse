package com.clidey.connparse;

import java.util.LinkedHashMap;
import java.util.Map;

public final class Diagnostic {
    public final String code;
    public final String message;
    public final String path;

    public Diagnostic(String code, String message, String path) {
        this.code = code == null ? "" : code;
        this.message = message == null ? "" : message;
        this.path = path == null || path.isEmpty() ? null : path;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("code", code);
        output.put("message", message);
        if (path != null) output.put("path", path);
        return output;
    }
}
