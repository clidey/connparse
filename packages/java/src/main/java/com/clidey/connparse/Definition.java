package com.clidey.connparse;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Definition {
    public final String id;
    public final String name;
    public final String type;
    public final List<String> schemes;
    public final String adapter;
    public final Map<String, Object> defaults;
    public final Map<String, Object> authority;
    public final Rule resource;
    public final Rule path;
    public final Map<String, Object> credentials;
    public final Map<String, QueryRule> queryParameters;
    public final ValidationRule validation;
    public final Map<String, Object> options;
    public final RedactionRule redaction;

    public Definition(
            String id,
            String name,
            String type,
            List<String> schemes,
            String adapter,
            Map<String, Object> defaults,
            Map<String, Object> authority,
            Rule resource,
            Rule path,
            Map<String, Object> credentials,
            Map<String, QueryRule> queryParameters,
            ValidationRule validation,
            Map<String, Object> options,
            RedactionRule redaction) {
        this.id = id == null ? "" : id;
        this.name = name == null ? "" : name;
        this.type = type == null ? "unknown" : type;
        this.schemes = List.copyOf(schemes == null ? List.of() : schemes);
        this.adapter = adapter == null ? "" : adapter;
        this.defaults = copyMap(defaults);
        this.authority = copyMap(authority);
        this.resource = resource == null ? new Rule("", false) : resource;
        this.path = path == null ? new Rule("", false) : path;
        this.credentials = copyMap(credentials);
        this.queryParameters = copyQueryRules(queryParameters);
        this.validation = validation == null ? new ValidationRule(false, null) : validation;
        this.options = copyMap(options);
        this.redaction = redaction == null ? new RedactionRule(List.of(), List.of()) : redaction;
    }

    Definition copy() {
        return new Definition(
                id,
                name,
                type,
                schemes,
                adapter,
                defaults,
                authority,
                resource,
                path,
                credentials,
                queryParameters,
                validation,
                options,
                redaction);
    }

    private static Map<String, Object> copyMap(Map<String, Object> input) {
        return new LinkedHashMap<>(input == null ? Map.of() : input);
    }

    private static Map<String, QueryRule> copyQueryRules(Map<String, QueryRule> input) {
        return new LinkedHashMap<>(input == null ? Map.of() : input);
    }

    public static final class Rule {
        public final String type;
        public final boolean required;

        public Rule(String type, boolean required) {
            this.type = type == null ? "" : type;
            this.required = required;
        }
    }

    public static final class QueryRule {
        public final String type;
        public final List<Object> allowed;

        public QueryRule(String type, List<Object> allowed) {
            this.type = type == null ? "" : type;
            this.allowed = List.copyOf(allowed == null ? List.of() : allowed);
        }
    }

    public static final class ValidationRule {
        public final boolean requireHost;
        public final PortRange portRange;

        public ValidationRule(boolean requireHost, PortRange portRange) {
            this.requireHost = requireHost;
            this.portRange = portRange;
        }
    }

    public static final class PortRange {
        public final long min;
        public final long max;

        public PortRange(long min, long max) {
            this.min = min;
            this.max = max;
        }
    }

    public static final class RedactionRule {
        public final List<String> safeCredentials;
        public final List<String> sensitiveKeys;

        public RedactionRule(List<String> safeCredentials, List<String> sensitiveKeys) {
            this.safeCredentials = List.copyOf(safeCredentials == null ? new ArrayList<>() : safeCredentials);
            this.sensitiveKeys = List.copyOf(sensitiveKeys == null ? new ArrayList<>() : sensitiveKeys);
        }
    }
}
