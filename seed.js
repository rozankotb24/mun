const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

const CommitteeHead = require('./models/CommitteeHead');

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://rozantarek17_db_user:zJmD84K4axKPyWhl@cluster0.mjk8bst.mongodb.net/university_club?retryWrites=true&w=majority&appName=Cluster0';

const committeeHeadSeed = [
  { name: 'rozan Tarek', committee: 'IT', email: 'head.it@university.edu', password: 'it123456' },
  { name: 'Mohammed Saleh', committee: 'PR', email: 'head.pr@university.edu', password: 'pr123456' },
  { name: 'Sara Haddad', committee: 'FINANCE', email: 'head.finance@university.edu', password: 'finance123' },
  { name: 'Ali Jamal', committee: 'MEDIA', email: 'head.media@university.edu', password: 'media1234' }
];

async function seed() {
  await mongoose.connect(MONGO_URI);

  const count = await CommitteeHead.countDocuments();
  if (count > 0) {
    console.log('Committee head accounts already exist.');
    process.exit(0);
  }

  const hashedHeads = await Promise.all(
    committeeHeadSeed.map(async (head) => ({
      ...head,
      password: await bcrypt.hash(head.password, 10)
    }))
  );

  await CommitteeHead.insertMany(hashedHeads);
  console.log('Committee head accounts seeded successfully.');
  process.exit(0);
}

seed().catch((error) => {
  console.error('Error seeding committee heads:', error);
  process.exit(1);
});
