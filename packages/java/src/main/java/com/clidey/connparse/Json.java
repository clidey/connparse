package com.clidey.connparse;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class Json {
    private Json() {}

    static String stringify(Object value) {
        if (value == null) return "null";
        if (value instanceof String text) return quote(text);
        if (value instanceof Number || value instanceof Boolean) return String.valueOf(value);
        if (value instanceof Address address) return stringify(address.toMap());
        if (value instanceof ParseResult result) return stringify(result.toMap());
        if (value instanceof Diagnostic diagnostic) return stringify(diagnostic.toMap());
        if (value instanceof Map<?, ?> map) {
            StringBuilder builder = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) builder.append(',');
                first = false;
                builder.append(quote(String.valueOf(entry.getKey()))).append(':').append(stringify(entry.getValue()));
            }
            return builder.append('}').toString();
        }
        if (value instanceof Iterable<?> iterable) {
            StringBuilder builder = new StringBuilder("[");
            boolean first = true;
            for (Object item : iterable) {
                if (!first) builder.append(',');
                first = false;
                builder.append(stringify(item));
            }
            return builder.append(']').toString();
        }
        return quote(String.valueOf(value));
    }

    static Object parse(String text) {
        return new Parser(text).parse();
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> parseObject(String text) {
        Object value = parse(text);
        if (value instanceof Map<?, ?> map) return (Map<String, Object>) map;
        throw new IllegalArgumentException("JSON root must be an object");
    }

    private static String quote(String value) {
        StringBuilder builder = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> builder.append("\\\"");
                case '\\' -> builder.append("\\\\");
                case '\b' -> builder.append("\\b");
                case '\f' -> builder.append("\\f");
                case '\n' -> builder.append("\\n");
                case '\r' -> builder.append("\\r");
                case '\t' -> builder.append("\\t");
                default -> {
                    if (c < 0x20) builder.append(String.format("\\u%04x", (int) c));
                    else builder.append(c);
                }
            }
        }
        return builder.append('"').toString();
    }

    private static final class Parser {
        private final String text;
        private int index;

        Parser(String text) {
            this.text = text == null ? "" : text;
        }

        Object parse() {
            Object value = parseValue();
            skipWhitespace();
            if (index != text.length()) throw error("unexpected trailing content");
            return value;
        }

        private Object parseValue() {
            skipWhitespace();
            if (index >= text.length()) throw error("unexpected end of input");
            char c = text.charAt(index);
            if (c == '"') return parseString();
            if (c == '{') return parseObject();
            if (c == '[') return parseArray();
            if (text.startsWith("true", index)) {
                index += 4;
                return true;
            }
            if (text.startsWith("false", index)) {
                index += 5;
                return false;
            }
            if (text.startsWith("null", index)) {
                index += 4;
                return null;
            }
            return parseNumber();
        }

        private Map<String, Object> parseObject() {
            expect('{');
            Map<String, Object> output = new LinkedHashMap<>();
            skipWhitespace();
            if (peek('}')) {
                index++;
                return output;
            }
            while (true) {
                String key = parseString();
                skipWhitespace();
                expect(':');
                output.put(key, parseValue());
                skipWhitespace();
                if (peek('}')) {
                    index++;
                    return output;
                }
                expect(',');
                skipWhitespace();
            }
        }

        private List<Object> parseArray() {
            expect('[');
            List<Object> output = new ArrayList<>();
            skipWhitespace();
            if (peek(']')) {
                index++;
                return output;
            }
            while (true) {
                output.add(parseValue());
                skipWhitespace();
                if (peek(']')) {
                    index++;
                    return output;
                }
                expect(',');
            }
        }

        private String parseString() {
            expect('"');
            StringBuilder builder = new StringBuilder();
            while (index < text.length()) {
                char c = text.charAt(index++);
                if (c == '"') return builder.toString();
                if (c != '\\') {
                    builder.append(c);
                    continue;
                }
                if (index >= text.length()) throw error("invalid escape");
                char escaped = text.charAt(index++);
                switch (escaped) {
                    case '"' -> builder.append('"');
                    case '\\' -> builder.append('\\');
                    case '/' -> builder.append('/');
                    case 'b' -> builder.append('\b');
                    case 'f' -> builder.append('\f');
                    case 'n' -> builder.append('\n');
                    case 'r' -> builder.append('\r');
                    case 't' -> builder.append('\t');
                    case 'u' -> {
                        if (index + 4 > text.length()) throw error("invalid unicode escape");
                        builder.append((char) Integer.parseInt(text.substring(index, index + 4), 16));
                        index += 4;
                    }
                    default -> throw error("invalid escape");
                }
            }
            throw error("unterminated string");
        }

        private Number parseNumber() {
            int start = index;
            if (peek('-')) index++;
            while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
            boolean decimal = false;
            if (peek('.')) {
                decimal = true;
                index++;
                while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
            }
            if (index < text.length() && (text.charAt(index) == 'e' || text.charAt(index) == 'E')) {
                decimal = true;
                index++;
                if (index < text.length() && (text.charAt(index) == '+' || text.charAt(index) == '-')) index++;
                while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
            }
            String raw = text.substring(start, index);
            if (raw.isEmpty() || raw.equals("-")) throw error("invalid number");
            return decimal ? Double.parseDouble(raw) : Long.parseLong(raw);
        }

        private void skipWhitespace() {
            while (index < text.length() && Character.isWhitespace(text.charAt(index))) index++;
        }

        private boolean peek(char expected) {
            return index < text.length() && text.charAt(index) == expected;
        }

        private void expect(char expected) {
            if (!peek(expected)) throw error("expected " + expected);
            index++;
        }

        private IllegalArgumentException error(String message) {
            return new IllegalArgumentException(message + " at byte " + index);
        }
    }
}
