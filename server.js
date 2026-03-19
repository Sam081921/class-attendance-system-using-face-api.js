const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Path for user credentials
const USERS_FILE = path.join(__dirname, 'users.json');

// Initialize users file if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({
        teachers: [
            { id: 'admin', password: 'admin123', name: 'Admin Teacher' }
        ],
        students: []
    }, null, 2));
    console.log('✅ Created users.json with default admin account');
}

// Helper to read users
function readUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading users file:', error);
        return { teachers: [], students: [] };
    }
}

// Helper to write users
function writeUsers(data) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing users file:', error);
        return false;
    }
}

// Ensure labeled_images directory exists
const labeledDir = path.join(__dirname, 'labeled_images');
if (!fs.existsSync(labeledDir)) {
    fs.mkdirSync(labeledDir);
}

// ==================== UNITS MANAGEMENT ====================

// Predefined 8 units
const UNITS = [
    { code: 'CS101', name: 'Introduction to Programming', credits: 3 },
    { code: 'CS201', name: 'Data Structures and Algorithms', credits: 3 },
    { code: 'CS301', name: 'Database Systems', credits: 3 },
    { code: 'CS401', name: 'Web Development', credits: 3 },
    { code: 'CS501', name: 'Artificial Intelligence', credits: 3 },
    { code: 'CS601', name: 'Computer Networks', credits: 3 },
    { code: 'CS701', name: 'Software Engineering', credits: 3 },
    { code: 'CS801', name: 'Cyber Security', credits: 3 }
];

// Get all units
app.get('/api/units', (req, res) => {
    res.json(UNITS);
});

// Student enroll in unit
app.post('/api/student/enroll', (req, res) => {
    try {
        const { regNumber, unitCode } = req.body;
        const users = readUsers();
        
        const student = users.students.find(s => s.regNumber === regNumber);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        // Initialize enrolled units if not exists
        if (!student.enrolledUnits) {
            student.enrolledUnits = [];
        }
        
        // Check if already enrolled
        if (student.enrolledUnits.includes(unitCode)) {
            return res.status(400).json({ success: false, message: 'Already enrolled in this unit' });
        }
        
        // Add unit
        student.enrolledUnits.push(unitCode);
        writeUsers(users);
        
        console.log(`✅ Student ${student.name} enrolled in ${unitCode}`);
        res.json({ success: true, enrolledUnits: student.enrolledUnits });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get student's enrolled units
app.get('/api/student/units/:regNumber', (req, res) => {
    try {
        const { regNumber } = req.params;
        const users = readUsers();
        
        const student = users.students.find(s => s.regNumber === regNumber);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        const enrolledUnits = (student.enrolledUnits || []).map(code => {
            const unit = UNITS.find(u => u.code === code);
            return unit || { code, name: 'Unknown Unit' };
        });
        
        res.json(enrolledUnits);
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get students enrolled in a specific unit (for teacher)
app.get('/api/unit/students/:unitCode', (req, res) => {
    try {
        const { unitCode } = req.params;
        const users = readUsers();
        
        const enrolledStudents = users.students.filter(s => 
            s.enrolledUnits && s.enrolledUnits.includes(unitCode)
        ).map(s => ({
            name: s.name,
            regNumber: s.regNumber,
            faceRegistered: s.faceRegistered || false
        }));
        
        res.json(enrolledStudents);
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Save attendance for a specific unit
app.post('/api/attendance/mark', (req, res) => {
    try {
        const { unitCode, date, attendanceData } = req.body;
        
        // Store attendance in a separate file
        const attendanceFile = path.join(__dirname, 'attendance.json');
        let attendance = {};
        
        if (fs.existsSync(attendanceFile)) {
            attendance = JSON.parse(fs.readFileSync(attendanceFile));
        }
        
        if (!attendance[unitCode]) {
            attendance[unitCode] = {};
        }
        
        attendance[unitCode][date] = attendanceData;
        
        fs.writeFileSync(attendanceFile, JSON.stringify(attendance, null, 2));
        
        console.log(`✅ Attendance marked for ${unitCode} on ${date}`);
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get attendance for a unit
app.get('/api/attendance/:unitCode', (req, res) => {
    try {
        const { unitCode } = req.params;
        const attendanceFile = path.join(__dirname, 'attendance.json');
        
        if (!fs.existsSync(attendanceFile)) {
            return res.json({});
        }
        
        const attendance = JSON.parse(fs.readFileSync(attendanceFile));
        res.json(attendance[unitCode] || {});
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== FACE RECOGNITION ENDPOINTS ====================

// Save face image
app.post('/save-face', (req, res) => {
    try {
        const { name, imageData } = req.body;
        
        const personDir = path.join(labeledDir, name);
        if (!fs.existsSync(personDir)) {
            fs.mkdirSync(personDir);
        }
        
        const files = fs.readdirSync(personDir);
        const nextNum = files.length + 1;
        const filename = `${nextNum}.jpg`;
        const filePath = path.join(personDir, filename);
        
        const base64Data = imageData.replace(/^data:image\/jpeg;base64,/, '');
        fs.writeFileSync(filePath, base64Data, 'base64');
        
        console.log(`✅ Saved: ${name}/${filename}`);
        
        // Check if this student now has 3 photos
        const updatedFiles = fs.readdirSync(personDir).filter(f => f.endsWith('.jpg'));
        if (updatedFiles.length >= 3) {
            const users = readUsers();
            const student = users.students.find(s => s.name === name);
            if (student) {
                student.status = 'active';
                student.faceRegistered = true;
                writeUsers(users);
                console.log(`✨ Student ${name} is now ACTIVE`);
            }
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get faces list
app.get('/faces-list', (req, res) => {
    try {
        if (!fs.existsSync(labeledDir)) {
            return res.json([]);
        }
        
        const persons = fs.readdirSync(labeledDir);
        const faces = [];
        
        persons.forEach(person => {
            const personDir = path.join(labeledDir, person);
            if (fs.statSync(personDir).isDirectory()) {
                const images = fs.readdirSync(personDir)
                    .filter(f => f.endsWith('.jpg'));
                faces.push({
                    name: person,
                    images: images.map(img => `/labeled_images/${person}/${img}`)
                });
            }
        });
        
        res.json(faces);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== TEACHER AUTH ====================

// Teacher login
app.post('/api/teacher/login', (req, res) => {
    try {
        const { id, password } = req.body;
        const users = readUsers();
        
        const teacher = users.teachers.find(t => t.id === id && t.password === password);
        
        if (teacher) {
            res.json({ success: true, name: teacher.name });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add new teacher
app.post('/api/teacher/add', (req, res) => {
    try {
        const { id, password, name, adminPassword } = req.body;
        
        if (adminPassword !== 'admin123') {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        
        const users = readUsers();
        
        if (users.teachers.find(t => t.id === id)) {
            return res.status(400).json({ success: false, message: 'Teacher ID exists' });
        }
        
        users.teachers.push({ id, password, name });
        writeUsers(users);
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== STUDENT AUTH WITH REGISTRATION NUMBER ====================

// Student registration with registration number
app.post('/api/student/register', (req, res) => {
    try {
        const { name, regNumber, password } = req.body;
        
        // Validation
        if (!name || name.trim().length < 2) {
            return res.status(400).json({ 
                success: false, 
                message: 'name must be at least 2 characters' 
            });
        }
        
        if (!regNumber || regNumber.trim().length < 1) {
            return res.status(400).json({ 
                success: false, 
                message: 'registration number is required' 
            });
        }
        
        if (!password || password.length < 4) {
            return res.status(400).json({ 
                success: false, 
                message: 'password must be at least 4 characters' 
            });
        }
        
        const users = readUsers();
        const cleanName = name.trim();
        const cleanRegNumber = regNumber.trim();
        
        // Check if registration number already exists
        const existingReg = users.students.find(s => s.regNumber === cleanRegNumber);
        if (existingReg) {
            return res.status(400).json({ 
                success: false, 
                message: 'registration number already exists' 
            });
        }
        
        // Check if name already exists
        const existingName = users.students.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
        if (existingName) {
            return res.status(400).json({ 
                success: false, 
                message: 'student name already exists' 
            });
        }
        
        // Add to students array (pending status)
        users.students.push({
            name: cleanName,
            regNumber: cleanRegNumber,
            password: password,
            registered: new Date().toISOString(),
            status: 'pending',
            faceRegistered: false,
            enrolledUnits: []
        });
        
        writeUsers(users);
        console.log(`📝 Student registered: ${cleanName} (${cleanRegNumber})`);
        
        res.json({ 
            success: true, 
            message: 'registration successful! please see teacher for photos.' 
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'server error' });
    }
});

// Student login with registration number
app.post('/api/student/login', (req, res) => {
    try {
        const { regNumber, password } = req.body;
        
        if (!regNumber || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'registration number and password required' 
            });
        }
        
        const users = readUsers();
        
        // Find student by registration number
        const student = users.students.find(s => s.regNumber === regNumber);
        
        if (!student) {
            return res.status(401).json({ 
                success: false, 
                message: 'registration number not found' 
            });
        }
        
        // Check password
        if (student.password !== password) {
            return res.status(401).json({ 
                success: false, 
                message: 'incorrect password' 
            });
        }
        
        // Check if face is registered (exists in labeled_images with 3+ photos)
        const faceDir = path.join(labeledDir, student.name);
        let hasFace = false;
        let photoCount = 0;
        
        if (fs.existsSync(faceDir)) {
            const files = fs.readdirSync(faceDir).filter(f => f.endsWith('.jpg'));
            photoCount = files.length;
            hasFace = photoCount >= 3;
        }
        
        // Update student status
        student.status = hasFace ? 'active' : 'pending';
        student.faceRegistered = hasFace;
        writeUsers(users);
        
        console.log(`✅ Student logged in: ${student.name} (${student.regNumber})`);
        
        res.json({ 
            success: true, 
            name: student.name,
            regNumber: student.regNumber,
            status: student.status
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'server error' });
    }
});

// ==================== STUDENT MANAGEMENT ====================

// Get all students with status
app.get('/api/students', (req, res) => {
    try {
        const users = readUsers();
        
        const studentsWithStatus = users.students.map(s => {
            const faceDir = path.join(labeledDir, s.name);
            let photoCount = 0;
            let hasFace = false;
            
            if (fs.existsSync(faceDir)) {
                const files = fs.readdirSync(faceDir).filter(f => f.endsWith('.jpg'));
                photoCount = files.length;
                hasFace = photoCount >= 3;
            }
            
            return {
                name: s.name,
                regNumber: s.regNumber,
                registered: s.registered,
                status: hasFace ? 'active' : 'pending',
                faceRegistered: hasFace,
                photoCount: photoCount,
                enrolledUnits: s.enrolledUnits || []
            };
        });
        
        res.json(studentsWithStatus);
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get pending students only
app.get('/api/students/pending', (req, res) => {
    try {
        const users = readUsers();
        
        const pendingStudents = users.students.filter(s => {
            const faceDir = path.join(labeledDir, s.name);
            if (!fs.existsSync(faceDir)) return true;
            const files = fs.readdirSync(faceDir).filter(f => f.endsWith('.jpg'));
            return files.length < 3;
        }).map(s => ({
            name: s.name,
            regNumber: s.regNumber,
            registered: s.registered
        }));
        
        res.json(pendingStudents);
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Check if registration number exists
app.get('/api/student/exists/:regNumber', (req, res) => {
    try {
        const { regNumber } = req.params;
        const users = readUsers();
        
        const exists = users.students.some(s => s.regNumber === regNumber);
        
        res.json({ exists });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reset student password (teacher only)
app.post('/api/student/reset-password', (req, res) => {
    try {
        const { regNumber, newPassword, teacherId } = req.body;
        
        const users = readUsers();
        const teacher = users.teachers.find(t => t.id === teacherId);
        
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        
        const student = users.students.find(s => s.regNumber === regNumber);
        if (student) {
            student.password = newPassword;
            writeUsers(users);
            console.log(`✅ Reset password for: ${student.name} (${regNumber})`);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Student not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete student (teacher only)
app.delete('/api/student/:regNumber', (req, res) => {
    try {
        const { regNumber } = req.params;
        const { teacherId } = req.body;
        
        const users = readUsers();
        const teacher = users.teachers.find(t => t.id === teacherId);
        
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        
        const studentIndex = users.students.findIndex(s => s.regNumber === regNumber);
        if (studentIndex !== -1) {
            const student = users.students[studentIndex];
            users.students.splice(studentIndex, 1);
            writeUsers(users);
            
            // Optionally delete face images
            const faceDir = path.join(labeledDir, student.name);
            if (fs.existsSync(faceDir)) {
                fs.rmSync(faceDir, { recursive: true, force: true });
            }
            
            console.log(`✅ Deleted student: ${student.name} (${regNumber})`);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Student not found' });
        }
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== GET TEACHERS ====================

app.get('/api/teachers', (req, res) => {
    try {
        const users = readUsers();
        res.json(users.teachers.map(t => ({ id: t.id, name: t.name })));
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== DEBUG ENDPOINT (remove in production) ====================

app.get('/api/debug/students', (req, res) => {
    const users = readUsers();
    res.json(users.students);
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
    console.log(`\n🚀 SERVER RUNNING at http://localhost:${PORT}`);
    console.log(`📁 Open login page: http://localhost:${PORT}/login.html`);
    console.log(`📁 Labeled images: ${labeledDir}`);
    console.log(`📁 Users file: ${USERS_FILE}`);
    console.log(`📁 Attendance file: ${path.join(__dirname, 'attendance.json')}`);
    console.log(`👤 Teacher login: admin / admin123`);
    console.log(`📚 8 Units available: CS101, CS201, CS301, CS401, CS501, CS601, CS701, CS801`);
    console.log(`📝 Student registration requires: name, registration number, password\n`);
});