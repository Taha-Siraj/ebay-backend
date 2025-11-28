# eBay Product Monitoring System

A comprehensive eBay product monitoring system that tracks product prices, stock status, and competitor information. Features automated monitoring, email alerts, supplier tracking, and detailed analytics.

## Features

- ✅ **Product Monitoring**: Automatically track eBay product prices and stock status
- ✅ **Supplier Tracking**: Monitor supplier prices (AliExpress, Amazon, etc.) for profit calculation
- ✅ **User-Specific Cron Schedules**: Per-user monitoring frequencies (15 minutes to 24 hours)
- ✅ **Email Alerts**: Get notified of price changes, stock updates, and supplier availability
- ✅ **Webhook Alerts**: Push monitoring events to Slack, Teams, Zapier, or any custom endpoint
- ✅ **Search & Filtering**: Advanced search, filtering, and pagination for products and alerts
- ✅ **Export Functions**: Export products and alerts as CSV or JSON
- ✅ **Password Reset**: Complete password reset flow with email tokens
- ✅ **User Profile**: Update profile information and change password
- ✅ **Retry Logic**: Automatic retry with exponential backoff for API calls
- ✅ **Rate Limiting**: Per-supplier rate limiting to avoid blocking
- ✅ **Competitor Monitoring**: Basic UK competitor comparison with alerts and history
- ✅ **Demo-safe Adapters**: eBay & supplier adapters return consistent sample data if API keys are missing

## Tech Stack

### Backend
- Node.js + Express
- MongoDB with Mongoose
- JWT Authentication
- Node-cron for scheduled tasks
- Nodemailer for email notifications
- Cheerio for web scraping

### Frontend
- React 18
- React Router
- Tailwind CSS
- Axios for API calls
- React Hot Toast for notifications
- Lucide React for icons

## Installation

### Prerequisites
- Node.js 18+ 
- MongoDB 6+
- npm or yarn

### Backend Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd ebay-monitoring-system
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp env.example .env
# Edit .env with your configuration
```

**Required environment variables:**
- `MONGO_URI` - MongoDB connection string (e.g., `mongodb://localhost:27017/ebay-monitor`)
- `JWT_SECRET` - Secret key for JWT tokens (use a strong random string)
- `FRONTEND_URL` - Frontend URL for CORS (e.g., `http://localhost:3000`)

**Optional but recommended:**
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` - For email notifications
- `EBAY_APP_ID` - eBay API credentials (optional, falls back to scraping)

4. **Start MongoDB**
```bash
# Using Docker
docker-compose up -d mongodb

# Or use your local MongoDB instance
# Make sure MongoDB is running on port 27017
```

5. **Seed database (optional)**
```bash
npm run seed
# This creates a demo user: demo@ebaymonitor.com / demo123
```

6. **Start the server**
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:5000`

**Verify the server is running:**
- Health check: `http://localhost:5000/health`
- You should see: `📌 Connected DB: ebaymonitor` in the console

### Frontend Setup

1. **Navigate to frontend directory**
```bash
cd frontend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure frontend (optional)**
```bash
# Create .env file if you need custom API URL
# By default, it uses Vite proxy to http://localhost:5000
```

4. **Start development server**
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

**First-time setup:**
1. Open `http://localhost:3000`
2. Click "Create an account" or use demo credentials:
   - Email: `demo@ebaymonitor.com`
   - Password: `demo123`
3. After login, you'll be redirected to the dashboard
4. The backend automatically ensures an admin user defined via `INIT_ADMIN_EMAIL` / `INIT_ADMIN_PASSWORD`

## Environment Variables

See `env.example` for all required environment variables. Key variables:

**Backend (.env):**
- `MONGO_URI`: MongoDB connection string (required, default `mongodb://127.0.0.1:27017/ebaymonitor`)
- `MONGO_DB_NAME`: Database name (default `ebaymonitor`)
- `JWT_SECRET`: Secret key for JWT tokens (required)
- `FRONTEND_URL`: Frontend URL for CORS (default: `http://localhost:3000`)
- `PORT`: Server port (default: `5000`)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`: Email configuration (optional)
- `EBAY_APP_ID`: eBay API application ID (optional, falls back to scraping/demo data)
- `COMPETITOR_PRICE_ALERT_PERCENT`: Minimum % difference before competitor alerts trigger (default `3`)
- `INIT_ADMIN_EMAIL` / `INIT_ADMIN_PASSWORD`: Admin account auto-created on boot

**Frontend (.env):**
- `VITE_API_URL`: Backend API URL (optional, defaults to `/api` with proxy)

## API Documentation

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password/:token` - Reset password
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/change-password` - Change password

### Products

- `GET /api/products` - Get all products (with search, filters, pagination)
  - Query params: `search`, `stockStatus`, `supplier`, `hasAlerts`, `page`, `limit`, `sortBy`, `sortOrder`
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Add new product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `POST /api/products/:id/sync` - Manually sync product
- `GET /api/products/export?format=csv|json` - Export products

### Alerts

- `GET /api/alerts` - Get all alerts (with filters, pagination)
  - Query params: `read`, `type`, `severity`, `page`, `limit`, `sortBy`, `sortOrder`
- `PUT /api/alerts/:id/read` - Mark alert as read
- `PUT /api/alerts/read-all` - Mark all alerts as read
- `DELETE /api/alerts/:id` - Delete alert
- `GET /api/alerts/export?format=csv|json` - Export alerts

### Settings

- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update user settings
  - `monitoringFrequency`: Monitoring frequency in minutes (15-1440)
  - `emailAlerts`: Enable/disable email alerts
  - `alertTypes`: Configure which alert types to receive
  - `priceChangeThreshold`: Price change threshold percentage

## Monitoring Flow

1. **User adds product** with eBay URL (and optionally supplier URL)
2. **System fetches** initial product data (live when keys are configured, demo-safe when offline)
3. **Cron job runs** based on user's monitoring frequency setting
4. **System checks** each product if enough time has passed since last check
5. **Price/stock changes** trigger alerts based on user's alert preferences
6. **Competitor comparison** finds UK sellers undercutting the listing
7. **Email and webhook notifications** fire when enabled in Settings
8. **Price history** (eBay, supplier, competitor) recorded for analytics

### Cron System

- Each user has their own cron job based on `monitoringFrequency` setting
- Minimum frequency: 15 minutes
- Cron jobs automatically restart when settings change
- Users without settings automatically receive sane defaults to keep monitoring running

## Deployment

### Docker Deployment

1. **Build and start services**
```bash
docker-compose up -d
```

2. **View logs**
```bash
docker-compose logs -f
```

### Manual Deployment

1. **Build frontend**
```bash
cd frontend
npm run build
```

2. **Set production environment variables**
```bash
NODE_ENV=production
MONGODB_URI=your_production_mongodb_uri
# ... other variables
```

3. **Start backend**
```bash
npm start
```

4. **Serve frontend** (using nginx or similar)
```bash
# Copy frontend/dist to your web server
```

## Project Structure

```
.
├── src/
│   ├── adapters/          # eBay and supplier adapters
│   ├── config/            # Database configuration
│   ├── controllers/        # Route controllers
│   ├── middleware/        # Auth middleware
│   ├── models/            # Mongoose models
│   ├── routes/            # Express routes
│   ├── scripts/           # Seed scripts
│   ├── services/          # Business logic (cron, monitoring, email)
│   └── utils/             # Utility functions
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── context/       # React context
│   │   └── pages/         # Page components
│   └── public/
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Error Handling & Retry Logic

- **eBay Adapter**: 3 retry attempts with exponential backoff (1s, 2s, 4s)
- **Supplier Adapter**: 3 retry attempts with exponential backoff + rate limiting (2s delay per supplier)
- **Data Validation**: Validates extracted data before returning
- **Graceful Degradation**: Falls back to scraping if API fails

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Helmet.js for security headers
- CORS configuration
- Input validation
- Rate limiting on supplier requests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Troubleshooting

### Backend Issues

**Database connection fails:**
- Ensure MongoDB is running: `docker-compose up -d mongodb` or start your local MongoDB
- Check `MONGO_URI` in `.env` is correct
- Verify the connection string format: `mongodb://localhost:27017/ebay-monitor`

**Port already in use:**
- Change `PORT` in `.env` to a different port (e.g., 5001)
- Or stop the process using port 5000

**CORS errors:**
- Ensure `FRONTEND_URL` in `.env` matches your frontend URL
- Default is `http://localhost:3000`

**Email not working:**
- Email is optional - the system works without it
- To enable: configure SMTP settings in `.env`
- For Gmail: use an App Password, not your regular password

### Frontend Issues

**API calls failing:**
- Ensure backend is running on port 5000
- Check browser console for CORS errors
- Verify Vite proxy is configured in `vite.config.js`

**Login not working:**
- Check browser console for errors
- Verify token is stored in localStorage
- Try clearing localStorage and logging in again

**Blank page after login:**
- Check browser console for JavaScript errors
- Verify all API endpoints are accessible
- Check network tab for failed requests

### General Issues

**Products not syncing:**
- Check backend logs for errors
- Verify cron service started: look for "Initialized X user cron jobs" in logs
- Check user settings: monitoring frequency must be set

**Alerts not appearing:**
- Verify email alerts are enabled in settings
- Check backend logs for alert creation
- Ensure products have been checked at least once

## Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## API Documentation

OpenAPI specification is available in `openapi.yaml`. You can:
- Import it into Postman
- Use it with Swagger UI
- View it in API documentation tools

## Support

For issues and questions, please open an issue on GitHub.

