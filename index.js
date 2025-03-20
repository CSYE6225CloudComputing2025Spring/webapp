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
const s3C = new S3Client({ region: AWS_REGION });
const upload = multer({ storage: multer.memoryStorage() });

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


// upload file post method
app.post('/v1/file', upload.single('profilePic'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Bad Request because no file is uploaded' });

    if (req.file.size === 0) {
        return res.status(400).json({ error: 'Bad Request because file uploaded is empty' });
    }

    const fileKey = `${Date.now()}-${req.file.originalname}`;
    const uploadParams = {
        Bucket: S3_BUCKET,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
    };

    try {
        await s3C.send(new PutObjectCommand(uploadParams));
        const fileRecord = await File.create({
            file_name: req.file.originalname,
            url: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${fileKey}`
        });
        res.status(201).json(fileRecord);
    } catch (error) {
        console.error("file upload failure:", error);
        res.status(400).json({ error: 'file upload failure' });
    }
});

// 405 method not allowed
const unsupportedMethods = ['head', 'options', 'patch', 'put'];
unsupportedMethods.forEach(method => {
    app[method]('/v1/file', (req, res) => {
        res.status(405).json({ error: 'server responds with 405 Method Not Allowed' });
    });
});

['head', 'options', 'patch', 'put', 'post'].forEach(method => {
    app[method]('/v1/file/:id', (req, res) => {
        res.status(405).json({ error: 'server responds with 405 Method Not Allowed' });
    });
});

// v1 file get - 400 Bad Request if no id
app.get('/v1/file', (req, res) => {
    res.status(400).json({ error: 'Bad Request' });
});

// v1 file delete - 400 Bad Request if no id
app.delete('/v1/file', (req, res) => {
    res.status(400).json({ error: 'Bad Request' });
});

// get file metadata(as swagger described) containing url
app.get('/v1/file/:id', async (req, res) => {
    try {
        const file = await File.findByPk(req.params.id);
        if (!file) return res.status(404).json({ error: 'Not found' });
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

// delete file
app.delete('/v1/file/:id', async (req, res) => {
    const file = await File.findByPk(req.params.id);
    if (!file) return res.status(404).json({ error: 'Not found' });
    await s3C.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: new URL(file.url).pathname.substring(1),
    }));
    await file.destroy();
    res.status(204).send();
});

sequelize.authenticate()
    .then(() => sequelize.sync())
    .then(() => {
        app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
    })
    .catch(err => console.error('Error in database connection:', err));

module.exports = app;
