const { Sequelize, DataTypes } = require('sequelize');

jest.setTimeout(10000);

//mock database
jest.mock('sequelize');
const createRecord = jest.fn();
const sequelizeMock = {
    define: () => ({ create: createRecord }),  
    sync: jest.fn().mockResolvedValue(), 
    authenticate: jest.fn().mockResolvedValue(),
};

Sequelize.mockImplementation(() => sequelizeMock);

const request = require('supertest');
const app = require('../index');

// function for headers(Cache-Control: no-cache) checking and payload checking
const checkHeadersAndBodies = (res) => {
    expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    expect(res.headers['pragma']).toBe('no-cache');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.text).toBe('');
}

//tests
describe('Test health check rest api whether functions well', () => {
    beforeEach(() => {
        createRecord.mockClear(); 
        sequelizeMock.sync.mockClear();
    });

    test('if there are query parameters in get method, 400 should return', async () => {
        const res = await request(app).get('/healthz?name=jack');
        expect(res.statusCode).toBe(400);
        checkHeadersAndBodies(res);
    });

    //test('if there is text body is in get method, 400 should return', async () => {
    //    const res = await request(app).get('/healthz').set('Content-Type', 'text/plain').send('my name is jack');
    //    expect(res.statusCode).toBe(400);
    //    checkHeadersAndBodies(res);
    //});

    test('if there is JSON payload in GET request, 400 should return', async () => {
        const res = await request(app).get('/healthz').send({ name: 'jack' });
        expect(res.statusCode).toBe(400);
        checkHeadersAndBodies(res);
    });

    test('get method, no query meters and empty request body, if record was inserted successfully, 200 should return', async () => {
        createRecord.mockResolvedValueOnce({}); 
        const res = await request(app).get('/healthz');
        expect(res.statusCode).toBe(200);
        expect(createRecord).toHaveBeenCalled();
        checkHeadersAndBodies(res);
    });

    test('get method, no query meters and empty request body, if record was not inserted successfully, 503 should return', async () => {
        createRecord.mockRejectedValueOnce(new Error('Unsuccessful Insert'));
        const res = await request(app).get('/healthz');
        expect(res.statusCode).toBe(503);
        expect(createRecord).toHaveBeenCalled();
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