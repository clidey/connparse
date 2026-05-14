export const builtInDefinitions = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    type: 'database',
    schemes: ['postgres', 'postgresql'],
    adapter: 'generic-uri',
    defaults: { port: 5432 },
    authority: { host: true, port: true, multi_host: true },
    resource: { type: 'database', required: true },
    path: { type: 'object_path', required: false },
    credentials: { username: true, password: true },
    query_parameters: {
      sslmode: {
        type: 'string',
        allowed: ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']
      },
      target_session_attrs: {
        type: 'string',
        allowed: ['any', 'read-write', 'read-only', 'primary', 'standby', 'prefer-standby']
      },
      application_name: { type: 'string' }
    },
    validation: { require_host: true, port_range: { min: 1, max: 65535 } }
  },
  {
    id: 'mysql',
    name: 'MySQL',
    type: 'database',
    schemes: ['mysql', 'mariadb'],
    adapter: 'generic-uri',
    defaults: { port: 3306 },
    authority: { host: true, port: true },
    resource: { type: 'database', required: false },
    path: { type: 'object_path', required: false },
    credentials: { username: true, password: true },
    query_parameters: {
      ssl: { type: 'string' },
      charset: { type: 'string' }
    },
    validation: { require_host: true, port_range: { min: 1, max: 65535 } }
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    type: 'database',
    schemes: ['mongodb', 'mongodb+srv'],
    adapter: 'mongodb',
    defaults: { port: 27017 },
    authority: { host: true, port: true, multi_host: true },
    resource: { type: 'database', required: false },
    path: { type: 'collection', required: false },
    credentials: { username: true, password: true },
    query_parameters: {
      authSource: { type: 'string' },
      replicaSet: { type: 'string' },
      retryWrites: { type: 'boolean' },
      tls: { type: 'boolean' },
      ssl: { type: 'boolean' }
    },
    validation: { require_host: true, port_range: { min: 1, max: 65535 } }
  },
  {
    id: 'redis',
    name: 'Redis',
    type: 'cache',
    schemes: ['redis', 'rediss'],
    adapter: 'redis',
    defaults: { port: 6379 },
    authority: { host: true, port: true },
    resource: { type: 'database_index', required: false },
    path: { type: 'none', required: false },
    credentials: { username: true, password: true },
    query_parameters: {
      protocol: { type: 'number' }
    },
    validation: { require_host: true, port_range: { min: 1, max: 65535 } }
  },
  {
    id: 's3',
    name: 'Amazon S3',
    type: 'object_storage',
    schemes: ['s3'],
    adapter: 's3',
    authority: { bucket: true, region: true },
    resource: { type: 'bucket', required: true },
    path: { type: 'object_key', required: false },
    credentials: {},
    query_parameters: {
      versionId: { type: 'string' },
      region: { type: 'string' }
    },
    validation: {}
  },
  {
    id: 'file',
    name: 'File',
    type: 'file',
    schemes: ['file'],
    adapter: 'file',
    authority: { host: false },
    resource: { type: 'none', required: false },
    path: { type: 'filesystem_path', required: true },
    credentials: {},
    query_parameters: {},
    validation: {}
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    type: 'database',
    schemes: ['sqlite'],
    adapter: 'sqlite',
    authority: {},
    resource: { type: 'database', required: true },
    path: { type: 'filesystem_path', required: true },
    credentials: {},
    query_parameters: {
      mode: { type: 'string' },
      cache: { type: 'string' }
    },
    validation: {}
  }
];
