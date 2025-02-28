const { Sequelize, DataTypes } = require('sequelize');
const request = require('supertest');
const app = require('../index');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST || '127.0.0.1', 
        dialect: 'mysql',
        logging: false, 
    }
);

const HealthCheck = sequelize.define('HealthCheck', {
    status: DataTypes.STRING,
});

// function for headers(Cache-Control: no-cache) checking and payload checking
const checkHeadersAndBodies = (res) => {
    expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    expect(res.headers['pragma']).toBe('no-cache');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.text).toBe('');
}

jest.setTimeout(20000);

//tests
describe('Test health check rest api whether functions well', () => {
    beforeAll(async () => {
        await sequelize.authenticate(); 
        await sequelize.sync({ force: true }); 
    });
    
    afterAll(async () => {
        await sequelize.close(); 
    });
    
    beforeEach(async () => {
        await HealthCheck.destroy({ where: {} }); 
    });
    
    test('if there are query parameters in get method, 400 should return', async () => {
        const res = await request(app).get('/healthz?name=jack');
        expect(res.statusCode).toBe(400);
        checkHeadersAndBodies(res);
    });

    test('if there is text body is in get method, 400 should return', async () => {
        const res = await request(app).get('/healthz').set('Content-Type', 'text/plain').send('my name is jack');
        expect(res.statusCode).toBe(400);
        checkHeadersAndBodies(res);
    });

    test('if there is JSON payload in GET request, 400 should return', async () => {
        const res = await request(app).get('/healthz').send({ name: 'jack' });
        expect(res.statusCode).toBe(400);
        checkHeadersAndBodies(res);
    });

    test('get method, no query meters and empty request body, if record was inserted successfully, 200 should return', async () => {
        await HealthCheck.create({ status: 'ok' });
        const res = await request(app).get('/healthz');
        expect(res.statusCode).toBe(200);
        checkHeadersAndBodies(res);
    });

    test('get method, no query meters and empty request body, if record was not inserted successfully, 503 should return', async () => {
        jest.spyOn(HealthCheck, 'create').mockRejectedValue(new Error('Unsuccessful Insert'));
        const res = await request(app).get('/healthz');
        expect(res.statusCode).toBe(503);
        checkHeadersAndBodies(res);
    });

    test('methods except get method, 405 method not allowed should return', async () => {
        const methodsExceptGet = ['post', 'put', 'patch', 'delete'];
        for (const method of methodsExceptGet) {
            const res = await request(app)[method]('/healthz');
            expect(res.statusCode).toBe(405);
            checkHeadersAndBodies(res);
        }
        
    });




});