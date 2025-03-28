const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const Razorpay = require('razorpay');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Serve uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve CSS files
app.use('/css', express.static(path.join(__dirname, 'css')));

// Serve JavaScript files
app.use('/js', express.static(path.join(__dirname, 'js')));

// Serve images
app.use('/images', express.static(path.join(__dirname, 'images')));

const port = 3002;

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Email transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Test email configuration
transporter.verify(function(error, success) {
    if (error) {
        console.error('Email configuration error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ 
    storage,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, JPG and PNG allowed.'));
        }
    }
});

// Ensure uploads directory exists
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Basic health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// MongoDB connection with options
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000, // Increase timeout to 10 seconds
    socketTimeoutMS: 45000,
    retryWrites: true,
    w: 'majority'
})
.then(() => {
    console.log('Connected to MongoDB successfully');
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    // Log more details about the error
    if (err.name === 'MongooseServerSelectionError') {
        console.error('\nMongoDB Connection Troubleshooting:');
        console.error('1. Check if your IP address is whitelisted in MongoDB Atlas:');
        console.error('   - Go to https://cloud.mongodb.com');
        console.error('   - Select your cluster');
        console.error('   - Click "Network Access"');
        console.error('   - Add your current IP or use 0.0.0.0/0 for development');
        console.error('\n2. Verify your connection string in .env file:');
        console.error('   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>');
        console.error('\n3. Check if your MongoDB Atlas cluster is running');
        console.error('\n4. Verify your network connection');
    }
    process.exit(1); // Exit the process if MongoDB connection fails
});

// Admin Schema
const adminSchema = new mongoose.Schema({
    username: String,
    password: String
});

const Admin = mongoose.model('Admin', adminSchema);

// Create default admin if not exists
const createDefaultAdmin = async () => {
    try {
        const adminExists = await Admin.findOne({ username: process.env.ADMIN_USERNAME });
        if (!adminExists) {
            await Admin.create({
                username: process.env.ADMIN_USERNAME,
                password: process.env.ADMIN_PASSWORD
            });
            console.log('Default admin created successfully');
        }
    } catch (error) {
        console.error('Error creating default admin:', error);
    }
};

// Call createDefaultAdmin after MongoDB connection
mongoose.connection.once('open', createDefaultAdmin);

// Authentication middleware
const authenticateAdmin = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.admin = decoded;
        next();
    } catch (error) {
        console.error('Admin authentication error:', error);
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// Admin login endpoint
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Check credentials against environment variables
        if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
            // Generate JWT token
            const token = jwt.sign(
                { username },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '24h' }
            );

            res.json({ 
                success: true, 
                message: 'Login successful',
                admin: { username },
                token
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Registration Schema
const registrationSchema = new mongoose.Schema({
    name: String,
    email: String,
    mobile: String,
    gender: String,
    isLpu: Boolean,
    regNo: String,
    participationType: String,
    teamDetails: {
        teamName: String,
        members: [{
            name: String,
            mobile: String,
            regNo: String,
            gender: String
        }]
    },
    needAccommodation: String,
    photoUrl: String,
    paymentStatus: {
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed'],
            default: 'pending'
        },
        paymentId: String,
        orderId: String,
        paymentDate: Date
    },
    registrationDate: {
        type: Date,
        default: Date.now
    }
});

const Registration = mongoose.model('Registration', registrationSchema);

app.post('/api/register', async (req, res) => {
    try {
        const registrationData = req.body;
        console.log('Received registration data:', registrationData);

        if (typeof registrationData.teamDetails === 'string') {
            registrationData.teamDetails = JSON.parse(registrationData.teamDetails);
        }

        registrationData.isLpu = registrationData.isLpu === true || registrationData.isLpu === 'true' || registrationData.isLpu === 'yes';

        const registration = new Registration(registrationData);
        await registration.save();

        console.log('Registration saved with ID:', registration._id);
        
        res.status(201).json({
            success: true,
            registrationId: registration._id
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/upload-photo', upload.single('photo'), async (req, res) => {
    try {
        console.log('Photo upload request received:', {
            file: req.file,
            body: req.body,
            headers: req.headers
        });

        if (!req.file) {
            console.error('No file uploaded');
            throw new Error('No file uploaded');
        }

        const registrationId = req.body.registrationId;
        if (!registrationId) {
            console.error('No registration ID provided');
            throw new Error('No registration ID provided');
        }

        console.log('File details:', {
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        const photoUrl = `/uploads/${req.file.filename}`;
        
        const registration = await Registration.findByIdAndUpdate(
            registrationId,
            { photoUrl },
            { new: true }
        );

        if (!registration) {
            console.error('Registration not found:', registrationId);
            throw new Error('Registration not found');
        }

        console.log('Photo URL saved to registration:', {
            registrationId,
            photoUrl
        });

        res.json({
            success: true,
            photoUrl
        });
    } catch (error) {
        console.error('Photo upload error:', error);
        
        // Clean up uploaded file if registration update failed
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
                console.log('Cleaned up uploaded file:', req.file.path);
            } catch (unlinkError) {
                console.error('Error cleaning up file:', unlinkError);
            }
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Admin API endpoints
app.get('/api/admin/registrations', authenticateAdmin, async (req, res) => {
    try {
        const registrations = await Registration.find().sort({ registrationDate: -1 });
        res.json(registrations);
    } catch (error) {
        console.error('Error fetching registrations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/registration/:id', authenticateAdmin, async (req, res) => {
    try {
        const registration = await Registration.findById(req.params.id);
        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }
        res.json(registration);
    } catch (error) {
        console.error('Error fetching registration details:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/registration/:id', authenticateAdmin, async (req, res) => {
    try {
        const registration = await Registration.findByIdAndDelete(req.params.id);
        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }
        res.json({ success: true, message: 'Registration deleted successfully' });
    } catch (error) {
        console.error('Error deleting registration:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add payment endpoints
app.post('/api/create-order', async (req, res) => {
    try {
        const { isLpu, participationType, needAccommodation } = req.body;
        
        // Validate required fields
        if (typeof isLpu === 'undefined' || typeof participationType === 'undefined') {
            throw new Error('Missing required fields: isLpu and participationType are required');
        }
        
        // Calculate amount based on registration type
        let amount = 0;
        if (isLpu) {
            amount = participationType === 'team' ? 300 : 100; // 300 rupees for team, 100 rupees for solo
        } else {
            amount = participationType === 'team' ? 500 : 100; // 500 rupees for team, 100 rupees for solo
            if (needAccommodation === true) {
                amount += participationType === 'team' ? 150 : 50; // Add accommodation cost
            }
        }

        console.log('Payment details:', {
            isLpu,
            participationType,
            needAccommodation,
            amount
        });

        // Validate Razorpay credentials
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.error('Razorpay credentials missing:', {
                hasKeyId: !!process.env.RAZORPAY_KEY_ID,
                hasKeySecret: !!process.env.RAZORPAY_KEY_SECRET
            });
            throw new Error('Razorpay credentials not configured. Please check your environment variables.');
        }

        const options = {
            amount: Math.round(amount * 100), // Convert to paise and ensure it's a whole number
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
            payment_capture: 1
        };

        console.log('Creating Razorpay order with options:', options);
        
        try {
            const order = await razorpay.orders.create(options);
            console.log('Order created successfully:', order);
            
            res.json({
                success: true,
                ...order
            });
        } catch (razorpayError) {
            console.error('Razorpay API error:', razorpayError);
            throw new Error(`Razorpay API error: ${razorpayError.message || 'Unknown error occurred'}`);
        }
    } catch (error) {
        console.error('Payment order creation error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message,
            details: error.error?.description || 'Unknown error occurred'
        });
    }
});

app.post('/api/verify-payment', async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, registrationId } = req.body;
        
        console.log('Verifying payment for registration:', registrationId);
        console.log('Payment details:', { razorpay_payment_id, razorpay_order_id });

        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !registrationId) {
            throw new Error('Missing required payment verification data');
        }

        // Verify payment signature
        const crypto = require('crypto');
        const secret = process.env.RAZORPAY_KEY_SECRET;
        const generated_signature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature === razorpay_signature) {
            // Find and update the registration in one operation
            const updatedRegistration = await Registration.findByIdAndUpdate(
                registrationId,
                {
                    $set: {
                        'paymentStatus.status': 'completed',
                        'paymentStatus.paymentId': razorpay_payment_id,
                        'paymentStatus.orderId': razorpay_order_id,
                        'paymentStatus.paymentDate': new Date()
                    }
                },
                { new: true }
            );

            if (!updatedRegistration) {
                throw new Error('Registration not found');
            }

            console.log('Payment status updated successfully:', updatedRegistration);

            // Send confirmation email
            try {
                let emailContent = `
                    <h2>Registration Confirmation - Type Till Sunrise</h2>
                    <p>Dear ${updatedRegistration.name},</p>
                    <p>Thank you for registering for Type Till Sunrise! Your registration has been confirmed.</p>
                    
                    <h3>Registration Details:</h3>
                    <ul>
                        <li><strong>Name:</strong> ${updatedRegistration.name}</li>
                        <li><strong>Email:</strong> ${updatedRegistration.email}</li>
                        <li><strong>Mobile:</strong> ${updatedRegistration.mobile}</li>
                        <li><strong>Registration Number:</strong> ${updatedRegistration.regNo || 'N/A'}</li>
                        <li><strong>Participation Type:</strong> ${updatedRegistration.participationType}</li>
                        <li><strong>Payment Status:</strong> ${updatedRegistration.paymentStatus.status}</li>
                    </ul>
                `;

                if (updatedRegistration.participationType === 'team' && updatedRegistration.teamDetails) {
                    emailContent += `
                        <h3>Team Details:</h3>
                        <p><strong>Team Name:</strong> ${updatedRegistration.teamDetails.teamName}</p>
                        <h4>Team Members:</h4>
                        <ul>
                    `;
                    updatedRegistration.teamDetails.members.forEach(member => {
                        emailContent += `
                            <li>
                                <strong>Name:</strong> ${member.name}<br>
                                <strong>Mobile:</strong> ${member.mobile}<br>
                                <strong>Registration No:</strong> ${member.regNo}<br>
                                <strong>Gender:</strong> ${member.gender}
                            </li>
                        `;
                    });
                    emailContent += '</ul>';
                }

                emailContent += `
                    <h3>Important Information:</h3>
                    <ul>
                        <li>Event Date: April 4, 2025</li>
                        <li>Time: 6:00 PM - 6:00 AM</li>
                        <li>Venue: LPU Campus, Block 32</li>
                        <li>Please report to the venue 1 hour before the event starts (5:00 PM)</li>
                        <li>Event coordinators will send you a WhatsApp group link in a separate email</li>
                        <li>Don't forget to bring your college ID</li>
                    </ul>
                    
                    <p>If you have any questions, please don't hesitate to contact us.</p>
                    <p>Best regards,<br>Type Till Sunrise Team</p>
                `;

                // Log email configuration
                console.log('Sending email with configuration:', {
                    from: process.env.EMAIL_USER,
                    to: updatedRegistration.email,
                    subject: 'Registration Confirmation - Type Till Sunrise'
                });

                const mailOptions = {
                    from: `"Type Till Sunrise" <${process.env.EMAIL_USER}>`,
                    to: updatedRegistration.email,
                    subject: 'Registration Confirmation - Type Till Sunrise',
                    html: emailContent
                };

                const info = await transporter.sendMail(mailOptions);
                console.log('Email sent successfully:', info.messageId);
                console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
            } catch (emailError) {
                console.error('Error sending confirmation email:', emailError);
                // Log detailed error information
                console.error('Email error details:', {
                    message: emailError.message,
                    stack: emailError.stack,
                    code: emailError.code,
                    command: emailError.command
                });
                // Don't throw error here, as payment is already verified
            }

            res.json({ 
                success: true,
                message: 'Payment verified and status updated successfully',
                registration: {
                    id: updatedRegistration._id,
                    name: updatedRegistration.name,
                    email: updatedRegistration.email,
                    paymentStatus: updatedRegistration.paymentStatus,
                    participationType: updatedRegistration.participationType,
                    teamDetails: updatedRegistration.teamDetails
                },
                nextSteps: {
                    whatsappGroup: "Event coordinators will send you a WhatsApp group link via email",
                    venueReporting: "Please report to the venue 1 hour before the start of the event (5:00 PM)",
                    eventDetails: {
                        date: "April 4, 2025",
                        time: "6:00 PM - 6:00 AM",
                        venue: "LPU Campus, Block 32"
                    }
                }
            });
        } else {
            console.error('Invalid payment signature');
            // Update payment status to failed
            await Registration.findByIdAndUpdate(
                registrationId,
                {
                    $set: {
                        'paymentStatus.status': 'failed',
                        'paymentStatus.paymentId': razorpay_payment_id,
                        'paymentStatus.orderId': razorpay_order_id,
                        'paymentStatus.paymentDate': new Date()
                    }
                }
            );

            res.status(400).json({ 
                success: false, 
                error: 'Invalid payment signature' 
            });
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Check if email exists
app.post('/api/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        const existingRegistration = await Registration.findOne({ email });
        res.json({ exists: !!existingRegistration });
    } catch (error) {
        console.error('Error checking email:', error);
        res.status(500).json({ error: 'Failed to check email' });
    }
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;

        // Log the request data
        console.log('Contact form submission received:', {
            name,
            email,
            phone,
            subject,
            message
        });

        // Log email configuration
        console.log('Email configuration:', {
            from: process.env.EMAIL_USER,
            to: process.env.ADMIN_EMAIL,
            subject: `New Contact Form Submission: ${subject}`
        });

        // Send email to admin
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.ADMIN_EMAIL,
            subject: `New Contact Form Submission: ${subject}`,
            html: `
                <h3>New Contact Form Submission</h3>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                <p><strong>Subject:</strong> ${subject}</p>
                <p><strong>Message:</strong> ${message}</p>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        console.log('Preview URL:', nodemailer.getTestMessageUrl(info));

        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        // Enhanced error logging
        console.error('Contact form error details:', {
            message: error.message,
            code: error.code,
            command: error.command,
            stack: error.stack
        });

        // Check if it's an authentication error
        if (error.code === 'EAUTH') {
            console.error('Email authentication failed. Please check your email credentials in .env file');
        }

        res.status(500).json({ 
            error: 'Failed to send message',
            details: error.message
        });
    }
});

// Update the main route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Add a catch-all route for handling 404s
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3002;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please try a different port.`);
        process.exit(1);
    } else {
        console.error('Server error:', err);
    }
});