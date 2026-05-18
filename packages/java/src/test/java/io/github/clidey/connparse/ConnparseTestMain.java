package io.github.clidey.connparse;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class ConnparseTestMain {
    private ConnparseTestMain() {}

    @SuppressWarnings("unchecked")
    public static void main(String[] args) throws Exception {
        Path root = Path.of("").toAbsolutePath();
        List<Object> fixtures = (List<Object>) Json.parse(Files.readString(root.resolve("specs/fixtures/compatibility.json"), StandardCharsets.UTF_8));
        Set<String> covered = new LinkedHashSet<>();
        int assertions = 0;

        for (Object item : fixtures) {
            Map<String, Object> fixture = (Map<String, Object>) item;
            String name = String.valueOf(fixture.get("name"));
            String input = String.valueOf(fixture.get("input"));
            ParseOptions options = new ParseOptions();
            if (fixture.get("provider") != null) options.provider = String.valueOf(fixture.get("provider"));
            ParseResult result = Connparse.parse(input, options);
            assertTrue(result.ok, name + " failed: " + Json.stringify(result.toMap()));
            assertTrue(result.warnings.isEmpty(), name + " produced warnings");
            assertEquals(input, result.value.raw, name + " raw");
            assertions += 3;
            Map<String, Object> value = result.value.toMap();
            Map<String, Object> expected = (Map<String, Object>) fixture.get("expected");
            for (Map.Entry<String, Object> entry : expected.entrySet()) {
                assertEquals(entry.getValue(), path(value, entry.getKey()), name + " " + entry.getKey());
                assertions++;
            }
            covered.add(result.value.scheme);
            if (fixture.get("provider") != null) covered.add(String.valueOf(fixture.get("provider")));

            ParseOptions strict = new ParseOptions();
            strict.provider = options.provider;
            strict.strict = true;
            ParseResult strictResult = Connparse.parse(input, strict);
            assertTrue(strictResult.ok, name + " strict failed: " + Json.stringify(strictResult.toMap()));
            assertions++;
        }

        for (Definition definition : Connparse.builtInDefinitions()) {
            boolean hasCoverage = covered.contains(definition.id) || definition.schemes.stream().anyMatch(covered::contains);
            assertTrue(hasCoverage, "missing fixture coverage for " + definition.id);
            assertions++;
        }

        ParseResult invalid = Connparse.parse("postgres://localhost/app?sslmode=bad");
        assertTrue(!invalid.ok && invalid.errors.get(0).code.equals("INVALID_QUERY_PARAMETER_VALUE"), "invalid sslmode should fail");
        ParseResult strictUnknown = Connparse.parse("postgres://localhost/app?not_declared=true", new ParseOptions().withStrict(true));
        assertTrue(!strictUnknown.ok && strictUnknown.errors.get(0).code.equals("UNKNOWN_QUERY_PARAMETER"), "strict unknown query should fail");
        ParseResult permissiveUnknown = Connparse.parse("postgres://localhost/app?not_declared=true");
        assertTrue(permissiveUnknown.ok && !permissiveUnknown.warnings.isEmpty(), "permissive unknown query should warn");
        assertions += 3;

        System.out.println("Java tests passed: " + assertions + " assertions.");
    }

    @SuppressWarnings("unchecked")
    private static Object path(Object value, String path) {
        Object current = value;
        for (String part : path.split("\\.")) {
            if (current == null) return null;
            if (part.matches("^\\d+$") && current instanceof List<?> list) {
                current = list.get(Integer.parseInt(part));
            } else if (current instanceof Map<?, ?> map) {
                current = ((Map<String, Object>) map).get(part);
            } else {
                return null;
            }
        }
        return current;
    }

    private static void assertTrue(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void assertEquals(Object expected, Object actual, String message) {
        if (expected == null ? actual == null : expected.equals(actual)) return;
        if (expected instanceof Number left && actual instanceof Number right && left.doubleValue() == right.doubleValue()) return;
        throw new AssertionError(message + "\nwant: " + expected + "\ngot:  " + actual);
    }
}
