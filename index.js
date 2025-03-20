require('dotenv').config();
const express = require('express');
const fs = require('fs');
const multer = require('multer'); // a middleware to handle file uploads
const { Sequelize, DataTypes } = require('sequelize');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 8080;

// read environmental variables from User Data (/etc/environment) 
const envFilePath = '/etc/environment';
if (fs.existsSync(envFilePath)) {
    const envVars = fs.readFileSync(envFilePath, 'utf-8')
        .split('\n')
        .filter(line => line.includes('='))
        .map(line => line.trim().split('='));

    envVars.forEach(([key, value]) => {
        process.env[key] = value.replace(/^"|"$/g, ''); // 去除可能的双引号
    });
}

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, S3_BUCKET, AWS_REGION } = process.env;

// check if all envromental variables exist
if (!DB_HOST || !DB_PORT || !DB_USER || !DB_PASSWORD || !DB_NAME || !S3_BUCKET || !AWS_REGION) {
    console.error("Lack environmental variables，check User Data is configured correctly！");
    process.exit(1);
}

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
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

const File = sequelize.define('File', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    file_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    url: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    upload_date: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    timestamps: false
});

// s3 configuration
const s3 = new S3Client({ region: AWS_REGION });
const upload = multer({ storage: multer.memoryStorage() });

// authentication 
const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    next();
};

app.get('/healthz', async (req, res) => {
    if (
        (Object.keys(req.query).length > 0) ||
        (req.body && Object.keys(req.body).length > 0) ||
        (typeof req.body === 'string' && req.body.trim().length > 0)
    ) {
        return res.status(400).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
    }

    try {
        await sequelize.authenticate();
        try {
            await HealthCheck.create({});
        } catch (logError) {
            console.warn('Failed to log health check, but DB is still available:', logError);
        }

        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).status(200).end();
    } catch (error) {
        console.error('Database unavailable:', error);
        res.status(503).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
    }
});

app.all('/healthz', (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
    }
});


// Upload file
app.post('/v1/file', authenticate, upload.single('profilePic'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileKey = `${Date.now()}-${req.file.originalname}`;
    const uploadParams = {
        Bucket: S3_BUCKET,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
    };

    try {
        await s3.send(new PutObjectCommand(uploadParams));
        const fileRecord = await File.create({
            file_name: req.file.originalname,
            url: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${fileKey}`
        });
        res.status(201).json(fileRecord);
    } catch (error) {
        console.error("File upload failed:", error);
        res.status(400).json({ error: 'File upload failed' });
    }
});

// Unsupported HTTP methods return 405 Method Not Allowed
const unsupportedMethods = ['head', 'options', 'patch', 'put'];
unsupportedMethods.forEach(method => {
    app[method]('/v1/file', (req, res) => {
        res.status(405).json({ error: 'Method Not Allowed' });
    });
});

['head', 'options', 'patch', 'put', 'post'].forEach(method => {
    app[method]('/v1/file/:id', (req, res) => {
        res.status(405).json({ error: 'Method Not Allowed' });
    });
});

// Get all files - returns 400 Bad Request since it's not supported
app.get('/v1/file', (req, res) => {
    res.status(400).json({ error: 'Bad Request' });
});

// Delete all files - returns 400 Bad Request since it's not supported
app.delete('/v1/file', (req, res) => {
    res.status(400).json({ error: 'Bad Request' });
});

// Get file metadata
app.get('/v1/file/:id', authenticate, async (req, res) => {
    try {
        const file = await File.findByPk(req.params.id);
        if (!file) return res.status(404).json({ error: 'File not found' });
        res.status(200).json({
            file_name: file.file_name,
            id: file.id,
            url: file.url,
            upload_date: file.upload_date
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete file
app.delete('/v1/file/:id', authenticate, async (req, res) => {
    const file = await File.findByPk(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    await s3.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: new URL(file.url).pathname.substring(1),
    }));

    await file.destroy();
    res.status(204).send();
});

sequelize.authenticate()
    .then(() => sequelize.sync())
    .then(() => {
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.error('Database connection error:', err));

module.exports = app;
