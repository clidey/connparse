import { parseClickHouse } from './clickhouse.js';
import { parseDuckDb } from './duckdb.js';
import { parseElasticsearch } from './elasticsearch.js';
import { parseFile } from './file.js';
import { parseGenericUri } from './generic-uri.js';
import { parseJdbc } from './jdbc.js';
import { parseMemcached } from './memcached.js';
import { parseMongoDb } from './mongodb.js';
import { parseMySqlCompatible } from './mysql-compatible.js';
import { parsePostgresCompatible } from './postgres-compatible.js';
import { parseQuestDb } from './questdb.js';
import { parseRedis } from './redis-config.js';
import { parseS3 } from './s3.js';
import { parseSqlite } from './sqlite.js';

export const adapters = {
  clickhouse: parseClickHouse,
  duckdb: parseDuckDb,
  elasticsearch: parseElasticsearch,
  file: parseFile,
  'generic-uri': parseGenericUri,
  jdbc: parseJdbc,
  memcached: parseMemcached,
  mongodb: parseMongoDb,
  'mysql-compatible': parseMySqlCompatible,
  'postgres-compatible': parsePostgresCompatible,
  questdb: parseQuestDb,
  redis: parseRedis,
  s3: parseS3,
  sqlite: parseSqlite
};
