const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.text());
app.use(express.urlencoded({ extended: true }));

const sequelize = new Sequelize('cloud_computing', 'root', '1234Aa', {
    host: 'localhost',
    dialect: 'mysql',
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
    if (req.body && Object.keys(req.body).length > 0) {
        return res.status(400).end(); 
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
        console.error('NOT INSERT Health Check:', error);

        return res.status(503).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end(); 
    }
});

app.all('/healthz', (req, res) => {
    return res.status(405).set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
    }).end();
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
