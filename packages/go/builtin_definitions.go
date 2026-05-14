package connparse

func BuiltInDefinitions() []Definition {
	return []Definition{
		defPostgres(), defMySQL(), defMariaDB(), defMongoDB(), defDuckDB(),
		defClickHouse(), defMemcached(), defElasticsearch(), defCockroachDB(),
		defQuestDB(), defYugabyteDB(), defRedis(), defS3(), defFile(), defSQLite(),
	}
}

func qr(t string, allowed ...any) QueryRule { return QueryRule{Type: t, Allowed: allowed} }
func defs(port int) map[string]any {
	if port == 0 {
		return nil
	}
	return map[string]any{"port": port}
}

func defPostgres() Definition {
	return Definition{ID: "postgres", Name: "PostgreSQL", Type: "database", Schemes: []string{"postgres", "postgresql"}, Adapter: "postgres-compatible", Defaults: defs(5432), ResourceRule: Rule{Type: "database", Required: true}, QueryParameters: map[string]QueryRule{
		"sslmode":              qr("string", "disable", "allow", "prefer", "require", "verify-ca", "verify-full"),
		"target_session_attrs": qr("string", "any", "read-write", "read-only", "primary", "standby", "prefer-standby"),
		"application_name":     qr("string"), "connect_timeout": qr("number"), "host": qr("string"), "hostaddr": qr("string"), "options": qr("string"), "passfile": qr("string"), "password": qr("string"), "port": qr("string"), "require_auth": qr("string"), "service": qr("string"), "sslcert": qr("string"), "sslkey": qr("string"), "sslrootcert": qr("string"),
	}, Validation: ValidationRule{RequireHost: true, PortRange: PortRange{Min: 1, Max: 65535}}}
}

func defMySQL() Definition {
	return Definition{ID: "mysql", Name: "MySQL", Type: "database", Schemes: []string{"mysql", "mysqlx", "mysqlx+srv"}, Adapter: "mysql-compatible", Defaults: defs(3306), ResourceRule: Rule{Type: "database"}, QueryParameters: map[string]QueryRule{
		"auth-method": qr("string", "AUTO", "MYSQL41", "SHA256_MEMORY", "FROM_CAPABILITIES", "FALLBACK", "PLAIN"), "get-server-public-key": qr("boolean"), "ssl": qr("string"), "ssl-mode": qr("string", "DISABLED", "PREFERRED", "REQUIRED", "VERIFY_CA", "VERIFY_IDENTITY"), "charset": qr("string"), "tls-version": qr("string"), "tls-versions": qr("string"), "schema": qr("string"),
	}, Validation: ValidationRule{RequireHost: true, PortRange: PortRange{Min: 1, Max: 65535}}}
}

func defMariaDB() Definition {
	return Definition{ID: "mariadb", Name: "MariaDB", Type: "database", Schemes: []string{"mariadb"}, Adapter: "mysql-compatible", Defaults: defs(3306), ResourceRule: Rule{Type: "database"}, QueryParameters: map[string]QueryRule{"sslMode": qr("string", "disable", "trust", "verify-ca", "verify-full"), "ssl": qr("string"), "user": qr("string"), "password": qr("string")}, Validation: ValidationRule{RequireHost: true, PortRange: PortRange{Min: 1, Max: 65535}}}
}

func defMongoDB() Definition {
	return Definition{ID: "mongodb", Name: "MongoDB", Type: "database", Schemes: []string{"mongodb", "mongodb+srv"}, Adapter: "mongodb", Defaults: defs(27017), ResourceRule: Rule{Type: "database"}, QueryParameters: map[string]QueryRule{"authSource": qr("string"), "authMechanism": qr("string"), "authMechanismProperties": qr("string"), "connectTimeoutMS": qr("number"), "directConnection": qr("boolean"), "replicaSet": qr("string"), "retryWrites": qr("boolean"), "serverSelectionTimeoutMS": qr("number"), "tls": qr("boolean"), "tlsCAFile": qr("string"), "tlsCertificateKeyFile": qr("string"), "tlsInsecure": qr("boolean"), "ssl": qr("boolean"), "w": qr("string")}, Validation: ValidationRule{RequireHost: true, PortRange: PortRange{Min: 1, Max: 65535}}}
}

func defDuckDB() Definition {
	return Definition{ID: "duckdb", Name: "DuckDB", Type: "database", Schemes: []string{"duckdb"}, Adapter: "duckdb", ResourceRule: Rule{Type: "database", Required: true}, PathRule: Rule{Type: "filesystem_path", Required: true}, QueryParameters: map[string]QueryRule{"access_mode": qr("string")}}
}
func defClickHouse() Definition {
	return Definition{ID: "clickhouse", Name: "ClickHouse", Type: "database", Schemes: []string{"clickhouse", "ch"}, Adapter: "clickhouse", Defaults: defs(9000), ResourceRule: Rule{Type: "database"}, QueryParameters: map[string]QueryRule{"database": qr("string"), "ssl": qr("boolean"), "sslmode": qr("string"), "user": qr("string"), "password": qr("string"), "readonly": qr("number"), "debug": qr("boolean"), "createDatabaseIfNotExist": qr("boolean")}, Validation: ValidationRule{RequireHost: true, PortRange: PortRange{Min: 1, Max: 65535}}}
}
func defMemcached() Definition {
	return Definition{ID: "memcached", Name: "Memcached", Type: "cache", Schemes: []string{"memcached", "memcacheds"}, Adapter: "memcached", Defaults: defs(11211), ResourceRule: Rule{Type: "none"}, Validation: ValidationRule{RequireHost: true, PortRange: PortRange{Min: 1, Max: 65535}}}
}
func defElasticsearch() Definition {
	return Definition{ID: "elasticsearch", Name: "Elasticsearch", Type: "api", Schemes: []string{"elasticsearch", "elastic", "elasticsearch+http", "elasticsearch+https"}, Adapter: "elasticsearch", Defaults: defs(9200), ResourceRule: Rule{Type: "index"}, QueryParameters: map[string]QueryRule{"api_key": qr("string"), "apiKey": qr("string"), "token": qr("string")}, Validation: ValidationRule{RequireHost: true, PortRange: PortRange{Min: 1, Max: 65535}}}
}
func defCockroachDB() Definition {
	d := defPostgres()
	d.ID = "cockroachdb"
	d.Name = "CockroachDB"
	d.Schemes = []string{"cockroach", "cockroachdb"}
	d.Defaults = defs(26257)
	d.ResourceRule.Required = false
	d.Options = map[string]any{"compatible_with": "postgres"}
	return d
}
func defQuestDB() Definition {
	return Definition{ID: "questdb", Name: "QuestDB", Type: "database", Schemes: []string{"questdb"}, Adapter: "questdb", Defaults: defs(8812), ResourceRule: Rule{Type: "database"}, QueryParameters: map[string]QueryRule{"auto_flush": qr("string", "on", "off"), "auto_flush_rows": qr("number"), "protocol_version": qr("string"), "retry_timeout": qr("number"), "tls_verify": qr("string", "on", "unsafe_off")}, Validation: ValidationRule{RequireHost: true, PortRange: PortRange{Min: 1, Max: 65535}}}
}
func defYugabyteDB() Definition {
	return Definition{ID: "yugabytedb", Name: "YugabyteDB", Type: "database", Schemes: []string{"yugabyte", "yugabytedb"}, Adapter: "postgres-compatible", Defaults: defs(5433), ResourceRule: Rule{Type: "database"}, QueryParameters: map[string]QueryRule{"loadBalance": qr("string"), "ssl": qr("boolean"), "sslmode": qr("string", "disable", "allow", "prefer", "require", "verify-ca", "verify-full"), "sslrootcert": qr("string"), "topologyKeys": qr("string"), "ybServersRefreshInterval": qr("number")}, Validation: ValidationRule{RequireHost: true, PortRange: PortRange{Min: 1, Max: 65535}}, Options: map[string]any{"compatible_with": "postgres"}}
}
func defRedis() Definition {
	return Definition{ID: "redis", Name: "Redis", Type: "cache", Schemes: []string{"redis", "rediss"}, Adapter: "redis", Defaults: defs(6379), ResourceRule: Rule{Type: "database_index"}, QueryParameters: map[string]QueryRule{"protocol": qr("number")}, Validation: ValidationRule{RequireHost: true, PortRange: PortRange{Min: 1, Max: 65535}}}
}
func defS3() Definition {
	return Definition{ID: "s3", Name: "Amazon S3", Type: "object_storage", Schemes: []string{"s3"}, Adapter: "s3", ResourceRule: Rule{Type: "bucket", Required: true}, QueryParameters: map[string]QueryRule{"versionId": qr("string"), "region": qr("string")}}
}
func defFile() Definition {
	return Definition{ID: "file", Name: "File", Type: "file", Schemes: []string{"file"}, Adapter: "file", ResourceRule: Rule{Type: "none"}, PathRule: Rule{Type: "filesystem_path", Required: true}}
}
func defSQLite() Definition {
	return Definition{ID: "sqlite", Name: "SQLite", Type: "database", Schemes: []string{"sqlite"}, Adapter: "sqlite", ResourceRule: Rule{Type: "database", Required: true}, PathRule: Rule{Type: "filesystem_path", Required: true}, QueryParameters: map[string]QueryRule{"mode": qr("string"), "cache": qr("string")}}
}
