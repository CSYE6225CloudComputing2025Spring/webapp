// 注：不再需要 dotenv
// require('dotenv').config({ path: '.env.test' });

const request = require('supertest');

// 手动注入 process.env，兼容 GitHub Actions 里的 service.mysql.env
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

// 使用真实数据库连接
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

// 重新定义 HealthCheck 模型
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

// 验证 HTTP header
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
  test('GET /healthz with query string → 400', async () => {
    const res = await request(app).get('/healthz?name=test');
    expect(res.statusCode).toBe(400);
    checkHeadersAndBodies(res);
  });

  test('GET /healthz with request body → 400', async () => {
    const res = await request(app).get('/healthz').send({ key: 'value' });
    expect(res.statusCode).toBe(400);
    checkHeadersAndBodies(res);
  });

  test('Valid GET /healthz inserts record → 200', async () => {
    const res = await request(app).get('/healthz');
    expect(res.statusCode).toBe(200);
    const records = await HealthCheck.findAll();
    expect(records.length).toBe(1);
    checkHeadersAndBodies(res);
  });

  test('Other methods (e.g. POST) on /healthz → 405', async () => {
    const methods = ['post', 'put', 'patch', 'delete'];
    for (const method of methods) {
      const res = await request(app)[method]('/healthz');
      expect(res.statusCode).toBe(405);
      checkHeadersAndBodies(res);
    }
  });
});
