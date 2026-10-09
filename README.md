# Workforce Management System

A full-stack workforce management application designed to simplify workforce operations, including company and worker management, client assignments, monthly timesheets, work records, and document management.

## Live Demo

- **Frontend:** [WorkForce Application](https://workforce-frontend-2abg.onrender.com)
- **Backend Health Check:** [API Health](https://workforce-backend-0q8h.onrender.com/api/health)

## Features

### Authentication
- Secure login for internal users.
- JWT-based authentication using HTTP-only cookies.
- Protected application routes and authenticated API endpoints.

### Company Management
- Create and manage companies.
- View company details and related workforce information.
- Access company-specific monthly work statistics.

### Worker Management
- Maintain worker profiles and employment details.
- Associate workers with companies.
- Track worker assignments and employment information.

### Client and Assignment Management
- Create and manage client records.
- Assign workers to clients.
- Maintain assignment history and work allocation details.

### Timesheet Management
- Upload monthly timesheets using Excel files.
- Validate uploaded data before confirmation.
- Confirm uploads to update monthly work records.
- Explicitly replace an existing active monthly timesheet when required.
- Track timesheet upload status and associated work records.

### Document Management
- Store worker-related documents in Cloudinary.
- Access documents through authenticated application workflows.

### Dashboard and Statistics
- View workforce information through a centralized dashboard.
- Monitor company-level monthly work statistics.
- Review work records and timesheet information.

## Tech Stack

**Frontend**
- React.js
- Vite
- Tailwind CSS
- React Router
- Axios

**Backend**
- Node.js
- Express.js
- REST APIs
- JWT
- HTTP-only cookies
- Zod validation

**Database and ORM**
- PostgreSQL
- Prisma ORM

**Cloud and Deployment**
- Neon — PostgreSQL hosting
- Cloudinary — document storage
- Render — application deployment
- Git and GitHub — version control

## Architecture

The application follows a client-server architecture:

1. The React frontend provides the interface for workforce operations.
2. The Express backend exposes REST APIs and handles business logic.
3. Prisma ORM communicates with the PostgreSQL database.
4. Authentication middleware protects private API endpoints.
5. Cloudinary stores worker documents, while the backend manages document access.

## Project Structure

```text
uae-labor-management/
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   └── routes/
|   ├── App.jsx/
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── utils/
│   │   └── server.js
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── scripts/
│   └── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js and npm
- PostgreSQL database
- Cloudinary account for document storage

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd uae-labor-management
```

### 2. Configure the Backend

```bash
cd backend
npm install
```

Create a `backend/.env` file:

```env
DATABASE_URL="YOUR_POSTGRESQL_CONNECTION_STRING"
PORT=4000
NODE_ENV=development
JWT_SECRET="YOUR_SECRET_AT_LEAST_16_CHARACTERS"
JWT_EXPIRES_IN=7d
COOKIE_NAME=yts_session
CORS_ORIGIN=http://localhost:5173

STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME="YOUR_CLOUD_NAME"
CLOUDINARY_API_KEY="YOUR_API_KEY"
CLOUDINARY_API_SECRET="YOUR_API_SECRET"
```

Use your own credentials. Never commit `.env` files or expose database passwords, JWT secrets, or Cloudinary API secrets.

### 3. Set Up the Database

Generate the Prisma client:

```bash
npx prisma generate
```

Apply migrations to your development database:

```bash
npx prisma migrate deploy
```

Create an internal application user using the provided script:

```bash
node scripts/create-user.js
```

If the role-seeding script is present, seed the roles:

```bash
node scripts/seed-roles.js
```

### 4. Start the Backend

```bash
npm start
```

The backend typically runs at `http://localhost:4000`.

Health check: `http://localhost:4000/api/health`

### 5. Configure and Start the Frontend

Open a separate terminal:

```bash
cd frontend
npm install
```

Create a `frontend/.env` file, adjusting the variables to match your frontend configuration:

```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_USE_MOCK_API=false
```

Start the development server:

```bash
npm run dev
```

The frontend typically runs at `http://localhost:5173`.

## Timesheet Workflow

1. Select a company and reporting month.
2. Upload the corresponding Excel timesheet.
3. Review the validation results.
4. Confirm the upload to apply its work records.
5. Explicitly replace an existing active timesheet when necessary.

Manual work records are supported when no active timesheet exists for the relevant month, according to the application's business rules.

## Deployment

The application is deployed using Render, with Neon PostgreSQL for the production database and Cloudinary for document storage.

- **Frontend:** Render Static Site
- **Backend:** Render Web Service
- **Database:** Neon PostgreSQL
- **Document Storage:** Cloudinary

Configure production credentials through the hosting provider's environment settings rather than committing them to the repository.

## Security

- Passwords are stored as hashes rather than plaintext.
- JWTs are stored in HTTP-only cookies.
- Private API routes require authentication.
- Input validation is performed using Zod.
- Database access is managed through Prisma ORM.
- Production secrets are supplied through environment variables.

## Future Improvements

- Role-based access control and granular permissions.
- Automated document expiry reminders.
- Enhanced audit logging for workforce changes.
- More detailed reporting and analytics.
- Automated testing and CI/CD workflows.

## Author

**Yenedla Srideep**  
B.Tech — Electronics and Communication Engineering  
National Institute of Technology, Raipur

- GitHub: [Srideep-64](https://github.com/Srideep-64)
