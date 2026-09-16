// backend/controllers/bookingController.js
import pool from '../config/db.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// 1. Create a Booking (and Razorpay Order)
export const createBooking = async (req, res) => {
    const { vehicle_id, station_id, charger_id, booking_date, start_time, end_time, amount } = req.body;
    const userId = req.user.id;

    if (!vehicle_id || !station_id || !charger_id || !booking_date || !start_time || !end_time || !amount) {
        return res.status(400).json({ success: false, message: 'Missing required booking details.' });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // [CRITICAL] 1. Lock the charger row to prevent concurrent bookings on the same charger
        const [chargers] = await connection.query('SELECT status FROM chargers WHERE id = ? FOR UPDATE', [charger_id]);
        
        if (chargers.length === 0) {
            throw new Error('Charger not found.');
        }
        if (chargers[0].status === 'MAINTENANCE') {
            throw new Error('Charger is currently under maintenance.');
        }

        // 2. Check for overlapping bookings
        const overlapQuery = `
            SELECT id FROM bookings 
            WHERE charger_id = ? 
              AND booking_date = ? 
              AND status IN ('Pending', 'Confirmed', 'Active')
              AND (
                  (start_time <= ? AND end_time > ?) OR 
                  (start_time < ? AND end_time >= ?) OR
                  (start_time >= ? AND end_time <= ?)
              )
        `;
        const [conflicts] = await connection.query(overlapQuery, [
            charger_id, booking_date, 
            start_time, start_time, 
            end_time, end_time, 
            start_time, end_time
        ]);

        if (conflicts.length > 0) {
            throw new Error('This time slot is already booked. Please select another slot.');
        }

        // 3. Create the Razorpay Order
        const orderOptions = {
            amount: Math.round(amount * 100), // Razorpay expects amount in paise
            currency: 'INR',
            receipt: `rcpt_booking_${Date.now()}`
        };
        const razorpayOrder = await razorpay.orders.create(orderOptions);

        // 4. Insert Booking (Status: Pending)
        const [bookingResult] = await connection.query(
            `INSERT INTO bookings (user_id, vehicle_id, station_id, charger_id, booking_date, start_time, end_time, amount, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [userId, vehicle_id, station_id, charger_id, booking_date, start_time, end_time, amount]
        );
        const bookingId = bookingResult.insertId;

        // 5. Insert Payment Record (Status: Created)
        await connection.query(
            `INSERT INTO payments (booking_id, razorpay_order_id, amount, status) 
             VALUES (?, ?, ?, 'Created')`,
            [bookingId, razorpayOrder.id, amount]
        );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: 'Booking slot reserved. Proceed to payment.',
            bookingId,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            keyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        await connection.rollback();
        console.error('Booking Error:', error);
        return res.status(error.message.includes('booked') ? 409 : 500).json({ 
            success: false, 
            message: error.message || 'Failed to create booking.' 
        });
    } finally {
        connection.release();
    }
};

// 2. Verify Razorpay Payment (From Frontend)
export const verifyPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Payment details missing.' });
    }

    try {
        // 1. Verify Signature locally
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            // Update payment to failed
            await pool.query("UPDATE payments SET status = 'Failed' WHERE razorpay_order_id = ?", [razorpay_order_id]);
            return res.status(400).json({ success: false, message: 'Invalid payment signature. Payment failed.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 2. Mark Payment as Successful
            await connection.query(
                "UPDATE payments SET razorpay_payment_id = ?, status = 'Successful' WHERE razorpay_order_id = ?",
                [razorpay_payment_id, razorpay_order_id]
            );

            // 3. Mark Booking as Confirmed
            const [payment] = await connection.query("SELECT booking_id FROM payments WHERE razorpay_order_id = ?", [razorpay_order_id]);
            const bookingId = payment[0].booking_id;

            await connection.query("UPDATE bookings SET status = 'Confirmed' WHERE id = ?", [bookingId]);

            await connection.commit();

            return res.status(200).json({ 
                success: true, 
                message: 'Payment verified and booking confirmed successfully!',
                bookingId
            });
        } catch (dbError) {
            await connection.rollback();
            throw dbError;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Payment Verification Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error during verification.' });
    }
};

// 3. Get User Bookings (with Dynamic Status Evaluation)
export const getMyBookings = async (req, res) => {
    try {
        const userId = req.user.id;
        const [bookings] = await pool.query(
            `SELECT b.*, s.name as station_name, s.address, c.charger_number, c.charging_speed, p.status as payment_status 
             FROM bookings b
             JOIN charging_stations s ON b.station_id = s.id
             JOIN chargers c ON b.charger_id = c.id
             JOIN payments p ON b.id = p.booking_id
             WHERE b.user_id = ?
             ORDER BY b.booking_date DESC, b.start_time DESC`,
            [userId]
        );

        const now = new Date();

        // Dynamically evaluate and map past bookings as 'Completed'
        const updatedBookings = bookings.map(booking => {
            const bookingDateTime = new Date(`${booking.booking_date}T${booking.start_time || '00:00:00'}`);
            
            let currentStatus = booking.status;
            // If it's Confirmed, Pending, or Upcoming, but the scheduled time has elapsed, display it as Completed
            if (['Pending', 'Confirmed', 'Upcoming'].includes(currentStatus) && bookingDateTime < now) {
                currentStatus = 'Completed';
            }

            return {
                ...booking,
                status: currentStatus
            };
        });

        return res.status(200).json({ success: true, count: updatedBookings.length, data: updatedBookings });
    } catch (error) {
        console.error('Get Bookings Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch bookings.' });
    }
};