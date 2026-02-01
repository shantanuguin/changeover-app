const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const multer = require('multer'); // NEW: For handling file uploads
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

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

// Email configuration
let transporter;

function initializeTransporter() {
    const smtpConfig = {
        host: process.env.SMTP_SERVER || 'mail.sidneyapparels.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USERNAME,
            pass: process.env.SMTP_PASSWORD
        },
        tls: {
            // Remove SSLv3 as it is insecure and often blocked. 
            // Let Nodemailer/Node.js negotiate the best version (preferring TLS 1.2+)
            rejectUnauthorized: false
        }
    };

    // Sidney Apparels specific settings
    if (smtpConfig.host.includes('sidneyapparels.com')) {
        smtpConfig.requireTLS = true;
        // The above setting ensures TLS is used if possible.
    }

    transporter = nodemailer.createTransport(smtpConfig);

    // Verify connection configuration
    transporter.verify(function (error, success) {
        if (error) {
            console.error('SMTP Connection Error:', error);
        } else {
            console.log('SMTP Server is ready to take messages');
        }
    });
}

// Initialize transporter
initializeTransporter();

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

// Test SMTP connection
app.get('/api/test-smtp', emailLimiter, async (req, res) => {
    try {
        await transporter.verify();
        res.json({
            success: true,
            message: 'SMTP connection successful'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'SMTP connection failed',
            error: error.message
        });
    }
});

// UPDATED: Send email endpoint with attachment support
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
            attachments
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

            // Validate individual file sizes
            for (const attachment of attachments) {
                if (attachment.size > 10 * 1024 * 1024) {
                    return res.status(400).json({
                        success: false,
                        message: `File ${attachment.filename} exceeds 10MB limit`
                    });
                }
            }
        }

        // Prepare email options
        const mailOptions = {
            from: {
                name: process.env.SMTP_DISPLAY_NAME || 'Changeover Meeting System',
                address: from
            },
            to: Array.isArray(to) ? to : to.split(',').map(email => email.trim()),
            subject: subject,
            html: html,
            text: html.replace(/<[^>]*>/g, ' '), // Convert HTML to plain text
            replyTo: replyTo || from,
            headers: {
                'X-Application': 'Changeover Meeting Initiator',
                'X-Priority': '1', // High priority
                'X-Attachments-Count': attachments ? attachments.length : 0
            }
        };

        // Add CC if provided
        if (cc) {
            mailOptions.cc = Array.isArray(cc) ? cc : cc.split(',').map(email => email.trim());
        }

        // Add BCC if provided
        if (bcc) {
            mailOptions.bcc = Array.isArray(bcc) ? bcc : bcc.split(',').map(email => email.trim());
        }

        // UPDATED: Process attachments if provided
        if (attachments && Array.isArray(attachments)) {
            mailOptions.attachments = attachments.map(attachment => {
                // Handle both base64 content and file paths
                if (attachment.content) {
                    // Base64 content from frontend
                    return {
                        filename: attachment.filename,
                        content: attachment.content,
                        encoding: 'base64',
                        contentType: attachment.contentType || getMimeType(attachment.filename),
                        cid: attachment.cid // For embedded images
                    };
                } else if (attachment.path) {
                    // File path from upload
                    const filePath = path.join(uploadsDir, attachment.path);
                    if (fs.existsSync(filePath)) {
                        return {
                            filename: attachment.filename || path.basename(filePath),
                            path: filePath,
                            contentType: attachment.contentType || getMimeType(attachment.filename)
                        };
                    }
                }

                // If no content or path, return as-is (nodemailer will handle it)
                return attachment;
            }).filter(att => att); // Remove null entries
        }

        // Send email
        const info = await transporter.sendMail(mailOptions);

        console.log('Email sent:', info.messageId);
        console.log('Attachments:', attachments ? attachments.length : 0);

        // NEW: Log attachment details
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
            attachmentsCount: attachments ? attachments.length : 0,
            attachments: attachments ? attachments.map(att => att.filename) : []
        });

    } catch (error) {
        console.error('Error sending email:', error);

        // Specific error handling
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

// Bulk email endpoint (for multiple recipients) - Updated for attachments
app.post('/api/send-bulk', emailLimiter, async (req, res) => {
    try {
        const {
            from,
            recipients,
            subject,
            html,
            bccAll,
            attachments
        } = req.body;

        if (!from || !recipients || !subject || !html) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // NEW: Prepare attachments for bulk sending
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

        // Send to each recipient
        for (const recipient of recipients) {
            try {
                const mailOptions = {
                    from: {
                        name: process.env.SMTP_DISPLAY_NAME || 'Changeover Meeting System',
                        address: from
                    },
                    to: recipient,
                    subject: subject,
                    html: html,
                    text: html.replace(/<[^>]*>/g, ' '),
                    headers: {
                        'X-Application': 'Changeover Meeting Initiator'
                    }
                };

                // Add attachments if available
                if (preparedAttachments.length > 0) {
                    mailOptions.attachments = preparedAttachments;
                }

                const info = await transporter.sendMail(mailOptions);
                results.push({
                    recipient,
                    success: true,
                    messageId: info.messageId,
                    attachmentsCount: preparedAttachments.length
                });

                // Delay to avoid rate limiting
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