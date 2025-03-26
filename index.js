require('dotenv').config();
const express = require('express');
const fs = require('fs');
const multer = require('multer'); // a middleware to handle file uploads
const { Sequelize, DataTypes } = require('sequelize');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
//第六次作业
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
    //文件名
    transports: [new winston.transports.File({ filename: path.join(logDir, 'app.log') }),
    //
    new winston.transports.Console() ]
});

// ========== Metrics setup ==========
const statsdtool = new StatsD({
    host: 'localhost',
    port: 8125,
    prefix: 'webapp.',
    errorHandler: (err) => logger.error('StatsD error:', err)
});
//

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

//看到这，再考虑要不中间件写所有
app.use((req, res, next) => {
    res.on('finish', () => {
        const logMsg = `${req.method} ${req.url} ${res.statusCode}`;
        if (res.statusCode >= 500) {
            logger.error(logMsg);
        } else if (res.statusCode >= 400) {
            logger.warn(logMsg);
        } else {
            logger.info(logMsg);
        }
    });
    next();
});

//

app.get('/healthz', async (req, res) => {
    //
    const start = Date.now();
    statsdtool.increment('api.healthz.call');   //这个命名不是固定的，但是就是小写加两个点
    //
    if (
        (Object.keys(req.query).length > 0) ||// if there are query parameters
        (req.body && Object.keys(req.body).length > 0) || // not empty req body
        (typeof req.body === 'string' && req.body.trim().length > 0) // not empty req body
    ) {
        //
        statsdtool.timing('api.healthz.response_time', Date.now() - start);
        //

        return res.status(400).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();

    }

    try {
        //
        const dbStart = Date.now();
        //
        await HealthCheck.create({});
        //
        statsdtool.timing('api.healthz.db_time', Date.now() - dbStart);

        statsdtool.timing('api.healthz.response_time', Date.now() - start);
        //
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        });

        return res.status(200).end();
    } catch (error) {
        //
        logger.error(`${req.method} ${req.url} ${res.statusCode} could not insert health record`, error);
        statsdtool.timing('api.healthz.response_time', Date.now() - start);
        //
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
        //
        logger.warn(`${req.method} ${req.url} ${res.statusCode} method not allowed`);
        statsdtool.increment('api.healthz.invalid_method');
        //
        return res.status(405).set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }).end();
    }

});


// upload file post method
app.post('/v1/file', upload.single('profilePic'), async (req, res) => {
    //
    const start = Date.now();
    statsdtool.increment('api.upload.call');

    if (!req.file || req.file.size === 0) {
        //
        logger.warn(`${req.method} ${req.url} ${res.statusCode} no file uploaded or empty file`);
        statsdtool.timing('api.upload.response_time', Date.now() - start);
        //
        return res.status(400).json({ error: 'Bad request because no file is uploaded or the uploaded file is empty' });
    }
    //
    const fileKey = `${Date.now()}-${req.file.originalname}`;
    const uploadParams = {
        Bucket: S3_BUCKET,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
    };

    try {
        //
        const s3Start = Date.now();
        //
        await s3C.send(new PutObjectCommand(uploadParams));
        //
        statsdtool.timing('api.upload.s3_time', Date.now() - s3Start);
        const dbStart = Date.now();
        //
        const fileRecord = await File.create({
            file_name: req.file.originalname,
            url: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${fileKey}`
        });
        //
        statsdtool.timing('api.upload.db_time', Date.now() - dbStart);
        statsdtool.timing('api.upload.response_time', Date.now() - start);
        //
        res.status(201).json(fileRecord);
    } catch (error) {
        //
        logger.error('Upload failed:', error);
        statsdtool.timing('api.upload.response_time', Date.now() - start);
        //
        res.status(400).json({ error: 'file upload failure' });
    }
});

// 405 method not allowed
const unsupportedMethods = ['head', 'options', 'patch', 'put'];
unsupportedMethods.forEach(method => {
    app[method]('/v1/file', (req, res) => {
        //
        logger.warn(`405 Method Not Allowed: ${method.toUpperCase()} /v1/file`);
        statsdtool.increment('api.file.unsupported_method');
        //
        res.status(405).json({ error: 'server responds with 405 Method Not Allowed' });
    });
});

['head', 'options', 'patch', 'put', 'post'].forEach(method => {
    app[method]('/v1/file/:id', (req, res) => {
        //
        logger.warn(`405 Method Not Allowed: ${method.toUpperCase()} /v1/file/:id`);
        statsdtool.increment('api.file.id.unsupported_method');
        //
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
    //
    const start = Date.now();
    statsdtool.increment('api.get_file.call');
    logger.info(`GET /v1/file/${req.params.id}`);

    const dbStart = Date.now();
    //

    const file = await File.findByPk(req.params.id);
    //
    statsdtool.timing('api.get_file.db_time', Date.now() - dbStart);
    //
    if (!file) {
        //
        logger.warn(`404 Not Found: File with id ${req.params.id}`);
        statsdtool.timing('api.get_file.response_time', Date.now() - start);
        //

        return res.status(404).json({ error: 'Not found' });
    }
    //
    statsdtool.timing('api.get_file.response_time', Date.now() - start);
    //
    res.status(200).json({
        file_name: file.file_name,
        id: file.id,
        url: file.url,
        upload_date: file.upload_date
    });

});

// delete file
app.delete('/v1/file/:id', async (req, res) => {
    //
    const start = Date.now();
    statsdtool.increment('api.delete_file.call');
    logger.info(`DELETE /v1/file/${req.params.id}`);

    const dbStart = Date.now();
    //
    const file = await File.findByPk(req.params.id);
    //
    statsdtool.timing('api.delete_file.db_time', Date.now() - dbStart);
    //
    if (!file) {
        //
        logger.warn(`404 Not Found: File with id ${req.params.id}`);
        statsdtool.timing('api.delete_file.response_time', Date.now() - start);
        //
        return res.status(404).json({ error: 'Not found' });
    }
    //
    const s3Start = Date.now();
    //
    await s3C.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: new URL(file.url).pathname.substring(1),
    }));
    //
    statsdtool.timing('api.delete_file.s3_time', Date.now() - s3Start);
    //
    await file.destroy();
    //
    statsdtool.timing('api.delete_file.response_time', Date.now() - start);
    //
    res.status(204).send();
});

sequelize.authenticate()
    .then(() => sequelize.sync())
    .then(() => {
        app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
    })
    .catch(err => console.error('Error in database connection:', err));

module.exports = app;
