// backend/controllers/reviewController.js

import pool from '../config/db.js';


// =========================================================
// ADD REVIEW
// =========================================================

export const addReview = async (
    req,
    res
) => {

    let connection;


    try {

        const userId =
            req.user.id;


        const {
            station_id,
            booking_id,
            rating,
            comment
        } = req.body;


        // =====================================================
        // VALIDATION
        // =====================================================

        if (
            !station_id ||
            !booking_id ||
            !rating
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Station ID, Booking ID, and Rating are required.'

            });

        }


        const numericRating =
            Number(rating);


        if (
            !Number.isInteger(
                numericRating
            ) ||
            numericRating < 1 ||
            numericRating > 5
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Rating must be between 1 and 5.'

            });

        }


        connection =
            await pool.getConnection();


        await connection.beginTransaction();


        // =====================================================
        // FIND USER'S BOOKING
        // =====================================================

        const [bookings] =
            await connection.query(
                `
                SELECT
                    id,
                    user_id,
                    station_id,
                    booking_date,
                    start_time,
                    end_time,
                    status

                FROM bookings

                WHERE id = ?
                AND user_id = ?
                AND station_id = ?

                LIMIT 1
                `,
                [
                    booking_id,
                    userId,
                    station_id
                ]
            );


        if (
            bookings.length === 0
        ) {

            await connection.rollback();


            return res.status(404).json({

                success: false,

                message:
                    'Booking not found or this booking does not belong to you.'

            });

        }


        const booking =
            bookings[0];


        // =====================================================
        // CANCELLED BOOKING
        // =====================================================

        if (
            String(
                booking.status
            ).toLowerCase() ===
            'cancelled'
        ) {

            await connection.rollback();


            return res.status(400).json({

                success: false,

                message:
                    'Cancelled bookings cannot be reviewed.'

            });

        }


        // =====================================================
        // CALCULATE REAL END DATETIME
        // =====================================================

        const dateText =
            String(
                booking.booking_date
            ).slice(0, 10);


        const startText =
            String(
                booking.start_time ||
                '00:00:00'
            ).slice(0, 8);


        const endText =
            String(
                booking.end_time ||
                '00:00:00'
            ).slice(0, 8);


        const startDateTime =
            new Date(
                `${dateText}T${startText}`
            );


        const endDateTime =
            new Date(
                `${dateText}T${endText}`
            );


        /*
         * Overnight:
         *
         * 23:40 -> 00:00
         *
         * End is next day.
         */

        if (
            endDateTime <
            startDateTime
        ) {

            endDateTime.setDate(
                endDateTime.getDate() + 1
            );

        }


        const sessionHasEnded =
            !Number.isNaN(
                endDateTime.getTime()
            ) &&
            endDateTime <=
            new Date();


        // =====================================================
        // ACCEPT EITHER:
        //
        // 1. Database already says Completed
        // 2. Scheduled end time has passed
        // =====================================================

        const isCompleted =
            String(
                booking.status
            ).toLowerCase() ===
            'completed'
            ||
            sessionHasEnded;


        if (
            !isCompleted
        ) {

            await connection.rollback();


            return res.status(400).json({

                success: false,

                message:
                    'You can only review a station after the charging session has ended.'

            });

        }


        // =====================================================
        // SAVE COMPLETED STATUS
        // =====================================================

        if (
            String(
                booking.status
            ).toLowerCase() !==
            'completed'
        ) {

            await connection.query(
                `
                UPDATE bookings
                SET status = 'Completed'
                WHERE id = ?
                `,
                [
                    booking.id
                ]
            );

        }


        // =====================================================
        // CHECK DUPLICATE REVIEW
        // =====================================================

        const [existing] =
            await connection.query(
                `
                SELECT id
                FROM reviews
                WHERE booking_id = ?
                LIMIT 1
                `,
                [
                    booking.id
                ]
            );


        if (
            existing.length > 0
        ) {

            await connection.rollback();


            return res.status(409).json({

                success: false,

                message:
                    'You have already submitted a review for this booking.'

            });

        }


        // =====================================================
        // INSERT REVIEW
        // =====================================================

        await connection.query(
            `
            INSERT INTO reviews
            (
                user_id,
                station_id,
                booking_id,
                rating,
                comment
            )
            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                ?
            )
            `,
            [
                userId,
                station_id,
                booking.id,
                numericRating,
                comment
                    ? String(comment).trim()
                    : null
            ]
        );


        // =====================================================
        // UPDATE STATION RATING
        // =====================================================

        await connection.query(
            `
            UPDATE charging_stations

            SET rating = (
                SELECT
                    COALESCE(
                        AVG(rating),
                        0
                    )
                FROM reviews
                WHERE station_id = ?
            )

            WHERE id = ?
            `,
            [
                station_id,
                station_id
            ]
        );


        await connection.commit();


        return res.status(201).json({

            success: true,

            message:
                'Review submitted successfully.'

        });


    } catch (error) {

        if (connection) {

            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    'Rollback error:',
                    rollbackError
                );
            }

        }


        console.error(
            'Add Review Error:',
            error
        );


        return res.status(500).json({

            success: false,

            message:
                error.message ||
                'Failed to submit review.'

        });


    } finally {

        if (connection) {

            connection.release();

        }

    }

};


// =========================================================
// GET STATION REVIEWS
// =========================================================

export const getStationReviews =
async (
    req,
    res
) => {

    try {

        const stationId =
            req.params.stationId;


        const [reviews] =
            await pool.query(
                `
                SELECT
                    r.id,
                    r.rating,
                    r.comment,
                    r.created_at,
                    u.name AS user_name

                FROM reviews r

                JOIN users u
                    ON r.user_id = u.id

                WHERE r.station_id = ?

                ORDER BY
                    r.created_at DESC
                `,
                [
                    stationId
                ]
            );


        return res.status(200).json({

            success: true,

            count:
                reviews.length,

            data:
                reviews

        });


    } catch (error) {

        console.error(
            'Get Station Reviews Error:',
            error
        );


        return res.status(500).json({

            success: false,

            message:
                'Failed to fetch reviews.'

        });

    }

};