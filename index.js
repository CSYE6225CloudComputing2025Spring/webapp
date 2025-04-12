require('dotenv').config();
const express = require('express');
const fs = require('fs');
const multer = require('multer'); // a middleware to handle file uploads
const { Sequelize, DataTypes } = require('sequelize');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const StatsD = require('hot-shots');
const winston = require('winston');
const path = require('path');

const {combine, timestamp, printf} = winston.format

const logDir = '/opt/csye6225/logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logger = winston.createLogger({
    format: combine(
        timestamp(),
        printf(info => `${info.timestamp} - ${info.level}: ${info.message}`)
    ),
    transports: [new winston.transports.File({ filename: path.join(logDir, 'app.log') }),
    new winston.transports.Console() ]
});

const statsdtool = new StatsD({
    host: 'localhost',
    port: 8125,
    prefix: 'webapp.',
    errorHandler: (err) => logger.error('StatsD error:', err)
});

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


app.use((req, res, next) => {
    res.on('finish', () => {
        const logMsg = `${req.method} ${req.url} ${res.statusCode}`;
        if (res.statusCode < 400) {
            logger.info(logMsg);
        }
    });
    next();
});

app.get('/healthz', async (req, res) => {
    const start = Date.now();
    statsdtool.increment('api.healthz.get.call_times');   
    if (
        (Object.keys(req.query).length > 0) ||// if there are query parameters
        (req.body && Object.keys(req.body).length > 0) || // not empty req body
        (typeof req.body === 'string' && req.body.trim().length > 0) // not empty req body
    ) {
        statsdtool.timing('api.healthz.get.process_duration', Date.now() - start);

        res.status(400).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
        logger.warn(`${req.method} ${req.url} ${res.statusCode}`);
        return; 

    }

    try {
        const dbStart = Date.now();
        await HealthCheck.create({});
        statsdtool.timing('api.healthz.db_duration', Date.now() - dbStart);
        statsdtool.timing('api.healthz.get.process_duration', Date.now() - start);
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        });

        return res.status(200).end();
    } catch (error) {
        statsdtool.timing('api.healthz.get.process_duration', Date.now() - start);
        res.status(503).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
        logger.error(`${req.method} ${req.url} ${res.statusCode} could not insert health record`, error);
        return;
    }
});

app.all('/healthz', (req, res) => {
    // Only HTTP GET the method is supported by the /healthz endpoint. All other methods should return HTTP code for Method Not Allowed.
    const start = Date.now();
    if (req.method !== 'GET') {
        statsdtool.increment('api.healthz.not_allowed_method.call_times');
    
        res.status(405).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
        statsdtool.timing('api.healthz.not_allowed_method.process_duration', Date.now() - start);
        logger.warn(`${req.method} ${req.url} ${res.statusCode} method not allowed`);
        return;
    }

});


// upload file post method
app.post('/v1/file', upload.single('profilePic'), async (req, res) => {
    
    const start = Date.now();
    statsdtool.increment('api.file.post.call_times');

    if (!req.file || req.file.size === 0) {
        
        statsdtool.timing('api.file.post.process_duration', Date.now() - start);
        
        res.status(400).json({ error: 'Bad request because no file is uploaded or the uploaded file is empty' });
        logger.warn(`${req.method} ${req.url} ${res.statusCode} no file uploaded or empty file`);
        return;
    }
    
    const fileKey = `${Date.now()}-${req.file.originalname}`;
    const uploadParams = {
        Bucket: S3_BUCKET,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
    };

    try {
        
        const s3Start = Date.now();
        
        await s3C.send(new PutObjectCommand(uploadParams));
        
        statsdtool.timing('api.s3_duration', Date.now() - s3Start);
        const dbStart = Date.now();
        
        const fileRecord = await File.create({
            file_name: req.file.originalname,
            url: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${fileKey}`
        });
        
        statsdtool.timing('api.file.post.db_duration', Date.now() - dbStart);
        statsdtool.timing('api.file.post.process_duration', Date.now() - start);
        
        res.status(201).json(fileRecord);
    } catch (error) {
        
        statsdtool.timing('api.file.post.process_duration', Date.now() - start);
        
        res.status(400).json({ error: 'file upload failure' });
        logger.error(`${req.method} ${req.url} ${res.statusCode} file upload failure`, error);
    }
});

// 405 method not allowed
const unsupportedMethods = ['head', 'options', 'patch', 'put'];
unsupportedMethods.forEach(method => {
    app[method]('/v1/file', (req, res) => {
        
        const start = Date.now();
        statsdtool.increment('api.file.not_allowed_method.call_times');
        
        res.status(405).json({ error: 'server responds with 405 Method Not Allowed' });
        statsdtool.timing('api.file.not_allowed_method.process_duration', Date.now() - start);
        logger.warn(`${req.method} ${req.url} ${res.statusCode} method not allowed`);
    });
});

['head', 'options', 'patch', 'put', 'post'].forEach(method => {
    app[method]('/v1/file/:id', (req, res) => {
        
        const start = Date.now();
        statsdtool.increment('api.file.id.not_allowed_method.call_times');
        
        res.status(405).json({ error: 'server responds with 405 Method Not Allowed' });
        statsdtool.timing('api.file.id.not_allowed_method.process_duration', Date.now() - start);
        logger.warn(`${req.method} ${req.url} ${res.statusCode} method not allowed`);
    });
});

// v1 file get - 400 Bad Request if no id
app.get('/v1/file', (req, res) => {
    const start = Date.now();
    statsdtool.increment('api.file.get.call_times');

    res.status(400).json({ error: 'Bad Request' });
    statsdtool.timing('api.file.get.process_duration', Date.now() - start);
    logger.warn(`${req.method} ${req.url} ${res.statusCode}`);
});

// v1 file delete - 400 Bad Request if no id
app.delete('/v1/file', (req, res) => {
    const start = Date.now();
    statsdtool.increment('api.file.delete.call_times');
    res.status(400).json({ error: 'Bad Request' });
    statsdtool.timing('api.file.delete.process_duration', Date.now() - start);
    logger.warn(`${req.method} ${req.url} ${res.statusCode}`);
});

// get file metadata(as swagger described) containing url
app.get('/v1/file/:id', async (req, res) => {
    
    const start = Date.now();
    statsdtool.increment('api.file.id.get.call_times');

    const dbStart = Date.now();

    const file = await File.findByPk(req.params.id);

    statsdtool.timing('api.file.id.get.db_duration', Date.now() - dbStart);
    
    if (!file) {
        
        statsdtool.timing('api.file.id.get.process_duration', Date.now() - start);
        

        res.status(404).json({ error: 'Not found' });
        logger.warn(`${req.method} ${req.url} ${res.statusCode}`);
        return;
        
    }
    
    statsdtool.timing('api.file.id.get.process_duration', Date.now() - start);
    
    res.status(200).json({
        file_name: file.file_name,
        id: file.id,
        url: file.url,
        upload_date: file.upload_date
    });

});

// delete file
app.delete('/v1/file/:id', async (req, res) => {
    
    const start = Date.now();
    statsdtool.increment('api.file.id.delete.call_times');
    logger.info(`DELETE /v1/file/${req.params.id}`);

    const dbStart = Date.now();
    
    const file = await File.findByPk(req.params.id);
    
    statsdtool.timing('api.file.id.delete.db_duration', Date.now() - dbStart);
    
    if (!file) {
        statsdtool.timing('api.file.id.delete.process_duration', Date.now() - start);
        
        res.status(404).json({ error: 'Not found' });
        logger.warn(`${req.method} ${req.url} ${res.statusCode}`);
        return;
    }
    
    const s3Start = Date.now();
    
    await s3C.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: new URL(file.url).pathname.substring(1),
    }));
    
    statsdtool.timing('api.s3_duration', Date.now() - s3Start);
    
    await file.destroy();
    
    statsdtool.timing('api.file.id.delete.process_duration', Date.now() - start);
    
    res.status(204).send();
});

// for demo
app.get('/cicd', async (req, res) => {
    const start = Date.now();
    statsdtool.increment('api.cicd.get.call_times');

    if (
        (Object.keys(req.query).length > 0) ||
        (req.body && Object.keys(req.body).length > 0) ||
        (typeof req.body === 'string' && req.body.trim().length > 0)
    ) {
        statsdtool.timing('api.cicd.get.process_duration', Date.now() - start);

        res.status(400).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
        logger.warn(`${req.method} ${req.url} ${res.statusCode}`);
        return;
    }

    try {
        const dbStart = Date.now();
        await HealthCheck.create({});
        statsdtool.timing('api.cicd.db_duration', Date.now() - dbStart);
        statsdtool.timing('api.cicd.get.process_duration', Date.now() - start);

        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        });

        return res.status(200).end();
    } catch (error) {
        statsdtool.timing('api.cicd.get.process_duration', Date.now() - start);

        res.status(503).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
        logger.error(`${req.method} ${req.url} ${res.statusCode} could not insert cicd health record`, error);
        return;
    }
});

app.all('/cicd', (req, res) => {
    if (req.method !== 'GET') {
        statsdtool.increment('api.cicd.not_allowed_method.call_times');

        res.status(405).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();

        statsdtool.timing('api.cicd.not_allowed_method.process_duration', Date.now());
        logger.warn(`${req.method} ${req.url} ${res.statusCode} method not allowed`);
    }
});

//

sequelize.authenticate()
    .then(() => sequelize.sync())
    .then(() => {
        if (require.main === module) {
            app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
        }
    })
    .catch(err => console.error('Error in database connection:', err));

module.exports = app;

