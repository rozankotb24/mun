const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const net = require('net');
const dns = require('dns');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Admin = require('./models/Admin');
const Committee = require('./models/Committee');
const Application = require('./models/Application');
const FormSetting = require('./models/FormSetting');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 9000;
const MONGO_URI = process.env.MONGODB_URI || null;
const DEV_SERVER_ID = crypto.randomUUID();
const sessions = {};
let mongoMemoryServer = null;
const serverLockPath = path.join(__dirname, '.club-server.lock');

const defaultAdminEmail = process.env.ADMIN_EMAIL || 'admin@club.com';
const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'admin123';

const defaultFormFields = [
  { name: 'firstName', label: 'First Name', type: 'text', placeholder: 'Enter first name', required: true },
  { name: 'lastName', label: 'Last Name', type: 'text', placeholder: 'Enter last name', required: true },
  { name: 'email', label: 'University Email', type: 'email', placeholder: 'example@miuegypt.edu.eg', required: true },
  { name: 'phone', label: 'Phone Number', type: 'tel', placeholder: '012XXXXXXXXX', required: true },
  { name: 'committee', label: 'Committee', type: 'select', required: true },
  { name: 'interviewSlot', label: 'Interview Slot', type: 'select', required: true }
];
const defaultInterviewQuestions = [
  'Why do you want to join this committee?',
  'Describe a time you worked effectively as part of a team.',
  'How would you communicate an idea to someone who disagrees?',
  'What skills or experience would you bring to this committee?'
];

const defaultCommitteeSeed = [
  { name: 'IT', headName: 'Head of IT', headEmail: 'head.it@university.edu', headPassword: 'it123456', slots: ['Monday, 10:00 AM','Tuesday, 1:30 PM','Wednesday, 11:00 AM','Thursday, 3:00 PM'] },
  { name: 'PR', headName: 'Head of PR', headEmail: 'head.pr@university.edu', headPassword: 'pr123456', slots: ['Monday, 12:00 PM','Wednesday, 2:00 PM','Thursday, 10:30 AM','Friday, 9:00 AM'] },
  { name: 'FINANCE', headName: 'Head of Finance', headEmail: 'head.finance@university.edu', headPassword: 'finance123', slots: ['Tuesday, 11:30 AM','Wednesday, 9:30 AM','Thursday, 1:00 PM','Friday, 2:30 PM'] },
  { name: 'MEDIA', headName: 'Head of Media', headEmail: 'head.media@university.edu', headPassword: 'media1234', slots: ['Monday, 2:00 PM','Tuesday, 4:00 PM','Thursday, 11:00 AM','Friday, 12:30 PM'] },
  { name: 'OPERATIONS', headName: 'Head of Operations', headEmail: 'head.operations@university.edu', headPassword: 'operations123', slots: ['Monday, 9:00 AM','Tuesday, 2:00 PM','Wednesday, 12:00 PM','Thursday, 4:00 PM'] }
];

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/dev-version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: DEV_SERVER_ID });
});

function generateToken() {
  return crypto.randomBytes(18).toString('hex');
}

function requireAuth(type, committeeName = null) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const session = sessions[token];

    if (!session || session.type !== type) {
      return res.status(401).json({ message: 'Unauthorized access.' });
    }

    if (committeeName && session.committee && session.committee !== committeeName) {
      return res.status(403).json({ message: 'Access denied for this committee.' });
    }

    req.session = session;
    next();
  };
}

async function seedDefaults() {
  try {
    const adminExists = await Admin.findOne({ email: defaultAdminEmail.toLowerCase() });
    if (!adminExists) {
      await Admin.create({
        email: defaultAdminEmail.toLowerCase(),
        password: await bcrypt.hash(defaultAdminPassword, 10)
      });
      console.log('Seeded admin account.');
    }

    if ((await Committee.countDocuments()) === 0) {
      const committees = await Promise.all(
        defaultCommitteeSeed.map(async (committee) => ({
          ...committee,
          headPassword: await bcrypt.hash(committee.headPassword, 10)
        }))
      );
      await Committee.insertMany(committees);
      console.log('Seeded committee records.');
    }

    const operationsCommittee = defaultCommitteeSeed.find((committee) => committee.name === 'OPERATIONS');
    if (!(await Committee.exists({ name: operationsCommittee.name }))) {
      await Committee.create({
        ...operationsCommittee,
        headPassword: await bcrypt.hash(operationsCommittee.headPassword, 10),
        interviewQuestions: defaultInterviewQuestions
      });
      console.log('Seeded Operations committee.');
    }

    if ((await FormSetting.countDocuments()) === 0) {
      await FormSetting.create({ fields: defaultFormFields, interviewQuestions: defaultInterviewQuestions });
      console.log('Seeded form settings.');
    }
  } catch (error) {
    console.error('Error seeding default data:', error);
    throw error;
  }
}

app.get('/api/form-settings', async (req, res) => {
  try {
    const settings = await FormSetting.findOne();
    res.json({
      fields: settings ? settings.fields : defaultFormFields,
      interviewQuestions: settings?.interviewQuestions?.length ? settings.interviewQuestions : defaultInterviewQuestions
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error loading form settings.' });
  }
});

app.put('/api/form-settings', requireAuth('admin'), async (req, res) => {
  try {
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(req.body, 'fields')) {
      if (!Array.isArray(req.body.fields)) {
        return res.status(400).json({ message: 'Fields must be an array.' });
      }
      updates.fields = req.body.fields;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'interviewQuestions')) {
      const questions = req.body.interviewQuestions;
      if (!Array.isArray(questions) || !questions.length || questions.some((question) => typeof question !== 'string' || !question.trim() || question.trim().length > 300)) {
        return res.status(400).json({ message: 'Add at least one interview question. Each question can be up to 300 characters.' });
      }
      updates.interviewQuestions = questions.map((question) => question.trim());
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'No form settings were provided.' });
    }

    const settings = await FormSetting.findOneAndUpdate({}, { $set: updates }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ message: 'Form settings updated successfully.', fields: settings.fields, interviewQuestions: settings.interviewQuestions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating form settings.' });
  }
});

app.get('/api/committees', async (req, res) => {
  try {
    const committees = await Committee.find().sort({ name: 1 }).lean();
    res.json({
      committees: committees.map((committee) => ({
        _id: committee._id,
        name: committee.name,
        headName: committee.headName,
        headEmail: committee.headEmail,
        slots: committee.slots || [],
        interviewQuestions: committee.interviewQuestions?.length ? committee.interviewQuestions : defaultInterviewQuestions
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error loading committees.' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid admin credentials.' });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid admin credentials.' });
    }

    const token = generateToken();
    sessions[token] = { type: 'admin', email: admin.email };
    res.json({ token, admin: { email: admin.email } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error during admin login.' });
  }
});

app.get('/api/admin/committees', requireAuth('admin'), async (req, res) => {
  try {
    const committees = await Committee.find().sort({ name: 1 }).lean();
    res.json({ committees });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error loading committee data.' });
  }
});

app.post('/api/admin/committees', requireAuth('admin'), async (req, res) => {
  try {
    const { name, headName, headEmail, headPassword, slots, interviewQuestions } = req.body;
    if (!name || !headName || !headEmail || !headPassword) {
      return res.status(400).json({ message: 'Committee name, head name, email, and password are required.' });
    }

    const existing = await Committee.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ message: 'A committee with this name already exists.' });
    }

    const committee = await Committee.create({
      name: name.trim(),
      headName: headName.trim(),
      headEmail: headEmail.trim().toLowerCase(),
      headPassword: await bcrypt.hash(headPassword.trim(), 10),
      slots: Array.isArray(slots) ? slots.filter(Boolean) : [],
      interviewQuestions: Array.isArray(interviewQuestions) ? interviewQuestions : defaultInterviewQuestions
    });

    res.status(201).json({ message: 'Committee created successfully.', committee });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating committee.' });
  }
});

app.put('/api/admin/committees/:id', requireAuth('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, headName, headEmail, headPassword, slots, interviewQuestions } = req.body;
    const committee = await Committee.findById(id);

    if (!committee) {
      return res.status(404).json({ message: 'Committee not found.' });
    }

    committee.name = name || committee.name;
    committee.headName = headName || committee.headName;
    committee.headEmail = headEmail ? headEmail.trim().toLowerCase() : committee.headEmail;
    committee.slots = Array.isArray(slots) ? slots.filter(Boolean) : committee.slots;
    if (interviewQuestions !== undefined) {
      if (!Array.isArray(interviewQuestions) || interviewQuestions.some((question) => typeof question !== 'string' || !question.trim() || question.trim().length > 300)) {
        return res.status(400).json({ message: 'Questions must be non-empty and no longer than 300 characters.' });
      }
      committee.interviewQuestions = interviewQuestions.map((question) => question.trim());
    }

    if (headPassword && headPassword.trim()) {
      committee.headPassword = await bcrypt.hash(headPassword.trim(), 10);
    }

    await committee.save();
    res.json({ message: 'Committee updated successfully.', committee });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating committee.' });
  }
});

app.delete('/api/admin/committees/:id', requireAuth('admin'), async (req, res) => {
  try {
    const committee = await Committee.findById(req.params.id);
    if (!committee) {
      return res.status(404).json({ message: 'Committee not found.' });
    }

    const applicationCount = await Application.countDocuments({ committee: committee.name });
    if (applicationCount > 0) {
      return res.status(409).json({
        message: `This committee has ${applicationCount} application(s). Delete them individually from the committee review page before deleting the committee.`
      });
    }

    await Committee.findByIdAndDelete(committee._id);
    res.json({ message: 'Committee deleted successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting committee.' });
  }
});

app.post('/api/head/login', async (req, res) => {
  try {
    const { committee, email, password } = req.body;
    if (!committee || !email || !password) {
      return res.status(400).json({ message: 'Committee, email, and password are required.' });
    }

    const record = await Committee.findOne({ name: committee.trim(), headEmail: email.trim().toLowerCase() });
    if (!record) {
      return res.status(401).json({ message: 'Invalid head credentials.' });
    }

    const isValid = await bcrypt.compare(password, record.headPassword);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid head credentials.' });
    }

    const token = generateToken();
    sessions[token] = { type: 'head', committee: record.name, headName: record.headName };
    res.json({ token, committee: record.name, headName: record.headName, email: record.headEmail });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error during head login.' });
  }
});

app.get('/api/head/applications', requireAuth('head'), async (req, res) => {
  try {
    const applications = await Application.find({ committee: req.session.committee }).sort({ createdAt: -1 }).lean();
    res.json({ applications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error loading applications.' });
  }
});

app.delete('/api/head/applications/:id', requireAuth('head'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid application ID.' });
    }

    const application = await Application.findOneAndDelete({ _id: id, committee: req.session.committee });
    if (!application) {
      return res.status(404).json({ message: 'Application not found for this committee.' });
    }

    res.json({ message: 'Application and all submitted data deleted.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting application.' });
  }
});

app.post('/api/applications', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, committee, interviewSlot, answers = {} } = req.body;

    if (!firstName || !lastName || !email || !phone || !committee || !interviewSlot) {
      return res.status(400).json({ message: 'All required fields must be filled.' });
    }

    const application = await Application.create({
      firstName,
      lastName,
      email,
      phone,
      committee,
      interviewSlot,
      answers,
      status: 'pending'
    });

    res.status(201).json({ message: 'Application submitted successfully.', application });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error submitting application.' });
  }
});

app.post('/api/head/applications/:id/interview', requireAuth('head'), async (req, res) => {
  try {
    const { id } = req.params;
    const { motivation, teamwork, communication, skills, notes, rating, photo, decision, questionPrompts, questionAnswers } = req.body;
    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    if (application.committee !== req.session.committee) {
      return res.status(403).json({ message: 'This application belongs to another committee.' });
    }

    if (questionAnswers !== undefined && (!Array.isArray(questionAnswers) || questionAnswers.some((item) => !item || typeof item.prompt !== 'string' || !item.prompt.trim() || typeof item.answer !== 'string'))) {
      return res.status(400).json({ message: 'Interview question answers are invalid.' });
    }

    const savedQuestionAnswers = Array.isArray(questionAnswers)
      ? questionAnswers.map((item) => ({ prompt: item.prompt.trim(), answer: item.answer }))
      : application.interview?.questionAnswers || [];
    const savedQuestionPrompts = savedQuestionAnswers.length
      ? savedQuestionAnswers.map((item) => item.prompt)
      : Array.isArray(questionPrompts) ? questionPrompts : application.interview?.questionPrompts || [];

    application.interview = {
      motivation: motivation || '',
      teamwork: teamwork || '',
      communication: communication || '',
      skills: skills || '',
      notes: notes || '',
      rating: Number(rating || 0),
      photo: photo || application.interview?.photo || '',
      questionPrompts: savedQuestionPrompts,
      questionAnswers: savedQuestionAnswers,
      decision: decision || null,
      completedAt: new Date()
    };

    if (decision === 'accepted') {
      application.status = 'accepted';
    } else if (decision === 'rejected') {
      application.status = 'rejected';
    } else {
      application.status = 'processing';
    }

    await application.save();
    res.json({ message: 'Interview updated successfully.', application });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating interview.' });
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/committee', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'committee.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startDatabase() {
  if (MONGO_URI) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log('Connected to MongoDB at:', MONGO_URI);
      return;
    } catch (error) {
      const shouldFallback = error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.syscall === 'querySrv' || error?.message?.includes('querySrv');
      if (!shouldFallback) {
        throw error;
      }

      console.warn('MongoDB Atlas connection failed. Falling back to persistent local MongoDB storage.');
    }
  }

  const localMongoPath = path.join(__dirname, 'data', 'mongodb-wiredtiger');
  fs.mkdirSync(localMongoPath, { recursive: true });
  mongoMemoryServer = await MongoMemoryServer.create({ instance: { dbPath: localMongoPath, storageEngine: 'wiredTiger' } });
  const memoryUri = mongoMemoryServer.getUri();
  await mongoose.connect(memoryUri);
  console.log('Started persistent local MongoDB at:', localMongoPath);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port);
  });
}

function acquireServerLock() {
  const releaseLock = () => {
    try {
      if (fs.readFileSync(serverLockPath, 'utf8') === String(process.pid)) {
        fs.unlinkSync(serverLockPath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Could not remove server lock:', error.message);
    }
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(serverLockPath, String(process.pid), { flag: 'wx' });
      process.once('exit', releaseLock);
      for (const signal of ['SIGTERM', 'SIGINT', 'SIGUSR2']) {
        process.once(signal, () => {
          releaseLock();
          process.exit(0);
        });
      }
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      const existingPid = Number(fs.readFileSync(serverLockPath, 'utf8'));
      try {
        process.kill(existingPid, 0);
        return false;
      } catch (processError) {
        if (processError.code === 'EPERM') return false;
        if (processError.code !== 'ESRCH') throw processError;
        fs.unlinkSync(serverLockPath);
      }
    }
  }
  return false;
}

async function startServer() {
  try {
    if (!acquireServerLock()) {
      console.log('Another club website server is already running. Use the existing instance at http://localhost:9000.');
      process.exit(0);
    }

    if (!(await isPortAvailable(PORT))) {
      console.log(`Port ${PORT} is already in use. The club website may already be running at http://localhost:${PORT}.`);
      process.exit(0);
    }

    await startDatabase();
    await seedDefaults();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  await mongoose.disconnect();
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
  }
  process.exit(0);
});

startServer();
