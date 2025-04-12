const request = require('supertest');

process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = process.env.MYSQL_ROOT_PASSWORD || '1234Aa';
process.env.DB_NAME = process.env.MYSQL_DATABASE || 'cloud_computing';
process.env.S3_BUCKET = 'dummy-bucket';
process.env.AWS_REGION = 'us-east-1';
process.env.PORT = '3001';

const app = require('../index');
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: false,
  }
);

const HealthCheck = sequelize.define(
  'HealthCheck',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    datetime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  },
  {
    tableName: 'healthcheck',
    timestamps: false,
  }
);

const checkHeadersAndBodies = (res) => {
  expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
  expect(res.headers['pragma']).toBe('no-cache');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.text).toBe('');
};

beforeAll(async () => {
  await sequelize.authenticate();
  await sequelize.sync();
});

afterAll(async () => {
  await sequelize.close();
});

afterEach(async () => {
  await HealthCheck.destroy({ where: {} });
});

describe('Healthz endpoint with real DB', () => {
  test('if there are query parameters in healthz get method, 400 should return', async () => {
    const res = await request(app).get('/healthz?name=test');
    expect(res.statusCode).toBe(400);
    checkHeadersAndBodies(res);
  });

  test('if there are request body in healthz get method, 400 should return', async () => {
    const res = await request(app).get('/healthz').send({ key: 'value' });
    expect(res.statusCode).toBe(400);
    checkHeadersAndBodies(res);
  });

  test('healthz get method, no query meters and empty request body, if record was inserted successfully, 200 should return', async () => {
    const res = await request(app).get('/healthz');
    expect(res.statusCode).toBe(200);
    const records = await HealthCheck.findAll();
    expect(records.length).toBe(1);
    checkHeadersAndBodies(res);
  });

  test('methods except get method, 405 method not allowed should return', async () => {
    const methods = ['post', 'put', 'patch', 'delete'];
    for (const method of methods) {
      const res = await request(app)[method]('/healthz');
      expect(res.statusCode).toBe(405);
      checkHeadersAndBodies(res);
    }
  });
});
