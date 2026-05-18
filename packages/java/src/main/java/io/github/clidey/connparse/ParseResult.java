package io.github.clidey.connparse;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ParseResult {
    public final boolean ok;
    public final Address value;
    public final List<Diagnostic> errors;
    public final List<Diagnostic> warnings;

    public ParseResult(boolean ok, Address value, List<Diagnostic> errors, List<Diagnostic> warnings) {
        this.ok = ok;
        this.value = value;
        this.errors = List.copyOf(errors == null ? List.of() : errors);
        this.warnings = List.copyOf(warnings == null ? List.of() : warnings);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("ok", ok);
        output.put("value", value == null ? null : value.toMap());
        output.put("errors", diagnostics(errors));
        output.put("warnings", diagnostics(warnings));
        return output;
    }

    private static List<Object> diagnostics(List<Diagnostic> diagnostics) {
        List<Object> output = new ArrayList<>();
        for (Diagnostic diagnostic : diagnostics) output.add(diagnostic.toMap());
        return output;
    }
}
