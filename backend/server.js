// server.js - Backend Server
const express = require('express');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const cors = require('cors');
const chokidar = require('chokidar');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const sql = require('mssql');

const app = express();
const PORT = 3002;
const EXCEL_FILE_PATH = path.join(__dirname, '..', 'sample_data', 'input.xlsx');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const RESET_TOKEN_EXPIRY = 3600000; // 1 hour in milliseconds

// SQL Server configuration
const sqlConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'YourStrong@Passw0rd',
    database: process.env.DB_NAME || 'TidalJobs',
    server: process.env.DB_SERVER || 'localhost',
    options: {
        encrypt: true, // For Azure SQL
        trustServerCertificate: true, // For local dev / self-signed certs
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Data source configuration
const DATA_SOURCE = process.env.DATA_SOURCE || 'excel'; // 'excel' or 'database'

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage for jobs data
let jobsData = [];
let lastUpdated = null;

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASSWORD || 'your-app-specific-password'
    }
});

// Password reset tokens store
const resetTokens = new Map();

// User store with plain passwords (will be hashed on server start)
const users = [
    {
        id: 1,
        username: 'admin',
        plainPassword: 'Admin@123',
        role: 'admin',
        email: 'admin@example.com',
        fullName: 'System Administrator'
    },
    {
        id: 2,
        username: 'viewer',
        plainPassword: 'Viewer@123',
        role: 'viewer',
        email: 'viewer@example.com',
        fullName: 'System Viewer'
    }
];

// Hash passwords on server start
const initializeUsers = async () => {
    for (const user of users) {
        user.password = await bcrypt.hash(user.plainPassword, 10);
        delete user.plainPassword; // Remove plain password after hashing
    }
    console.log('User passwords hashed successfully');
};

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Utility functions
const parseDateTime = (dateTimeStr) => {
    if (!dateTimeStr || dateTimeStr.trim() === '') return null;
    try {
        return new Date(dateTimeStr.trim());
    } catch (error) {
        console.error('Error parsing date:', dateTimeStr, error);
        return null;
    }
};

const calculateDuration = (startTime, endTime) => {
    if (!startTime) return null;
    if (!endTime) return 'Running';
    
    const start = parseDateTime(startTime);
    const end = parseDateTime(endTime);
    
    if (!start || !end) return 'Invalid';
    
    const duration = end - start;
    if (duration < 0) return 'Invalid';
    
    const minutes = Math.floor(duration / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
};

const determineStatus = (startTime, endTime) => {
    const start = parseDateTime(startTime);
    const end = parseDateTime(endTime);
    
    if (!start) return 'failed';
    if (!end) return 'running';
    
    const duration = end - start;
    // Consider jobs delayed if they run for more than 2 hours
    if (duration > 2 * 60 * 60 * 1000) return 'delayed';
    return 'completed';
};

const processJobData = (job) => {
    return {
        ...job,
        status: determineStatus(job.startTime, job.endTime),
        duration: calculateDuration(job.startTime, job.endTime),
        startTimeParsed: parseDateTime(job.startTime),
        endTimeParsed: parseDateTime(job.endTime)
    };
};

// Excel file processing
const loadJobsFromExcel = () => {
    return new Promise((resolve, reject) => {
        try {
            if (!fs.existsSync(EXCEL_FILE_PATH)) {
                console.log(`Excel file not found at ${EXCEL_FILE_PATH}`);
                resolve([]);
                return;
            }

            const workbook = xlsx.readFile(EXCEL_FILE_PATH);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const excelData = xlsx.utils.sheet_to_json(sheet, { raw: true });

            const jobs = excelData.map(row => {
                const job = {
                    id: `${row.jobName}_${Date.now()}_${Math.random()}`,
                    jobName: row.jobName ? String(row.jobName).trim() : '',
                    startTime: row.startTime ? String(row.startTime).trim() : '',
                    endTime: row.endTime ? String(row.endTime).trim() : '',
                    dependency: row.dependency ? String(row.dependency).trim() : '',
                    description: row.description ? String(row.description).trim() : '',
                    priority: row.priority ? String(row.priority).trim() : 'normal'
                };
                return processJobData(job);
            });

            console.log(`Loaded ${jobs.length} jobs from Excel`);
            resolve(jobs);
        } catch (error) {
            console.error('Error loading Excel file:', error);
            reject(error);
        }
    });
};

// Database query functions
const loadJobsFromDatabase = async () => {
    try {
        await sql.connect(sqlConfig);
        
        // Get metrics from the view
        const metricsResult = await sql.query('SELECT * FROM vw_job_metrics');
        const metrics = metricsResult.recordset[0];
        
        // Get paginated jobs using the stored procedure
        const jobsResult = await sql.query`
            EXEC sp_GetJobs 
                @PageSize = ${50},
                @PageNumber = ${1},
                @SearchTerm = ${null},
                @Status = ${null},
                @Priority = ${null}
        `;
        
        const jobs = jobsResult.recordset.map(job => ({
            id: job.id.toString(),
            jobName: job.job_name,
            startTime: job.start_time ? job.start_time.toISOString() : null,
            endTime: job.end_time ? job.end_time.toISOString() : null,
            dependency: job.dependency,
            description: job.description,
            priority: job.priority,
            status: job.status,
            duration: job.duration_minutes ? `${job.duration_minutes}m` : 'Running'
        }));

        console.log(`Loaded ${jobs.length} jobs from database`);
        return { jobs, metrics };
    } catch (error) {
        console.error('Error loading jobs from database:', error);
        throw error;
    } finally {
        await sql.close();
    }
};

// Modify initializeJobs to support both data sources
const initializeJobs = async () => {
    try {
        if (DATA_SOURCE === 'database') {
            const { jobs, metrics } = await loadJobsFromDatabase();
            jobsData = jobs;
            lastUpdated = new Date();
            console.log('Jobs data initialized from', DATA_SOURCE);
        } else {
            jobsData = await loadJobsFromExcel();
            lastUpdated = new Date();
            console.log('Jobs data initialized from', DATA_SOURCE);
        }
    } catch (error) {
        console.error('Failed to initialize jobs data:', error);
        jobsData = [];
    }
};

// File watcher for automatic updates
const watchExcelFile = () => {
    if (fs.existsSync(EXCEL_FILE_PATH)) {
        const watcher = chokidar.watch(EXCEL_FILE_PATH, {
            ignored: /^\./,
            persistent: true,
            ignoreInitial: true
        });

        watcher.on('change', async () => {
            console.log('Excel file changed, reloading data...');
            await initializeJobs();
        });

        console.log(`Watching Excel file: ${EXCEL_FILE_PATH}`);
    }
};

// Function to create a new user
const createUser = async (userData) => {
    try {
        // Validate required fields
        if (!userData.username || !userData.plainPassword || !userData.role) {
            throw new Error('Username, password, and role are required');
        }

        // Check if username already exists
        if (users.some(u => u.username === userData.username)) {
            throw new Error('Username already exists');
        }

        // Create new user object
        const newUser = {
            id: users.length + 1,
            username: userData.username,
            plainPassword: userData.plainPassword,
            role: userData.role,
            email: userData.email || '',
            fullName: userData.fullName || userData.username
        };

        // Add to users array
        users.push(newUser);

        // Hash the password
        newUser.password = await bcrypt.hash(newUser.plainPassword, 10);
        delete newUser.plainPassword;

        console.log(`New user created: ${newUser.username} (${newUser.role})`);
        return newUser;
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
};

// Function to generate reset token
const generateResetToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Function to send reset email
const sendResetEmail = async (email, resetToken) => {
    const resetUrl = `http://localhost:3002/reset-password?token=${resetToken}`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: email,
        subject: 'Password Reset Request',
        html: `
            <h1>Password Reset Request</h1>
            <p>You requested a password reset. Click the link below to reset your password:</p>
            <a href="${resetUrl}">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Reset email sent to:', email);
        return true;
    } catch (error) {
        console.error('Error sending reset email:', error);
        return false;
    }
};

// API Routes

// Authentication
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Login attempt for username:', username);

        if (!username || !password) {
            console.log('Missing username or password');
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = users.find(u => u.username === username);
        if (!user) {
            console.log('User not found:', username);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        console.log('Password validation result:', validPassword);
        
        if (!validPassword) {
            console.log('Invalid password for user:', username);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('Login successful for user:', username);

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error during login' });
    }
});

// Test route to verify password hashing
app.post('/api/auth/test-hash', async (req, res) => {
    try {
        const { password } = req.body;
        const hash = await bcrypt.hash(password, 10);
        const isValid = await bcrypt.compare(password, hash);
        
        res.json({
            originalPassword: password,
            hash,
            isValid
        });
    } catch (error) {
        console.error('Hash test error:', error);
        res.status(500).json({ error: 'Hash test failed' });
    }
});

// Modify the jobs endpoint to support both data sources
app.get('/api/jobs', authenticateToken, async (req, res) => {
    try {
        const { 
            search, 
            status, 
            priority, 
            page = 1, 
            pageSize = 50 
        } = req.query;

        if (DATA_SOURCE === 'database') {
            await sql.connect(sqlConfig);
            
            // Get paginated jobs using the stored procedure
            const jobsResult = await sql.query`
                EXEC sp_GetJobs 
                    @PageSize = ${parseInt(pageSize)},
                    @PageNumber = ${parseInt(page)},
                    @SearchTerm = ${search || null},
                    @Status = ${status === 'all' ? null : status},
                    @Priority = ${priority === 'all' ? null : priority}
            `;
            
            const jobs = jobsResult.recordset.map(job => ({
                id: job.id.toString(),
                jobName: job.job_name,
                startTime: job.start_time ? job.start_time.toISOString() : null,
                endTime: job.end_time ? job.end_time.toISOString() : null,
                dependency: job.dependency,
                description: job.description,
                priority: job.priority,
                status: job.status,
                duration: job.duration_minutes ? `${job.duration_minutes}m` : 'Running'
            }));

            // Get total count
            const countResult = await sql.query`
                SELECT COUNT(*) as total_count
                FROM jobs
                WHERE (@SearchTerm IS NULL OR 
                       job_name LIKE '%' + @SearchTerm + '%' OR 
                       description LIKE '%' + @SearchTerm + '%' OR
                       dependency LIKE '%' + @SearchTerm + '%')
                AND (@Status IS NULL OR status = @Status)
                AND (@Priority IS NULL OR priority = @Priority)
            `;

            res.json({
                jobs,
                totalCount: countResult.recordset[0].total_count,
                lastUpdated: new Date(),
                dataSource: DATA_SOURCE
            });
        } else {
            // Existing Excel file handling code
            let filteredJobs = [...jobsData];

            if (search) {
                const searchTerm = search.toLowerCase();
                filteredJobs = filteredJobs.filter(job => 
                    job.jobName.toLowerCase().includes(searchTerm) ||
                    job.dependency.toLowerCase().includes(searchTerm) ||
                    (job.description && job.description.toLowerCase().includes(searchTerm))
                );
            }

            if (status && status !== 'all') {
                filteredJobs = filteredJobs.filter(job => job.status === status);
            }

            if (priority && priority !== 'all') {
                filteredJobs = filteredJobs.filter(job => job.priority === priority);
            }

            const totalCount = filteredJobs.length;
            const startIndex = (parseInt(page) - 1) * parseInt(pageSize);
            const endIndex = startIndex + parseInt(pageSize);
            const paginatedJobs = filteredJobs.slice(startIndex, endIndex);

            res.json({
                jobs: paginatedJobs,
                totalCount,
                lastUpdated,
                dataSource: DATA_SOURCE
            });
        }
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (DATA_SOURCE === 'database') {
            await sql.close();
        }
    }
});

// Modify the metrics endpoint to use the view
app.get('/api/jobs/metrics', authenticateToken, async (req, res) => {
    try {
        if (DATA_SOURCE === 'database') {
            await sql.connect(sqlConfig);
            const result = await sql.query('SELECT * FROM vw_job_metrics');
            const metrics = result.recordset[0];
            
            res.json({
                total: metrics.total_jobs,
                completed: metrics.completed_jobs,
                running: metrics.running_jobs,
                failed: metrics.failed_jobs,
                delayed: metrics.delayed_jobs,
                avgRunTimeMinutes: Math.round(metrics.avg_duration_minutes || 0),
                priorityDistribution: {
                    high: metrics.high_priority_jobs,
                    normal: metrics.normal_priority_jobs,
                    low: metrics.low_priority_jobs
                },
                lastUpdated: new Date()
            });
        } else {
            // Existing Excel metrics calculation code
            const total = jobsData.length;
            const completed = jobsData.filter(job => job.status === 'completed').length;
            const running = jobsData.filter(job => job.status === 'running').length;
            const failed = jobsData.filter(job => job.status === 'failed').length;
            const delayed = jobsData.filter(job => job.status === 'delayed').length;

            const completedJobs = jobsData.filter(job => 
                job.status === 'completed' && 
                job.startTimeParsed && 
                job.endTimeParsed
            );
            
            let avgRunTimeMinutes = 0;
            if (completedJobs.length > 0) {
                const totalDuration = completedJobs.reduce((sum, job) => {
                    return sum + (job.endTimeParsed - job.startTimeParsed);
                }, 0);
                avgRunTimeMinutes = Math.floor(totalDuration / (completedJobs.length * 1000 * 60));
            }

            const priorityDistribution = {
                high: jobsData.filter(job => job.priority === 'high').length,
                normal: jobsData.filter(job => job.priority === 'normal').length,
                low: jobsData.filter(job => job.priority === 'low').length
            };

            res.json({
                total,
                completed,
                running,
                failed,
                delayed,
                avgRunTimeMinutes,
                priorityDistribution,
                lastUpdated
            });
        }
    } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (DATA_SOURCE === 'database') {
            await sql.close();
        }
    }
});

// Get specific job by ID
app.get('/api/jobs/:id', authenticateToken, (req, res) => {
    try {
        const job = jobsData.find(j => j.id === req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        res.json(job);
    } catch (error) {
        console.error('Error fetching job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get job dependencies
app.get('/api/jobs/:id/dependencies', authenticateToken, (req, res) => {
    try {
        const job = jobsData.find(j => j.id === req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Find jobs that depend on this job
        const dependentJobs = jobsData.filter(j => j.dependency === job.jobName);
        
        // Find jobs this job depends on
        const dependencies = jobsData.filter(j => j.jobName === job.dependency);

        res.json({
            job: job.jobName,
            dependsOn: dependencies,
            dependents: dependentJobs
        });
    } catch (error) {
        console.error('Error fetching dependencies:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Force refresh data from Excel
app.post('/api/jobs/refresh', authenticateToken, async (req, res) => {
    try {
        await initializeJobs();
        res.json({
            message: 'Data refreshed successfully',
            count: jobsData.length,
            lastUpdated
        });
    } catch (error) {
        console.error('Error refreshing data:', error);
        res.status(500).json({ error: 'Failed to refresh data' });
    }
});

// Export jobs data as CSV
app.get('/api/jobs/export', authenticateToken, (req, res) => {
    try {
        const { search, status, priority } = req.query;
        let filteredJobs = [...jobsData];

        // Apply filters
        if (search) {
            const searchTerm = search.toLowerCase();
            filteredJobs = filteredJobs.filter(job => 
                job.jobName.toLowerCase().includes(searchTerm) ||
                job.dependency.toLowerCase().includes(searchTerm) ||
                (job.description && job.description.toLowerCase().includes(searchTerm))
            );
        }

        if (status && status !== 'all') {
            filteredJobs = filteredJobs.filter(job => job.status === status);
        }

        if (priority && priority !== 'all') {
            filteredJobs = filteredJobs.filter(job => job.priority === priority);
        }

        // Generate CSV
        const csvHeader = 'Job Name,Start Time,End Time,Duration,Status,Dependencies,Priority,Description\n';
        const csvData = filteredJobs.map(job => 
            `"${job.jobName}","${job.startTime}","${job.endTime}","${job.duration}","${job.status}","${job.dependency}","${job.priority}","${job.description || ''}"`
        ).join('\n');

        const csv = csvHeader + csvData;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=tidal_jobs_export_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Get alerts for critical jobs
app.get('/api/alerts', authenticateToken, (req, res) => {
    try {
        const alerts = [];
        
        const delayedJobs = jobsData.filter(job => job.status === 'delayed');
        const failedJobs = jobsData.filter(job => job.status === 'failed');
        const longRunningJobs = jobsData.filter(job => {
            if (job.status !== 'running') return false;
            if (!job.startTimeParsed) return false;
            
            const now = new Date();
            const runningTime = now - job.startTimeParsed;
            return runningTime > 3 * 60 * 60 * 1000; // 3 hours
        });

        if (delayedJobs.length > 0) {
            alerts.push({
                type: 'warning',
                message: `${delayedJobs.length} job(s) are running longer than expected`,
                jobs: delayedJobs.map(j => j.jobName),
                severity: 'medium'
            });
        }

        if (failedJobs.length > 0) {
            alerts.push({
                type: 'error',
                message: `${failedJobs.length} job(s) have failed to start`,
                jobs: failedJobs.map(j => j.jobName),
                severity: 'high'
            });
        }

        if (longRunningJobs.length > 0) {
            alerts.push({
                type: 'info',
                message: `${longRunningJobs.length} job(s) have been running for more than 3 hours`,
                jobs: longRunningJobs.map(j => j.jobName),
                severity: 'low'
            });
        }

        res.json({ alerts, timestamp: new Date() });
    } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date(),
        jobsCount: jobsData.length,
        lastUpdated,
        excelPath: EXCEL_FILE_PATH,
        excelExists: fs.existsSync(EXCEL_FILE_PATH)
    });
});

// API endpoint to create new users (admin only)
app.post('/api/users', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can create new users' });
        }

        const newUser = await createUser(req.body);
        
        // Return user data without password
        const { password, ...userData } = newUser;
        res.status(201).json(userData);
    } catch (error) {
        console.error('Error in user creation endpoint:', error);
        res.status(400).json({ error: error.message });
    }
});

// API endpoint to list users (admin only)
app.get('/api/users', authenticateToken, (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can view user list' });
        }

        // Return user list without passwords
        const userList = users.map(({ password, plainPassword, ...user }) => user);
        res.json(userList);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Request password reset
app.post('/api/auth/request-reset', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = users.find(u => u.email === email);
        if (!user) {
            // Don't reveal if email exists or not
            return res.json({ message: 'If your email is registered, you will receive a password reset link' });
        }

        const resetToken = generateResetToken();
        const expiry = Date.now() + RESET_TOKEN_EXPIRY;

        // Store reset token
        resetTokens.set(resetToken, {
            userId: user.id,
            expiry
        });

        // Send reset email
        const emailSent = await sendResetEmail(email, resetToken);
        
        if (emailSent) {
            res.json({ message: 'If your email is registered, you will receive a password reset link' });
        } else {
            res.status(500).json({ error: 'Failed to send reset email' });
        }
    } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
});

// Verify reset token
app.get('/api/auth/verify-reset-token', (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ error: 'Reset token is required' });
        }

        const resetData = resetTokens.get(token);
        if (!resetData) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        if (Date.now() > resetData.expiry) {
            resetTokens.delete(token);
            return res.status(400).json({ error: 'Reset token has expired' });
        }

        res.json({ valid: true });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({ error: 'Failed to verify reset token' });
    }
});

// Reset password
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        const resetData = resetTokens.get(token);
        if (!resetData) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        if (Date.now() > resetData.expiry) {
            resetTokens.delete(token);
            return res.status(400).json({ error: 'Reset token has expired' });
        }

        const user = users.find(u => u.id === resetData.userId);
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        // Update password
        user.password = await bcrypt.hash(newPassword, 10);
        
        // Remove used token
        resetTokens.delete(token);

        res.json({ message: 'Password has been reset successfully' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Clean up expired tokens periodically
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of resetTokens.entries()) {
        if (now > data.expiry) {
            resetTokens.delete(token);
        }
    }
}, 3600000); // Clean up every hour

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Add endpoint to get data source configuration
app.get('/api/config', (req, res) => {
    res.json({
        dataSource: DATA_SOURCE,
        database: {
            server: sqlConfig.server,
            database: sqlConfig.database
        },
        excel: {
            path: EXCEL_FILE_PATH
        }
    });
});

// Add endpoint to switch data source
app.post('/api/config/source', authenticateToken, async (req, res) => {
    try {
        const { source } = req.body;
        if (!['excel', 'database'].includes(source)) {
            return res.status(400).json({ error: 'Invalid data source' });
        }

        // Only allow admin to change data source
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can change data source' });
        }

        DATA_SOURCE = source;
        await initializeJobs();
        
        res.json({
            message: `Data source switched to ${source}`,
            dataSource: DATA_SOURCE
        });
    } catch (error) {
        console.error('Error switching data source:', error);
        res.status(500).json({ error: 'Failed to switch data source' });
    }
});

// Initialize server
const startServer = async () => {
    try {
        await initializeUsers(); // Hash passwords before starting server
        await initializeJobs();
        watchExcelFile();

        app.listen(PORT, () => {
            console.log(`🚀 Tidal Dashboard Backend Server running on port ${PORT}`);
            console.log(`📁 Monitoring Excel file: ${EXCEL_FILE_PATH}`);
            console.log(`📊 Loaded ${jobsData.length} jobs`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app;