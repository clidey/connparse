package com.clidey.connparse;

import java.util.ArrayList;
import java.util.List;

public final class ParseOptions {
    public String provider;
    public boolean strict;
    public List<Definition> definitions = new ArrayList<>();

    public ParseOptions withProvider(String provider) {
        this.provider = provider;
        return this;
    }

    public ParseOptions withStrict(boolean strict) {
        this.strict = strict;
        return this;
    }

    public ParseOptions withDefinitions(List<Definition> definitions) {
        this.definitions = new ArrayList<>(definitions == null ? List.of() : definitions);
        return this;
    }
}
