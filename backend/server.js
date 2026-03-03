const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const multer = require('multer'); // NEW: For handling file uploads
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

// Load environment variables (from project root)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin SDK for FCM
try {
    const serviceAccountPath = path.join(__dirname, '..', 'api', 'sidneymailer-firebase-adminsdk-fbsvc-727f67b825.json');

    let serviceAccount = null;

    // Option 1: Load from local file (development)
    if (fs.existsSync(serviceAccountPath)) {
        serviceAccount = require(serviceAccountPath);
        console.log('Firebase Admin: loaded credentials from local file');
    }
    // Option 2: Load from environment variable (Vercel / production)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('Firebase Admin: loaded credentials from environment variable');
    }

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin SDK initialized successfully');
    } else {
        console.warn('Firebase Admin SDK: No credentials found (set FIREBASE_SERVICE_ACCOUNT env var for production)');
    }
} catch (error) {
    console.error('Firebase Admin SDK init error:', error.message);
}

// NEW: Configure multer for memory storage (for in-memory file processing)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB max file size
    },
    fileFilter: (req, file, cb) => {
        // Allow only specific file types
        const allowedTypes = [
            '.xlsx', '.xls', '.csv', // Excel files
            '.pdf', // PDF files
            '.doc', '.docx', // Word documents
            '.txt', // Text files
            '.png', '.jpg', '.jpeg', // Image files
        ];

        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${ext} not allowed`));
        }
    }
});

// NEW: Create uploads directory if it doesn't exist
const uploadsDir = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow localhost for development
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }

        // Allow Vercel deployments
        if (origin.includes('.vercel.app')) {
            return callback(null, true);
        }

        // If specific origin needed
        if (process.env.ALLOWED_ORIGIN && origin === process.env.ALLOWED_ORIGIN) {
            return callback(null, true);
        }

        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' })); // NEW: Increased limit for base64 attachments
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(uploadsDir)); // Serve uploaded files

// Rate limiting for email sending
const emailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: 'Too many email requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Email configuration - Dual SMTP support
let creationTransporter;
let scheduleTransporter;

function createSmtpTransporter(username, password, displayName) {
    const smtpConfig = {
        host: process.env.SMTP_SERVER || 'mail.sidneyapparels.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: username,
            pass: password
        },
        tls: {
            rejectUnauthorized: false
        }
    };

    if (smtpConfig.host.includes('sidneyapparels.com')) {
        smtpConfig.requireTLS = true;
    }

    return nodemailer.createTransport(smtpConfig);
}

function initializeTransporters() {
    // Creation page transporter (management.trainee)
    creationTransporter = createSmtpTransporter(
        process.env.CREATION_SMTP_USERNAME,
        process.env.CREATION_SMTP_PASSWORD,
        process.env.CREATION_SMTP_DISPLAY_NAME
    );
    creationTransporter.verify(function (error, success) {
        if (error) console.error('Creation SMTP Error:', error.message);
        else console.log('Creation SMTP (management.trainee) ready');
    });

    // Schedule page transporter (planner)
    if (process.env.SCHEDULE_SMTP_USERNAME && process.env.SCHEDULE_SMTP_PASSWORD) {
        scheduleTransporter = createSmtpTransporter(
            process.env.SCHEDULE_SMTP_USERNAME,
            process.env.SCHEDULE_SMTP_PASSWORD,
            process.env.SCHEDULE_SMTP_DISPLAY_NAME
        );
        scheduleTransporter.verify(function (error, success) {
            if (error) console.error('Schedule SMTP Error:', error.message);
            else console.log('Schedule SMTP (planner) ready');
        });
    } else {
        console.warn('Schedule SMTP credentials not set - will fall back to creation transporter');
        scheduleTransporter = null;
    }
}

// Helper to get the right transporter config based on accountType
function getTransporterConfig(accountType) {
    if (accountType === 'schedule' && scheduleTransporter) {
        return {
            transporter: scheduleTransporter,
            sender: process.env.SCHEDULE_SMTP_USERNAME,
            displayName: process.env.SCHEDULE_SMTP_DISPLAY_NAME || 'Planning SA'
        };
    }
    // Default to creation
    return {
        transporter: creationTransporter,
        sender: process.env.CREATION_SMTP_USERNAME,
        displayName: process.env.CREATION_SMTP_DISPLAY_NAME || 'ME SA'
    };
}

// Backward compat: single transporter reference (used by update-smtp)
let transporter;
function initializeTransporter() {
    initializeTransporters();
    transporter = creationTransporter; // legacy fallback
}

// Initialize transporters
initializeTransporters();
transporter = creationTransporter;

// NEW: File upload endpoint for large attachments
app.post('/api/upload-attachment', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Generate unique filename
        const uniqueFilename = `${Date.now()}-${req.file.originalname}`;
        const filePath = path.join(uploadsDir, uniqueFilename);

        // Save file to disk
        fs.writeFileSync(filePath, req.file.buffer);

        res.json({
            success: true,
            message: 'File uploaded successfully',
            filename: uniqueFilename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype,
            url: `/uploads/${uniqueFilename}`
        });
    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload file',
            error: error.message
        });
    }
});

// NEW: Cleanup uploaded files endpoint
app.delete('/api/cleanup-files', (req, res) => {
    try {
        const { files } = req.body;

        if (!Array.isArray(files)) {
            return res.status(400).json({
                success: false,
                message: 'Files array required'
            });
        }

        let deletedCount = 0;
        let errors = [];

        files.forEach(filename => {
            try {
                const filePath = path.join(uploadsDir, filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (error) {
                errors.push({ filename, error: error.message });
            }
        });

        res.json({
            success: true,
            message: `Cleaned up ${deletedCount} files`,
            deletedCount,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clean up files',
            error: error.message
        });
    }
});

// NEW: Get file info endpoint
app.get('/api/file-info/:filename', (req, res) => {
    try {
        const filePath = path.join(uploadsDir, req.params.filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        const stats = fs.statSync(filePath);

        res.json({
            success: true,
            filename: req.params.filename,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
        });
    } catch (error) {
        console.error('File info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get file info',
            error: error.message
        });
    }
});

// Test endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Changeover Meeting Email Service',
        version: '1.0.0',
        features: ['email', 'attachments', 'bulk-email', 'smtp-config']
    });
});

// Test SMTP connection (Enhanced - supports accountType query param)
app.get('/api/test-smtp', emailLimiter, async (req, res) => {
    try {
        const accountType = req.query.account || 'creation';
        const config = getTransporterConfig(accountType);

        if (!config.sender) {
            return res.status(500).json({
                success: false,
                message: `SMTP Configuration Missing for account: ${accountType}`,
                error: `${accountType.toUpperCase()}_SMTP_USERNAME not set in environment variables`
            });
        }

        await config.transporter.verify();
        res.json({
            success: true,
            message: `SMTP connection successful (${accountType})`,
            details: {
                host: process.env.SMTP_SERVER || 'default',
                account: accountType,
                configCheck: {
                    host: (process.env.SMTP_SERVER || '').substring(0, 4) + '***',
                    user: (config.sender || '').substring(0, 4) + '***',
                    port: process.env.SMTP_PORT,
                    secure: process.env.SMTP_SECURE
                }
            }
        });
    } catch (error) {
        console.error('SMTP Verify Error:', error);
        res.status(500).json({
            success: false,
            message: 'SMTP connection failed',
            error: error.message,
            code: error.code
        });
    }
});

// UPDATED: Send email endpoint with attachment support and multi-SMTP
app.post('/api/send-email', emailLimiter, async (req, res) => {
    try {
        const {
            from,
            to,
            subject,
            html,
            cc,
            bcc,
            replyTo,
            attachments,
            accountType  // NEW: 'creation' or 'schedule'
        } = req.body;

        // Validate required fields
        if (!from || !to || !subject || !html) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: from, to, subject, or html'
            });
        }

        // NEW: Validate attachments size
        if (attachments && Array.isArray(attachments)) {
            const totalSize = attachments.reduce((sum, att) => sum + (att.size || 0), 0);
            const maxTotalSize = 25 * 1024 * 1024; // 25MB

            if (totalSize > maxTotalSize) {
                return res.status(400).json({
                    success: false,
                    message: `Total attachment size (${(totalSize / 1024 / 1024).toFixed(2)}MB) exceeds limit of 25MB`
                });
            }

            for (const attachment of attachments) {
                if (attachment.size > 10 * 1024 * 1024) {
                    return res.status(400).json({
                        success: false,
                        message: `File ${attachment.filename} exceeds 10MB limit`
                    });
                }
            }
        }

        // Select the right SMTP account
        const config = getTransporterConfig(accountType || 'creation');
        const authenticatedSender = config.sender;
        console.log(`Using ${accountType || 'creation'} SMTP account: ${authenticatedSender}`);

        const mailOptions = {
            from: {
                name: config.displayName,
                address: authenticatedSender
            },
            to: Array.isArray(to) ? to : to.split(',').map(email => email.trim()),
            subject: subject,
            html: html,
            text: html.replace(/<[^>]*>/g, ' '),
            replyTo: replyTo || from || authenticatedSender,
            headers: {
                'X-Application': 'Changeover Meeting Initiator',
                'X-Priority': '1',
                'X-Attachments-Count': attachments ? attachments.length : 0
            }
        };

        if (cc) {
            mailOptions.cc = Array.isArray(cc) ? cc : cc.split(',').map(email => email.trim());
        }
        if (bcc) {
            mailOptions.bcc = Array.isArray(bcc) ? bcc : bcc.split(',').map(email => email.trim());
        }

        if (attachments && Array.isArray(attachments)) {
            mailOptions.attachments = attachments.map(attachment => {
                if (attachment.content) {
                    return {
                        filename: attachment.filename,
                        content: attachment.content,
                        encoding: 'base64',
                        contentType: attachment.contentType || getMimeType(attachment.filename),
                        cid: attachment.cid
                    };
                } else if (attachment.path) {
                    const filePath = path.join(uploadsDir, attachment.path);
                    if (fs.existsSync(filePath)) {
                        return {
                            filename: attachment.filename || path.basename(filePath),
                            path: filePath,
                            contentType: attachment.contentType || getMimeType(attachment.filename)
                        };
                    }
                }
                return attachment;
            }).filter(att => att);
        }

        // Send email using the selected transporter
        const info = await config.transporter.sendMail(mailOptions);

        console.log('Email sent:', info.messageId, '| Account:', accountType || 'creation');
        console.log('Attachments:', attachments ? attachments.length : 0);

        if (attachments && attachments.length > 0) {
            console.log('Attachment details:', attachments.map(att => ({
                filename: att.filename,
                size: att.size ? (att.size / 1024).toFixed(2) + 'KB' : 'unknown',
                type: att.contentType
            })));
        }

        res.json({
            success: true,
            message: 'Email sent successfully',
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            account: accountType || 'creation',
            attachmentsCount: attachments ? attachments.length : 0,
            attachments: attachments ? attachments.map(att => att.filename) : []
        });

    } catch (error) {
        console.error('Error sending email:', error);

        let errorMessage = 'Failed to send email';
        let statusCode = 500;

        if (error.code === 'EAUTH') {
            errorMessage = 'Authentication failed. Check your email credentials.';
            statusCode = 401;
        } else if (error.code === 'ECONNECTION') {
            errorMessage = 'Connection to SMTP server failed. Check server settings.';
            statusCode = 503;
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = 'Connection timed out. Please try again.';
            statusCode = 504;
        } else if (error.code === 'EENVELOPE') {
            errorMessage = 'Invalid email envelope. Check recipient addresses.';
            statusCode = 400;
        }

        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: error.message,
            code: error.code,
            attachmentsCount: req.body.attachments ? req.body.attachments.length : 0
        });
    }
});

// NEW: Helper function to get MIME type from filename
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.csv': 'text/csv',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed'
    };

    return mimeTypes[ext] || 'application/octet-stream';
}

// NEW: Validate attachment endpoint
app.post('/api/validate-attachments', upload.array('files', 10), (req, res) => {
    try {
        const files = req.files || [];
        const maxFileSize = 10 * 1024 * 1024; // 10MB
        const maxTotalSize = 25 * 1024 * 1024; // 25MB

        const validationResults = files.map(file => {
            const isValid = file.size <= maxFileSize;
            return {
                filename: file.originalname,
                size: file.size,
                isValid,
                error: isValid ? null : `File exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
                mimeType: file.mimetype
            };
        });

        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const isTotalSizeValid = totalSize <= maxTotalSize;

        res.json({
            success: true,
            files: validationResults,
            totalSize,
            isTotalSizeValid,
            maxFileSize,
            maxTotalSize,
            message: `Validated ${files.length} files, total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`
        });
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate attachments',
            error: error.message
        });
    }
});

// Bulk email endpoint (for multiple recipients) - Updated for attachments + multi-SMTP
app.post('/api/send-bulk', emailLimiter, async (req, res) => {
    try {
        const {
            from,
            recipients,
            subject,
            html,
            bccAll,
            attachments,
            accountType  // NEW: 'creation' or 'schedule'
        } = req.body;

        if (!from || !recipients || !subject || !html) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        let preparedAttachments = [];
        if (attachments && Array.isArray(attachments)) {
            preparedAttachments = attachments.map(attachment => {
                if (attachment.content) {
                    return {
                        filename: attachment.filename,
                        content: attachment.content,
                        encoding: 'base64',
                        contentType: attachment.contentType || getMimeType(attachment.filename)
                    };
                }
                return attachment;
            });
        }

        const results = [];
        const errors = [];

        // Select the right SMTP account
        const config = getTransporterConfig(accountType || 'creation');
        const authenticatedSender = config.sender;
        console.log(`Bulk send using ${accountType || 'creation'} SMTP account: ${authenticatedSender}`);

        for (const recipient of recipients) {
            try {
                const mailOptions = {
                    from: {
                        name: config.displayName,
                        address: authenticatedSender
                    },
                    to: recipient,
                    subject: subject,
                    html: html,
                    text: html.replace(/<[^>]*>/g, ' '),
                    replyTo: from || authenticatedSender,
                    headers: {
                        'X-Application': 'Changeover Meeting Initiator'
                    }
                };

                if (preparedAttachments.length > 0) {
                    mailOptions.attachments = preparedAttachments;
                }

                const info = await config.transporter.sendMail(mailOptions);
                results.push({
                    recipient,
                    success: true,
                    messageId: info.messageId,
                    attachmentsCount: preparedAttachments.length
                });

                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                errors.push({
                    recipient,
                    error: error.message,
                    attachmentsCount: preparedAttachments.length
                });
            }
        }

        res.json({
            success: true,
            message: `Sent ${results.length} emails successfully`,
            totalRecipients: recipients.length,
            account: accountType || 'creation',
            results,
            errors: errors.length > 0 ? errors : undefined,
            attachmentsCount: preparedAttachments.length
        });

    } catch (error) {
        console.error('Bulk email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send bulk emails',
            error: error.message
        });
    }
});

// Update SMTP settings endpoint
app.post('/api/update-smtp', async (req, res) => {
    try {
        const { server, port, username, password, encryption } = req.body;

        // Update environment variables (in memory for this session)
        if (server) process.env.SMTP_SERVER = server;
        if (port) process.env.SMTP_PORT = port;
        if (username) process.env.SMTP_USERNAME = username;
        if (password) process.env.SMTP_PASSWORD = password;
        if (encryption) process.env.SMTP_SECURE = (encryption === 'SSL').toString();

        // Reinitialize transporter with new settings
        initializeTransporter();

        // Test the new connection
        await transporter.verify();

        res.json({
            success: true,
            message: 'SMTP settings updated and verified'
        });

    } catch (error) {
        console.error('Update SMTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update SMTP settings',
            error: error.message
        });
    }
});

// NEW: Get system info endpoint
app.get('/api/system-info', (req, res) => {
    try {
        // Get uploads directory info
        let uploadsInfo = {};
        try {
            if (fs.existsSync(uploadsDir)) {
                const files = fs.readdirSync(uploadsDir);
                const totalSize = files.reduce((sum, file) => {
                    const filePath = path.join(uploadsDir, file);
                    const stats = fs.statSync(filePath);
                    return sum + stats.size;
                }, 0);

                uploadsInfo = {
                    fileCount: files.length,
                    totalSize: totalSize,
                    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
                };
            }
        } catch (error) {
            console.error('Error reading uploads directory:', error);
        }

        res.json({
            success: true,
            system: {
                version: '2.6.0',
                features: ['attachments', 'bulk-email', 'smtp-config'],
                limits: {
                    maxFileSize: '10MB',
                    maxTotalSize: '25MB',
                    maxAttachments: 10
                }
            },
            storage: uploadsInfo,
            smtp: {
                host: process.env.SMTP_SERVER,
                port: process.env.SMTP_PORT,
                user: process.env.SMTP_USERNAME ? 'Configured' : 'Not configured'
            }
        });
    } catch (error) {
        console.error('System info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get system info',
            error: error.message
        });
    }
});

// NEW: Cleanup old files on startup (files older than 24 hours)
function cleanupOldFiles() {
    try {
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;

            files.forEach(file => {
                const filePath = path.join(uploadsDir, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtime.getTime() > oneDay) {
                    fs.unlinkSync(filePath);
                    console.log(`Cleaned up old file: ${file}`);
                }
            });
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// =============================================
// FCM Push Notifications
// =============================================
app.post('/api/send-notification', async (req, res) => {
    try {
        const { title, body, qcoId, data } = req.body;

        if (!title || !body) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: title, body'
            });
        }

        // Check if Firebase Admin is initialized
        if (!admin.apps.length) {
            return res.status(500).json({
                success: false,
                message: 'Firebase Admin SDK not initialized'
            });
        }

        // Load all FCM tokens from Firestore
        const db = admin.firestore();
        const tokensSnapshot = await db.collection('fcm_tokens').get();

        if (tokensSnapshot.empty) {
            return res.json({
                success: true,
                message: 'No devices registered for notifications',
                successCount: 0
            });
        }

        const tokens = tokensSnapshot.docs.map(doc => doc.data().token).filter(Boolean);

        if (tokens.length === 0) {
            return res.json({
                success: true,
                message: 'No valid tokens found',
                successCount: 0
            });
        }

        console.log(`[FCM] Sending notification to ${tokens.length} devices`);

        // Send as DATA-ONLY message (no 'notification' key).
        // This ensures onBackgroundMessage always fires in the service worker
        // so we control the notification display, icon, vibration, and sound.
        const message = {
            data: {
                title: title,
                body: body,
                ...(data ? Object.fromEntries(
                    Object.entries(data).map(([k, v]) => [k, String(v)])
                ) : {})
            },
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        console.log(`[FCM] Success: ${response.successCount}, Failures: ${response.failureCount}`);

        // Clean up invalid tokens
        if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    if (errorCode === 'messaging/invalid-registration-token' ||
                        errorCode === 'messaging/registration-token-not-registered') {
                        invalidTokens.push(tokens[idx]);
                    }
                }
            });

            // Delete invalid tokens from Firestore
            if (invalidTokens.length > 0) {
                const batch = db.batch();
                invalidTokens.forEach(token => {
                    batch.delete(db.collection('fcm_tokens').doc(token));
                });
                await batch.commit();
                console.log(`[FCM] Cleaned up ${invalidTokens.length} invalid tokens`);
            }
        }

        res.json({
            success: true,
            message: `Notification sent to ${response.successCount} devices`,
            successCount: response.successCount,
            failureCount: response.failureCount
        });

    } catch (error) {
        console.error('[FCM] Send notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send notification',
            error: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);

    // Handle multer errors
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 25MB.'
            });
        }
        return res.status(400).json({
            success: false,
            message: `File upload error: ${err.message}`
        });
    }

    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Start server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Email server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`SMTP Server: ${process.env.SMTP_SERVER || 'Not configured'}`);
        console.log(`Uploads directory: ${uploadsDir}`);
        console.log(`Attachment system: Enabled (max 10MB/file, 25MB total)`);

        // Cleanup old files on startup
        cleanupOldFiles();

        // Schedule cleanup every hour
        setInterval(cleanupOldFiles, 60 * 60 * 1000);
    });
}

module.exports = app;