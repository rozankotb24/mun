# University Club Application System

This project is a full-stack university club website built with HTML, CSS, JavaScript, Express, and MongoDB.

## Features

- Student application form
- Committee selection for IT, PR, FINANCE, MEDIA, and OPERATIONS
- Interview slot selection
- Committee head login for each club committee
- Application review dashboard
- Interview evaluation form
- Photo upload support
- Accept or reject decision

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the project:

```bash
npm start
```

If you want to use a real MongoDB instance instead of the built-in memory database, create a `.env` file:

```bash
copy .env.example .env
```

Then update `MONGODB_URI` to your MongoDB connection string.

Then open:

```text
http://localhost:9000
```

## Demo Committee Head Accounts

- IT: head.it@university.edu / it123456
- PR: head.pr@university.edu / pr123456
- FINANCE: head.finance@university.edu / finance123
- MEDIA: head.media@university.edu / media1234

## Notes

The app uses MongoDB Atlas when `MONGODB_URI` is available. If Atlas cannot be reached, it starts a local MongoDB database in `data/mongodb-wiredtiger`, which survives server restarts. Keep this directory to retain locally stored applications.

Applications are not automatically deleted when a committee is deleted; a committee with applications cannot be deleted until those applications are manually removed from its review page. Individual applications can be removed with the Delete action in committee review.

## Operations Head Account

- OPERATIONS: head.operations@university.edu / operations123
