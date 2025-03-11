require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
app.use(express.json());
const PORT = process.env.NODE_PORT || 8080;

app.use(express.text({ type: '*/*' }));
app.use(express.urlencoded({ extended: true }));

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: process.env.DIALECT,
    port: process.env.DB_PORT,
    logging: false,
});

const HealthCheck = sequelize.define('HealthCheck', {
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
}, {
    tableName: 'healthcheck',
    timestamps: false,
});

sequelize.sync()
    .then(() => console.log('Database is connected and table is ready'))
    .catch(err => console.error('syncing database error :', err));

app.get('/healthz', async (req, res) => {
    if (
        (Object.keys(req.query).length > 0) ||// if there are query parameters
        (req.body && Object.keys(req.body).length > 0) || // not empty req body
        (typeof req.body === 'string' && req.body.trim().length > 0) // not empty req body
    ) {

        return res.status(400).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
        
    }

    try {
        await HealthCheck.create({});

        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        });

        return res.status(200).end();
    } catch (error) {
        console.error('Can not insert record:', error);

        return res.status(503).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
    }
});

app.all('/healthz', (req, res) => {
    // Only HTTP GET the method is supported by the /healthz endpoint. All other methods should return HTTP code for Method Not Allowed.
    if (req.method !== 'GET') {
        return res.status(405).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
    }
   
});

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
}

module.exports = app;