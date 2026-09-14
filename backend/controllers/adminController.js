// backend/controllers/adminController.js
import pool from '../config/db.js';

// 1. Get Dashboard Analytics
export const getDashboardStats = async (req, res) => {
    try {
        const [userCount] = await pool.query("SELECT COUNT(*) as total FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'EV_USER')");
        const [stationCount] = await pool.query("SELECT COUNT(*) as total FROM charging_stations");
        const [bookingCount] = await pool.query("SELECT COUNT(*) as total FROM bookings WHERE DATE(created_at) = CURDATE()");
        const [revenue] = await pool.query("SELECT SUM(amount) as total FROM payments WHERE status = 'Successful'");
        const [activeSessions] = await pool.query("SELECT COUNT(*) as total FROM bookings WHERE status = 'Active'");

        // Data for charts (e.g., last 7 days bookings)
        const [dailyBookings] = await pool.query(`
            SELECT DATE(booking_date) as date, COUNT(*) as count 
            FROM bookings 
            WHERE booking_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(booking_date)
            ORDER BY date ASC
        `);

        return res.status(200).json({
            success: true,
            data: {
                totalUsers: userCount[0].total,
                totalStations: stationCount[0].total,
                todaysBookings: bookingCount[0].total,
                totalRevenue: revenue[0].total || 0,
                activeSessions: activeSessions[0].total,
                chartData: {
                    dailyBookings
                }
            }
        });
    } catch (error) {
        console.error('Admin Dashboard Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats.' });
    }
};

// 2. Manage Users (List & Update Status)
export const getAllUsers = async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT id, name, email, mobile, is_verified, status, created_at 
             FROM users 
             WHERE role_id = (SELECT id FROM roles WHERE name = 'EV_USER')
             ORDER BY created_at DESC`
        );
        return res.status(200).json({ success: true, count: users.length, data: users });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
    }
};

export const updateUserStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const { status } = req.body; // 'active' or 'blocked'

        if (!['active', 'blocked'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status.' });
        }

        await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
        return res.status(200).json({ success: true, message: `User account ${status} successfully.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update user status.' });
    }
};

// 3. View All Bookings
export const getAllBookings = async (req, res) => {
    try {
        const [bookings] = await pool.query(
            `SELECT b.id, b.booking_date, b.start_time, b.end_time, b.amount, b.status, 
                    u.name as user_name, s.name as station_name 
             FROM bookings b
             JOIN users u ON b.user_id = u.id
             JOIN charging_stations s ON b.station_id = s.id
             ORDER BY b.created_at DESC LIMIT 100`
        );
        return res.status(200).json({ success: true, count: bookings.length, data: bookings });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch bookings.' });
    }
};

// 4. Add a New Charging Station
export const addStation = async (req, res) => {
    try {
        const { name, address, latitude, longitude, contact, operating_hours } = req.body;

        const [result] = await pool.query(
            `INSERT INTO charging_stations (name, address, latitude, longitude, contact, operating_hours) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, address, latitude, longitude, contact, operating_hours || '24/7']
        );

        return res.status(201).json({ success: true, message: 'Station added successfully.', stationId: result.insertId });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to add station.' });
    }
};