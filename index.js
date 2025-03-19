require('dotenv').config();
const express = require('express');
const fs = require('fs');
const multer = require('multer'); // a middleware to handle file uploads
const { Sequelize, DataTypes } = require('sequelize');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

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
    console.error("Lack environmental variables，check User Data or SystemD is configured correctly！");
    process.exit(1);
}

// app.use(express.text({ type: '*/*' }));
// app.use(express.urlencoded({ extended: true }));

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    dialect: 'mysql',
    // port: process.env.DB_PORT,
    logging: false,
});

const File = sequelize.define('File', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    fileName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    filePath: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    }, //S3 url
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

// sequelize.sync()
    //.then(() => console.log('Database is connected and table is ready'))
    //.catch(err => console.error('syncing database error :', err));

// s3 configuration
const s3 = new S3Client({ region: AWS_REGION });// environment variable
const upload = multer({storage: multer.memoryStorage() });

/**
 * @route POST /upload
 * @desc Uploads file to S3 and stores metadata in database
 */
app.post('/upload', upload.single('file'), async(req, res) => {
    if (!req.file) return res.status(400).json({error: 'No file uploaded'});
    const fileKey = `${Date.now()}-${req.file.originalname}`;
    const uploadParams = {
        Bucket: S3_BUCKET,
        Key:fileKey,
        Body:req.file.buffer,
        ContentType: req.file.mimetype,
    };

    try {
        const command = new PutObjectCommand(uploadParams);
        await s3.send(command);

        const fileRecord = await File.create({
            fileName: req.file.originalname,
            filePath: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${fileKey}`
        });
        res.status(201).json(fileRecord);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route GET /files/:id
 * @desc Get file metadata (S3 path)
 */
app.get('/files/:id', async (req, res) => {
    const file = await File.findByPk(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json({ filePath: file.filePath });
});

/**
 * @route DELETE /files/:id
 * @desc Hard deletes file from DB & S3
 */
app.delete('/files/:id', async(req, res)=>{
    const file = await File.findByPk(req.params.id);
    if (!file) return res.status(404).json({error: 'File not found'});
    const deleteParams = { Bucket: S3_BUCKET, Key: new URL(file.filePath).pathname.substring(1) };
    try {
        const command = new DeleteObjectCommand(deleteParams);
        await s3.send(command);

        await file.destroy();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

sequelize.authenticate()
    .then(() => {
        console.log('Database connection verified');
        return sequelize.sync();
    })
    .then(() => {
        console.log('Database connected');
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.error('Database connection error:', err));

