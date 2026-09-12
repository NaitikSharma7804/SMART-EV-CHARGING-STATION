// backend/controllers/reviewController.js
const pool = require('../config/db');

// 1. Add a Review
exports.addReview = async (req, res) => {
    try {
        const userId = req.user.id;
        const { station_id, booking_id, rating, comment } = req.body;

        if (!station_id || !booking_id || !rating) {
            return res.status(400).json({ success: false, message: 'Station ID, Booking ID, and Rating are required.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Verify booking belongs to user and is completed
            const [bookings] = await connection.query(
                "SELECT id FROM bookings WHERE id = ? AND user_id = ? AND station_id = ? AND status = 'Completed'",
                [booking_id, userId, station_id]
            );

            if (bookings.length === 0) {
                throw new Error('You can only review a station after a completed charging session.');
            }

            // Check if review already exists for this booking
            const [existing] = await connection.query('SELECT id FROM reviews WHERE booking_id = ?', [booking_id]);
            if (existing.length > 0) {
                throw new Error('You have already submitted a review for this booking.');
            }

            // Insert Review
            await connection.query(
                'INSERT INTO reviews (user_id, station_id, booking_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
                [userId, station_id, booking_id, rating, comment || null]
            );

            // Update average rating for the station
            await connection.query(
                `UPDATE charging_stations 
                 SET rating = (SELECT AVG(rating) FROM reviews WHERE station_id = ?) 
                 WHERE id = ?`,
                [station_id, station_id]
            );

            await connection.commit();
            return res.status(201).json({ success: true, message: 'Review submitted successfully.' });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Add Review Error:', error);
        return res.status(400).json({ success: false, message: error.message || 'Failed to submit review.' });
    }
};

// 2. Get Station Reviews (Public route)
exports.getStationReviews = async (req, res) => {
    try {
        const stationId = req.params.stationId;

        const [reviews] = await pool.query(
            `SELECT r.id, r.rating, r.comment, r.created_at, u.name as user_name 
             FROM reviews r
             JOIN users u ON r.user_id = u.id
             WHERE r.station_id = ?
             ORDER BY r.created_at DESC`,
            [stationId]
        );

        return res.status(200).json({ success: true, count: reviews.length, data: reviews });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch reviews.' });
    }
};