import { parseFile } from './file.js';
import { parseGenericUri } from './generic-uri.js';
import { parseMongoDb } from './mongodb.js';
import { parseRedis } from './redis.js';
import { parseS3 } from './s3.js';
import { parseSqlite } from './sqlite.js';

export const adapters = {
  file: parseFile,
  'generic-uri': parseGenericUri,
  mongodb: parseMongoDb,
  redis: parseRedis,
  s3: parseS3,
  sqlite: parseSqlite
};
