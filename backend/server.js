// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// 1. Initialize Socket.IO FIRST before trying to use it
const io = new Server(server, {
    cors: { origin: '*' }
});

// 2. Set 'io' in app and listen for events
app.set('io', io);

io.on('connection', (socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);

    // Frontend can join a specific "station room" to only listen to updates for that station
    socket.on('joinStationRoom', (stationId) => {
        socket.join(`station_${stationId}`);
        console.log(`Client ${socket.id} joined room: station_${stationId}`);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// 3. Import Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const stationRoutes = require('./routes/stationRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const placesRoutes = require('./routes/placesRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');

// 4. Security & Utility Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. Health Check Route
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'success', message: 'EV Charge Hub API is running' });
});

// 6. Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);

// 7. Start Server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});