package com.clidey.connparse;

import java.nio.charset.StandardCharsets;
import java.util.Map;

public final class ConformanceMain {
    private ConformanceMain() {}

    @SuppressWarnings("unchecked")
    public static void main(String[] args) throws Exception {
        String payloadText = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        Map<String, Object> payload = Json.parseObject(payloadText.isBlank() ? "{}" : payloadText);
        String input = String.valueOf(payload.getOrDefault("input", ""));
        ParseOptions options = new ParseOptions();
        Object rawOptions = payload.get("options");
        if (rawOptions instanceof Map<?, ?> map) {
            Object provider = ((Map<String, Object>) map).get("provider");
            Object strict = ((Map<String, Object>) map).get("strict");
            if (provider != null) options.provider = String.valueOf(provider);
            if (strict instanceof Boolean value) options.strict = value;
        }
        System.out.println(Json.stringify(Connparse.parse(input, options).toMap()));
    }
}
