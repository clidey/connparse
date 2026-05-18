use connparse::{
    built_in_definitions, canonicalize, equivalent, parse, parse_normalize, ParseOptions,
};
use serde_json::Value;
use std::collections::BTreeSet;

fn fixtures() -> Vec<Value> {
    let text = std::fs::read_to_string("../../specs/fixtures/compatibility.json").unwrap();
    serde_json::from_str(&text).unwrap()
}

fn get_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let mut current = value;
    for part in path.split('.') {
        current = if let Ok(index) = part.parse::<usize>() {
            current.as_array()?.get(index)?
        } else {
            current.as_object()?.get(part)?
        };
    }
    Some(current)
}

#[test]
fn shared_fixtures_match() {
    for fixture in fixtures() {
        let name = fixture["name"].as_str().unwrap();
        let input = fixture["input"].as_str().unwrap();
        let mut options = ParseOptions::default();
        if let Some(provider) = fixture.get("provider").and_then(Value::as_str) {
            options.provider = Some(provider.to_string());
        }
        let result = parse(input, Some(options));
        assert!(result.ok, "{}: {:?}", name, result.errors);
        assert!(
            result.warnings.is_empty(),
            "{} warnings: {:?}",
            name,
            result.warnings
        );
        let value = serde_json::to_value(result.value.unwrap()).unwrap();
        assert_eq!(value["raw"], input, "{name}");
        let keys = value
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        assert_eq!(
            keys,
            vec![
                "authority",
                "credentials",
                "fragment",
                "options",
                "path",
                "query",
                "raw",
                "resource",
                "safe",
                "scheme",
                "type"
            ],
            "{name}"
        );
        if value["authority"]["hosts"].is_array() {
            assert!(value["authority"].get("host").is_none(), "{name}");
            assert!(value["authority"].get("port").is_none(), "{name}");
        }
        for (path, expected) in fixture["expected"].as_object().unwrap() {
            assert_eq!(get_path(&value, path), Some(expected), "{name}: {path}");
        }
    }
}

#[test]
fn shared_fixtures_match_in_strict_mode() {
    for fixture in fixtures() {
        let input = fixture["input"].as_str().unwrap();
        let mut options = ParseOptions {
            strict: true,
            ..Default::default()
        };
        if let Some(provider) = fixture.get("provider").and_then(Value::as_str) {
            options.provider = Some(provider.to_string());
        }
        let result = parse(input, Some(options));
        assert!(result.ok, "{}: {:?}", fixture["name"], result.errors);
        assert!(
            result.warnings.is_empty(),
            "{} warnings: {:?}",
            fixture["name"],
            result.warnings
        );
    }
}

#[test]
fn fixtures_cover_all_providers() {
    let ids = built_in_definitions()
        .into_iter()
        .map(|definition| definition.id)
        .collect::<BTreeSet<_>>();
    let mut covered = BTreeSet::new();
    for fixture in fixtures() {
        let input = fixture["input"].as_str().unwrap();
        let mut options = ParseOptions::default();
        if let Some(provider) = fixture.get("provider").and_then(Value::as_str) {
            options.provider = Some(provider.to_string());
            covered.insert(provider.to_string());
        }
        let result = parse(input, Some(options));
        if result.ok {
            covered.insert(result.value.unwrap().scheme);
        }
    }
    assert!(ids.difference(&covered).collect::<Vec<_>>().is_empty());
}

#[test]
fn normalize_and_canonical_helpers_work() {
    let left = parse_normalize(
        "postgresql://user:pass@LOCALHOST:5432/app?sslmode=require&application_name=myapp",
        None,
    );
    let right = parse_normalize(
        "postgres://localhost/app?application_name=myapp&sslmode=require",
        None,
    );
    assert!(left.ok);
    assert!(right.ok);
    assert_eq!(left.value, right.value);
    assert_eq!(
        left.value.unwrap().canonical,
        "postgres://localhost/app?application_name=myapp&sslmode=require"
    );
    assert_eq!(
        canonicalize("postgresql://localhost:5432/app", None).unwrap(),
        "postgres://localhost/app"
    );
    assert!(equivalent(
        "postgresql://localhost:5432/app",
        "postgres://localhost/app",
        None
    )
    .unwrap());
}

#[test]
fn validation_errors_match_contract() {
    assert!(!parse("postgres://localhost/app?sslmode=invalid", None).ok);
    assert!(
        !parse(
            "postgres://localhost/app?unexpected=1",
            Some(ParseOptions {
                strict: true,
                ..Default::default()
            })
        )
        .ok
    );
    assert!(parse("unknown+db://example.com/main", None).ok);
    assert!(
        !parse(
            "unknown+db://example.com/main",
            Some(ParseOptions {
                strict: true,
                ..Default::default()
            })
        )
        .ok
    );
}
