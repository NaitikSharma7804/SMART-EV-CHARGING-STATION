// ============================================================
// EV CHARGE HUB
// BOOKING CONTROLLER
// ============================================================

import pool from '../config/db.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';


// ============================================================
// RAZORPAY
// ============================================================

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


// ============================================================
// SMALL HELPERS
// ============================================================

function normalizeTime(time) {

    if (!time) {
        return null;
    }

    if (typeof time === 'string') {
        return time.substring(0, 8);
    }

    if (time instanceof Date) {
        return time.toTimeString().substring(0, 8);
    }

    return String(time).substring(0, 8);
}


function normalizeDate(date) {

    if (!date) {
        return null;
    }

    if (typeof date === 'string') {
        return date.substring(0, 10);
    }

    if (date instanceof Date) {

        const year = date.getFullYear();

        const month = String(
            date.getMonth() + 1
        ).padStart(2, '0');

        const day = String(
            date.getDate()
        ).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    return String(date).substring(0, 10);
}


function getDateTime(
    bookingDate,
    time
) {

    const date = normalizeDate(bookingDate);
    const normalizedTime = normalizeTime(time);

    if (!date || !normalizedTime) {
        return null;
    }

    const result = new Date(
        `${date}T${normalizedTime}`
    );

    if (Number.isNaN(result.getTime())) {
        return null;
    }

    return result;
}


function minutesFromTime(time) {

    if (!time) {
        return NaN;
    }

    const parts = String(time)
        .substring(0, 5)
        .split(':')
        .map(Number);

    if (
        parts.length !== 2 ||
        Number.isNaN(parts[0]) ||
        Number.isNaN(parts[1])
    ) {
        return NaN;
    }

    return (
        parts[0] * 60 +
        parts[1]
    );
}


function isValidDateString(date) {

    if (!date) {
        return false;
    }

    const value = String(date);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const parsed = new Date(
        `${value}T00:00:00`
    );

    return !Number.isNaN(
        parsed.getTime()
    );
}


function getEffectiveStatus(
    booking
) {

    const originalStatus =
        String(
            booking.status || ''
        ).trim();

    // --------------------------------------------------------
    // NEVER CHANGE CANCELLED
    // --------------------------------------------------------

    if (
        originalStatus.toLowerCase() ===
        'cancelled'
    ) {
        return 'Cancelled';
    }


    // --------------------------------------------------------
    // ALREADY COMPLETED
    // --------------------------------------------------------

    if (
        originalStatus.toLowerCase() ===
        'completed'
    ) {
        return 'Completed';
    }


    // --------------------------------------------------------
    // CHECK END TIME
    // --------------------------------------------------------

    const startDateTime =
        getDateTime(
            booking.booking_date,
            booking.start_time
        );

    const endDateTime =
        getDateTime(
            booking.booking_date,
            booking.end_time
        );

    if (
        startDateTime &&
        endDateTime
    ) {

        // Overnight booking
        // Example: 23:30 -> 00:30

        if (
            endDateTime <
            startDateTime
        ) {

            endDateTime.setDate(
                endDateTime.getDate() + 1
            );
        }


        if (
            endDateTime <= new Date()
        ) {

            return 'Completed';
        }
    }


    // --------------------------------------------------------
    // ACTIVE
    // --------------------------------------------------------

    if (
        originalStatus.toLowerCase() ===
        'active'
    ) {
        return 'Active';
    }


    // --------------------------------------------------------
    // CONFIRMED / PENDING
    // --------------------------------------------------------

    if (
        originalStatus.toLowerCase() ===
        'confirmed'
    ) {
        return 'Upcoming';
    }


    if (
        originalStatus.toLowerCase() ===
        'pending'
    ) {
        return 'Pending';
    }


    return originalStatus || 'Pending';
}


// ============================================================
// CREATE BOOKING
// POST /api/bookings
// ============================================================

export const createBooking = async (
    req,
    res
) => {

    const {

        vehicle_id,

        station_id,

        charger_id,

        slot_id,

        booking_date,

        start_time,

        end_time,

        amount

    } = req.body;


    // --------------------------------------------------------
    // AUTHENTICATED USER
    // --------------------------------------------------------

    const userId =
        req.user?.id ||
        req.user?.userId;


    if (!userId) {

        return res.status(401).json({

            success: false,

            message:
                'Authentication required.'

        });
    }


    // --------------------------------------------------------
    // REQUIRED FIELDS
    // --------------------------------------------------------

    if (
        !vehicle_id ||
        !station_id ||
        !charger_id ||
        !booking_date ||
        !start_time ||
        !end_time ||
        amount === undefined ||
        amount === null
    ) {

        return res.status(400).json({

            success: false,

            message:
                'Missing required booking details.'

        });
    }


    // --------------------------------------------------------
    // VALIDATE DATE
    // --------------------------------------------------------

    if (
        !isValidDateString(
            booking_date
        )
    ) {

        return res.status(400).json({

            success: false,

            message:
                'Invalid booking date.'

        });
    }


    // --------------------------------------------------------
    // VALIDATE TIME
    // --------------------------------------------------------

    const startMinutes =
        minutesFromTime(
            start_time
        );

    const endMinutes =
        minutesFromTime(
            end_time
        );


    if (
        Number.isNaN(startMinutes) ||
        Number.isNaN(endMinutes)
    ) {

        return res.status(400).json({

            success: false,

            message:
                'Invalid booking time.'

        });
    }


    if (
        startMinutes ===
        endMinutes
    ) {

        return res.status(400).json({

            success: false,

            message:
                'Start time and end time cannot be the same.'

        });
    }


    // --------------------------------------------------------
    // AMOUNT
    // --------------------------------------------------------

    const numericAmount =
        Number(amount);


    if (
        !Number.isFinite(
            numericAmount
        ) ||
        numericAmount <= 0
    ) {

        return res.status(400).json({

            success: false,

            message:
                'Invalid booking amount.'

        });
    }


    const connection =
        await pool.getConnection();


    try {

        await connection.beginTransaction();


        // ====================================================
        // VERIFY USER
        // ====================================================

        const [users] =
            await connection.query(
                `
                SELECT
                    id,
                    name,
                    email
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [userId]
            );


        if (
            users.length === 0
        ) {

            throw new Error(
                'User account not found.'
            );
        }


        // ====================================================
        // VERIFY VEHICLE
        // ====================================================

        const [vehicles] =
            await connection.query(
                `
                SELECT
                    id,
                    user_id,
                    vehicle_name,
                    vehicle_number,
                    connector_type
                FROM vehicles
                WHERE id = ?
                AND user_id = ?
                LIMIT 1
                `,
                [
                    vehicle_id,
                    userId
                ]
            );


        if (
            vehicles.length === 0
        ) {

            throw new Error(
                'Selected vehicle does not belong to your account.'
            );
        }


        // ====================================================
        // VERIFY STATION
        // ====================================================

        const [stations] =
            await connection.query(
                `
                SELECT
                    id,
                    name,
                    address,
                    city,
                    state,
                    status
                FROM charging_stations
                WHERE id = ?
                LIMIT 1
                `,
                [station_id]
            );


        if (
            stations.length === 0
        ) {

            throw new Error(
                'Charging station not found.'
            );
        }


        const station =
            stations[0];


        if (
            String(
                station.status || ''
            ).toLowerCase() !==
            'active'
        ) {

            throw new Error(
                'This charging station is currently unavailable.'
            );
        }


        // ====================================================
        // VERIFY CHARGER
        // ====================================================

        const [chargers] =
            await connection.query(
                `
                SELECT
                    id,
                    station_id,
                    charger_number,
                    charger_type,
                    connector_type,
                    power_kw,
                    price_per_hour,
                    status
                FROM chargers
                WHERE id = ?
                LIMIT 1
                FOR UPDATE
                `,
                [charger_id]
            );


        if (
            chargers.length === 0
        ) {

            throw new Error(
                'Charger not found.'
            );
        }


        const charger =
            chargers[0];


        // ----------------------------------------------------
        // CHARGER MUST BELONG TO STATION
        // ----------------------------------------------------

        if (
            Number(
                charger.station_id
            ) !==
            Number(station_id)
        ) {

            throw new Error(
                'Selected charger does not belong to this station.'
            );
        }


        // ----------------------------------------------------
        // CHARGER STATUS
        // ----------------------------------------------------

        const chargerStatus =
            String(
                charger.status || ''
            ).toUpperCase();


        if (
            chargerStatus ===
            'MAINTENANCE'
        ) {

            throw new Error(
                'Charger is currently under maintenance.'
            );
        }


        if (
            chargerStatus ===
            'OFFLINE'
        ) {

            throw new Error(
                'Charger is currently offline.'
            );
        }


        if (
            chargerStatus ===
            'OCCUPIED'
        ) {

            // Occupied does not necessarily mean
            // unavailable for a future booking.
            //
            // We rely on booking overlap validation below.
        }


        // ====================================================
        // CHECK CONNECTOR COMPATIBILITY
        // ====================================================

        const vehicleConnector =
            String(
                vehicles[0].connector_type || ''
            )
                .trim()
                .toLowerCase();


        const chargerConnector =
            String(
                charger.connector_type || ''
            )
                .trim()
                .toLowerCase();


        if (
            vehicleConnector &&
            chargerConnector &&
            vehicleConnector !==
            chargerConnector
        ) {

            throw new Error(
                `Connector mismatch. Your vehicle uses ${vehicles[0].connector_type}, but this charger uses ${charger.connector_type}.`
            );
        }


        // ====================================================
        // CHECK BOOKING OVERLAP
        // ====================================================

        let conflicts = [];


        if (
            endMinutes >
            startMinutes
        ) {

            // ------------------------------------------------
            // NORMAL SAME-DAY BOOKING
            // ------------------------------------------------

            const [rows] =
                await connection.query(
                    `
                    SELECT
                        id
                    FROM bookings
                    WHERE charger_id = ?
                    AND booking_date = ?
                    AND status IN
                    (
                        'Pending',
                        'Confirmed',
                        'Active'
                    )
                    AND start_time < ?
                    AND end_time > ?
                    LIMIT 1
                    `,
                    [
                        charger_id,
                        booking_date,
                        end_time,
                        start_time
                    ]
                );


            conflicts =
                rows;

        } else {

            // ------------------------------------------------
            // OVERNIGHT BOOKING
            //
            // Example:
            //
            // 23:30 -> 00:30
            // ------------------------------------------------

            const [
                sameDayRows
            ] =
                await connection.query(
                    `
                    SELECT
                        id
                    FROM bookings
                    WHERE charger_id = ?
                    AND booking_date = ?
                    AND status IN
                    (
                        'Pending',
                        'Confirmed',
                        'Active'
                    )
                    AND start_time < '23:59:59'
                    AND end_time > ?
                    LIMIT 1
                    `,
                    [
                        charger_id,
                        booking_date,
                        start_time
                    ]
                );


            conflicts =
                sameDayRows;


            // ------------------------------------------------
            // NEXT DAY
            // ------------------------------------------------

            if (
                conflicts.length === 0
            ) {

                const bookingDate =
                    new Date(
                        `${booking_date}T00:00:00`
                    );


                bookingDate.setDate(
                    bookingDate.getDate() + 1
                );


                const nextDate =
                    bookingDate
                        .toISOString()
                        .slice(0, 10);


                const [
                    nextDayRows
                ] =
                    await connection.query(
                        `
                        SELECT
                            id
                        FROM bookings
                        WHERE charger_id = ?
                        AND booking_date = ?
                        AND status IN
                        (
                            'Pending',
                            'Confirmed',
                            'Active'
                        )
                        AND start_time < ?
                        LIMIT 1
                        `,
                        [
                            charger_id,
                            nextDate,
                            end_time
                        ]
                    );


                conflicts =
                    nextDayRows;
            }
        }


        if (
            conflicts.length > 0
        ) {

            throw new Error(
                'This time slot is already booked. Please select another slot.'
            );
        }


        // ====================================================
        // CREATE RAZORPAY ORDER
        // ====================================================

        const orderOptions = {

            amount:
                Math.round(
                    numericAmount * 100
                ),

            currency:
                'INR',

            receipt:
                `booking_${Date.now()}_${userId}`

        };


        const razorpayOrder =
            await razorpay.orders.create(
                orderOptions
            );


        if (
            !razorpayOrder ||
            !razorpayOrder.id
        ) {

            throw new Error(
                'Unable to create Razorpay order.'
            );
        }


        // ====================================================
        // INSERT REAL DATABASE BOOKING
        // ====================================================

        const [bookingResult] =
            await connection.query(
                `
                INSERT INTO bookings
                (
                    user_id,
                    vehicle_id,
                    station_id,
                    charger_id,
                    slot_id,
                    booking_date,
                    start_time,
                    end_time,
                    status,
                    amount,
                    razorpay_order_id,
                    payment_status
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'Pending',
                    ?,
                    ?,
                    'Pending'
                )
                `,
                [
                    userId,
                    vehicle_id,
                    station_id,
                    charger_id,
                    slot_id || null,
                    booking_date,
                    start_time,
                    end_time,
                    numericAmount,
                    razorpayOrder.id
                ]
            );


        const bookingId =
            bookingResult.insertId;


        // ====================================================
        // CREATE PAYMENT RECORD
        // ====================================================

        await connection.query(
            `
            INSERT INTO payments
            (
                booking_id,
                user_id,
                amount,
                currency,
                razorpay_order_id,
                status
            )
            VALUES
            (
                ?,
                ?,
                ?,
                'INR',
                ?,
                'Pending'
            )
            `,
            [
                bookingId,
                userId,
                numericAmount,
                razorpayOrder.id
            ]
        );


        // ====================================================
        // COMMIT
        // ====================================================

        await connection.commit();


        // ====================================================
        // RESPONSE
        // ====================================================

        return res.status(201).json({

            success: true,

            message:
                'Booking created. Proceed to payment.',

            bookingId:
                bookingId,

            razorpayOrderId:
                razorpayOrder.id,

            amount:
                razorpayOrder.amount,

            currency:
                razorpayOrder.currency,

            keyId:
                process.env.RAZORPAY_KEY_ID

        });


    } catch (error) {

        try {

            await connection.rollback();

        } catch (rollbackError) {

            console.error(
                'Rollback error:',
                rollbackError
            );
        }


        console.error(
            'Booking Error:',
            error
        );


        const message =
            String(
                error.message || ''
            );


        const isConflict =
            message
                .toLowerCase()
                .includes(
                    'already booked'
                );


        return res.status(
            isConflict
                ? 409
                : 500
        ).json({

            success: false,

            message:
                message ||
                'Failed to create booking.'

        });


    } finally {

        connection.release();

    }

};


// ============================================================
// VERIFY RAZORPAY PAYMENT
// POST /api/bookings/verify-payment
// ============================================================

export const verifyPayment = async (
    req,
    res
) => {

    const {

        razorpay_order_id,

        razorpay_payment_id,

        razorpay_signature,

        payment_method

    } = req.body;


    // --------------------------------------------------------
    // AUTH
    // --------------------------------------------------------

    const userId =
        req.user?.id ||
        req.user?.userId;


    if (!userId) {

        return res.status(401).json({

            success: false,

            message:
                'Authentication required.'

        });
    }


    // --------------------------------------------------------
    // REQUIRED PAYMENT DATA
    // --------------------------------------------------------

    if (
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature
    ) {

        return res.status(400).json({

            success: false,

            message:
                'Payment details missing.'

        });
    }


    try {

        // ====================================================
        // VERIFY RAZORPAY SIGNATURE
        // ====================================================

        const body =
            razorpay_order_id +
            '|' +
            razorpay_payment_id;


        const expectedSignature =
            crypto
                .createHmac(
                    'sha256',
                    process.env.RAZORPAY_KEY_SECRET
                )
                .update(body)
                .digest('hex');


        if (
            expectedSignature !==
            razorpay_signature
        ) {

            await pool.query(
                `
                UPDATE payments
                SET status = 'Failed'
                WHERE razorpay_order_id = ?
                AND user_id = ?
                `,
                [
                    razorpay_order_id,
                    userId
                ]
            );


            await pool.query(
                `
                UPDATE bookings
                SET payment_status = 'Failed'
                WHERE razorpay_order_id = ?
                AND user_id = ?
                `,
                [
                    razorpay_order_id,
                    userId
                ]
            );


            return res.status(400).json({

                success: false,

                message:
                    'Invalid payment signature.'

            });
        }


        // ====================================================
        // DATABASE TRANSACTION
        // ====================================================

        const connection =
            await pool.getConnection();


        try {

            await connection.beginTransaction();


            // =================================================
            // GET PAYMENT
            // =================================================

            const [payments] =
                await connection.query(
                    `
                    SELECT
                        id,
                        booking_id,
                        user_id,
                        amount,
                        status
                    FROM payments
                    WHERE razorpay_order_id = ?
                    AND user_id = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        razorpay_order_id,
                        userId
                    ]
                );


            if (
                payments.length === 0
            ) {

                throw new Error(
                    'Payment record not found.'
                );
            }


            const payment =
                payments[0];


            // =================================================
            // UPDATE PAYMENT
            // =================================================

            await connection.query(
                `
                UPDATE payments

                SET

                    razorpay_payment_id = ?,

                    razorpay_signature = ?,

                    status = 'Success',

                    payment_method = ?

                WHERE id = ?
                `,
                [
                    razorpay_payment_id,
                    razorpay_signature,
                    payment_method || null,
                    payment.id
                ]
            );


            // =================================================
            // UPDATE BOOKING
            // =================================================

            await connection.query(
                `
                UPDATE bookings

                SET

                    status = 'Confirmed',

                    payment_status = 'Paid',

                    razorpay_order_id = ?,

                    razorpay_payment_id = ?

                WHERE id = ?

                AND user_id = ?
                `,
                [
                    razorpay_order_id,
                    razorpay_payment_id,
                    payment.booking_id,
                    userId
                ]
            );


            // =================================================
            // COMMIT
            // =================================================

            await connection.commit();


            // =================================================
            // RESPONSE
            // =================================================

            return res.status(200).json({

                success: true,

                message:
                    'Payment verified and booking confirmed successfully.',

                bookingId:
                    payment.booking_id,

                paymentId:
                    razorpay_payment_id,

                orderId:
                    razorpay_order_id

            });


        } catch (dbError) {

            try {

                await connection.rollback();

            } catch (rollbackError) {

                console.error(
                    'Rollback error:',
                    rollbackError
                );
            }


            throw dbError;


        } finally {

            connection.release();

        }


    } catch (error) {

        console.error(
            'Payment Verification Error:',
            error
        );


        return res.status(500).json({

            success: false,

            message:
                error.message ||
                'Internal server error during payment verification.'

        });

    }

};


// ============================================================
// GET MY BOOKINGS
// GET /api/bookings/my-bookings
// ============================================================

export const getMyBookings = async (
    req,
    res
) => {

    try {

        // ----------------------------------------------------
        // USER ID
        // ----------------------------------------------------

        const userId =
            req.user?.id ||
            req.user?.userId;


        if (!userId) {

            return res.status(401).json({

                success: false,

                message:
                    'Authentication required.'

            });
        }


        console.log(
            `Fetching bookings for user ${userId}`
        );


        // ====================================================
        // FETCH BOOKINGS
        //
        // IMPORTANT:
        //
        // chargers table contains:
        //
        // power_kw
        //
        // NOT:
        //
        // charging_speed
        //
        // We expose power_kw as charging_speed
        // in the returned JSON.
        // ====================================================

        const [bookings] =
            await pool.query(
                `
                SELECT

                    b.id,

                    b.user_id,

                    b.vehicle_id,

                    b.station_id,

                    b.charger_id,

                    b.slot_id,

                    b.booking_date,

                    b.start_time,

                    b.end_time,

                    b.status,

                    b.amount,

                    b.razorpay_order_id,

                    b.razorpay_payment_id,

                    b.payment_status,

                    b.created_at,

                    b.updated_at,


                    /* ======================================
                       STATION
                    ====================================== */

                    s.name AS station_name,

                    s.address AS address,

                    s.city AS city,

                    s.state AS state,

                    s.latitude AS latitude,

                    s.longitude AS longitude,

                    s.rating AS station_rating,

                    s.total_reviews AS station_total_reviews,


                    /* ======================================
                       CHARGER
                    ====================================== */

                    c.charger_number AS charger_number,

                    c.charger_type AS charger_type,

                    c.connector_type AS connector_type,

                    c.power_kw AS power_kw,

                    c.price_per_hour AS price_per_hour,

                    c.status AS charger_status,


                    /* ======================================
                       VEHICLE
                    ====================================== */

                    v.vehicle_name AS vehicle_name,

                    v.vehicle_number AS vehicle_number,

                    v.vehicle_model AS vehicle_model,

                    v.connector_type AS vehicle_connector_type,

                    v.battery_capacity AS battery_capacity,


                    /* ======================================
                       LATEST PAYMENT
                    ====================================== */

                    (
                        SELECT
                            p2.status
                        FROM payments p2
                        WHERE p2.booking_id = b.id
                        ORDER BY p2.id DESC
                        LIMIT 1
                    ) AS payment_record_status,


                    (
                        SELECT
                            p3.payment_method
                        FROM payments p3
                        WHERE p3.booking_id = b.id
                        ORDER BY p3.id DESC
                        LIMIT 1
                    ) AS payment_method,


                    (
                        SELECT
                            p4.razorpay_payment_id
                        FROM payments p4
                        WHERE p4.booking_id = b.id
                        ORDER BY p4.id DESC
                        LIMIT 1
                    ) AS payment_record_id


                FROM bookings b


                /* ======================================
                   STATION
                ====================================== */

                LEFT JOIN charging_stations s

                    ON b.station_id = s.id


                /* ======================================
                   CHARGER
                ====================================== */

                LEFT JOIN chargers c

                    ON b.charger_id = c.id


                /* ======================================
                   VEHICLE
                ====================================== */

                LEFT JOIN vehicles v

                    ON b.vehicle_id = v.id


                WHERE b.user_id = ?


                ORDER BY

                    b.booking_date DESC,

                    b.start_time DESC,

                    b.id DESC

                `,
                [userId]
            );


        console.log(
            `Found ${bookings.length} bookings for user ${userId}`
        );


        // ====================================================
        // UPDATE EFFECTIVE STATUS
        // ====================================================

        const updatedBookings =
            bookings.map(
                booking => {

                    const currentStatus =
                        getEffectiveStatus(
                            booking
                        );


                    // ------------------------------------------------
                    // PERSIST COMPLETED STATUS
                    // ------------------------------------------------

                    if (
                        currentStatus ===
                        'Completed' &&

                        String(
                            booking.status || ''
                        ).toLowerCase() !==
                        'completed' &&

                        String(
                            booking.status || ''
                        ).toLowerCase() !==
                        'cancelled'
                    ) {

                        pool.query(
                            `
                            UPDATE bookings

                            SET status = 'Completed'

                            WHERE id = ?

                            AND status IN
                            (
                                'Pending',
                                'Confirmed',
                                'Active'
                            )
                            `,
                            [booking.id]
                        )
                        .catch(
                            error => {

                                console.error(
                                    'Failed to persist Completed status:',
                                    error
                                );

                            }
                        );
                    }


                    // ------------------------------------------------
                    // CHARGING SPEED
                    // ------------------------------------------------

                    let chargingSpeed =
                        null;


                    if (
                        booking.power_kw !==
                        null &&

                        booking.power_kw !==
                        undefined
                    ) {

                        chargingSpeed =
                            `${booking.power_kw} kW`;

                    }


                    // ------------------------------------------------
                    // PAYMENT STATUS
                    // ------------------------------------------------

                    const paymentStatus =
                        booking.payment_record_status ||
                        booking.payment_status ||
                        'Pending';


                    // ------------------------------------------------
                    // VEHICLE DISPLAY
                    // ------------------------------------------------

                    let vehicleInfo =
                        booking.vehicle_name ||
                        'EV Vehicle';


                    if (
                        booking.vehicle_number
                    ) {

                        vehicleInfo +=
                            ` • ${booking.vehicle_number}`;

                    }


                    // ------------------------------------------------
                    // RETURN OBJECT
                    // ------------------------------------------------

                    return {

                        id:
                            booking.id,

                        booking_id:
                            booking.id,


                        user_id:
                            booking.user_id,


                        vehicle_id:
                            booking.vehicle_id,

                        vehicle_name:
                            booking.vehicle_name,

                        vehicle_number:
                            booking.vehicle_number,

                        vehicle_model:
                            booking.vehicle_model,

                        vehicle_info:
                            vehicleInfo,

                        vehicle_connector_type:
                            booking.vehicle_connector_type,

                        battery_capacity:
                            booking.battery_capacity,


                        station_id:
                            booking.station_id,

                        station_name:
                            booking.station_name ||
                            'EV Charging Station',

                        address:
                            booking.address ||
                            '',

                        city:
                            booking.city ||
                            '',

                        state:
                            booking.state ||
                            '',

                        latitude:
                            booking.latitude,

                        longitude:
                            booking.longitude,

                        station_rating:
                            booking.station_rating,

                        station_total_reviews:
                            booking.station_total_reviews,


                        charger_id:
                            booking.charger_id,

                        charger_number:
                            booking.charger_number,

                        charger_type:
                            booking.charger_type,

                        connector_type:
                            booking.connector_type,

                        charging_speed:
                            chargingSpeed,

                        power_kw:
                            booking.power_kw,

                        price_per_hour:
                            booking.price_per_hour,

                        charger_status:
                            booking.charger_status,


                        slot_id:
                            booking.slot_id,


                        booking_date:
                            normalizeDate(
                                booking.booking_date
                            ),

                        start_time:
                            normalizeTime(
                                booking.start_time
                            ),

                        end_time:
                            normalizeTime(
                                booking.end_time
                            ),


                        status:
                            currentStatus,

                        database_status:
                            booking.status,


                        amount:
                            Number(
                                booking.amount || 0
                            ),


                        payment_status:
                            paymentStatus,

                        payment_method:
                            booking.payment_method,

                        razorpay_order_id:
                            booking.razorpay_order_id,

                        razorpay_payment_id:
                            booking.razorpay_payment_id ||
                            booking.payment_record_id,


                        created_at:
                            booking.created_at,

                        updated_at:
                            booking.updated_at

                    };

                }
            );


        // ====================================================
        // RESPONSE
        // ====================================================

        return res.status(200).json({

            success: true,

            count:
                updatedBookings.length,

            data:
                updatedBookings,

            // ------------------------------------------------
            // Also return bookings for frontend compatibility.
            // Some versions of bookings.html use data,
            // others use bookings.
            // ------------------------------------------------

            bookings:
                updatedBookings

        });


    } catch (error) {

        console.error(
            'Get Bookings Error:',
            error
        );


        return res.status(500).json({

            success: false,

            message:
                'Failed to fetch bookings.',

            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined

        });

    }

};