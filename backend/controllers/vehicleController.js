// ============================================================
// EV CHARGE HUB
// VEHICLE CONTROLLER
// ============================================================

import pool from '../config/db.js';


// ============================================================
// HELPER
// ============================================================

function getUserId(req) {
    return req.user?.id || req.user?.userId;
}


// ============================================================
// FORMAT VEHICLE
// ============================================================

function formatVehicle(vehicle) {
    return {
        id: vehicle.id,
        user_id: vehicle.user_id,

        // Database fields
        vehicle_name: vehicle.vehicle_name,
        vehicle_number: vehicle.vehicle_number,
        vehicle_model: vehicle.vehicle_model,
        connector_type: vehicle.connector_type,
        battery_capacity: vehicle.battery_capacity,
        created_at: vehicle.created_at,

        // Frontend compatibility fields
        make: vehicle.vehicle_name,
        model: vehicle.vehicle_model,
        regNumber: vehicle.vehicle_number,
        connector: vehicle.connector_type
    };
}


// ============================================================
// GET ALL VEHICLES
// GET /api/vehicles
// ============================================================

export const getVehicles = async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        const [vehicles] = await pool.query(
            `
            SELECT
                id,
                user_id,
                vehicle_name,
                vehicle_number,
                vehicle_model,
                connector_type,
                battery_capacity,
                created_at
            FROM vehicles
            WHERE user_id = ?
            ORDER BY created_at DESC
            `,
            [userId]
        );

        const formattedVehicles = vehicles.map(formatVehicle);

        console.log(
            `Found ${formattedVehicles.length} vehicles for user ${userId}`
        );

        return res.status(200).json({
            success: true,
            count: formattedVehicles.length,
            data: formattedVehicles,
            vehicles: formattedVehicles
        });

    } catch (error) {
        console.error('Get Vehicles Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch vehicles.',
            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined
        });
    }
};


// ============================================================
// GET SINGLE VEHICLE
// GET /api/vehicles/:id
// ============================================================

export const getVehicleById = async (req, res) => {
    try {
        const userId = getUserId(req);
        const vehicleId = Number(req.params.id);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid vehicle ID.'
            });
        }

        const [vehicles] = await pool.query(
            `
            SELECT
                id,
                user_id,
                vehicle_name,
                vehicle_number,
                vehicle_model,
                connector_type,
                battery_capacity,
                created_at
            FROM vehicles
            WHERE id = ?
              AND user_id = ?
            LIMIT 1
            `,
            [vehicleId, userId]
        );

        if (vehicles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found.'
            });
        }

        const vehicle = formatVehicle(vehicles[0]);

        return res.status(200).json({
            success: true,
            data: vehicle,
            vehicle: vehicle
        });

    } catch (error) {
        console.error('Get Vehicle Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch vehicle.',
            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined
        });
    }
};


// ============================================================
// CREATE VEHICLE
// POST /api/vehicles
// ============================================================

export const createVehicle = async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        // ----------------------------------------------------
        // Accept new database field names
        // and older frontend field names
        // ----------------------------------------------------

        const vehicleName = String(
            req.body.vehicle_name ||
            req.body.make ||
            req.body.brand ||
            ''
        ).trim();

        const vehicleNumber = String(
            req.body.vehicle_number ||
            req.body.regNumber ||
            req.body.registration_number ||
            ''
        ).trim().toUpperCase();

        const vehicleModel = String(
            req.body.vehicle_model ||
            req.body.model ||
            ''
        ).trim();

        const connectorType = String(
            req.body.connector_type ||
            req.body.connector ||
            'CCS2'
        ).trim();

        const batteryCapacity =
            req.body.battery_capacity === undefined ||
            req.body.battery_capacity === null ||
            req.body.battery_capacity === ''
                ? null
                : Number(req.body.battery_capacity);


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (
            !vehicleName ||
            !vehicleNumber ||
            !vehicleModel ||
            !connectorType
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Vehicle name, vehicle number, model and connector type are required.'
            });
        }

        if (
            batteryCapacity !== null &&
            (
                !Number.isFinite(batteryCapacity) ||
                batteryCapacity <= 0
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Battery capacity must be a valid positive number.'
            });
        }


        // ----------------------------------------------------
        // CHECK DUPLICATE VEHICLE NUMBER
        // ----------------------------------------------------

        const [existingVehicles] = await pool.query(
            `
            SELECT id
            FROM vehicles
            WHERE user_id = ?
              AND UPPER(vehicle_number) = UPPER(?)
            LIMIT 1
            `,
            [userId, vehicleNumber]
        );

        if (existingVehicles.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    'A vehicle with this registration number is already registered.'
            });
        }


        // ----------------------------------------------------
        // INSERT VEHICLE
        // ----------------------------------------------------

        const [result] = await pool.query(
            `
            INSERT INTO vehicles
            (
                user_id,
                vehicle_name,
                vehicle_number,
                vehicle_model,
                connector_type,
                battery_capacity
            )
            VALUES
            (?, ?, ?, ?, ?, ?)
            `,
            [
                userId,
                vehicleName,
                vehicleNumber,
                vehicleModel,
                connectorType,
                batteryCapacity
            ]
        );

        const vehicleId = result.insertId;


        // ----------------------------------------------------
        // GET CREATED VEHICLE
        // ----------------------------------------------------

        const [vehicles] = await pool.query(
            `
            SELECT
                id,
                user_id,
                vehicle_name,
                vehicle_number,
                vehicle_model,
                connector_type,
                battery_capacity,
                created_at
            FROM vehicles
            WHERE id = ?
            LIMIT 1
            `,
            [vehicleId]
        );

        const vehicle = formatVehicle(vehicles[0]);

        console.log(
            `Vehicle ${vehicleId} created for user ${userId}`
        );

        return res.status(201).json({
            success: true,
            message: 'Vehicle added successfully.',
            data: vehicle,
            vehicle: vehicle
        });

    } catch (error) {
        console.error('Create Vehicle Error:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message:
                    'A vehicle with this registration number already exists.'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to add vehicle.',
            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined
        });
    }
};


// ============================================================
// UPDATE VEHICLE
// PUT /api/vehicles/:id
// ============================================================

export const updateVehicle = async (req, res) => {
    try {
        const userId = getUserId(req);
        const vehicleId = Number(req.params.id);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid vehicle ID.'
            });
        }


        // ----------------------------------------------------
        // CHECK OWNERSHIP
        // ----------------------------------------------------

        const [existing] = await pool.query(
            `
            SELECT *
            FROM vehicles
            WHERE id = ?
              AND user_id = ?
            LIMIT 1
            `,
            [vehicleId, userId]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found.'
            });
        }

        const oldVehicle = existing[0];


        // ----------------------------------------------------
        // NEW VALUES OR OLD VALUES
        // ----------------------------------------------------

        const vehicleName = String(
            req.body.vehicle_name ||
            req.body.make ||
            oldVehicle.vehicle_name ||
            ''
        ).trim();

        const vehicleNumber = String(
            req.body.vehicle_number ||
            req.body.regNumber ||
            oldVehicle.vehicle_number ||
            ''
        ).trim().toUpperCase();

        const vehicleModel = String(
            req.body.vehicle_model ||
            req.body.model ||
            oldVehicle.vehicle_model ||
            ''
        ).trim();

        const connectorType = String(
            req.body.connector_type ||
            req.body.connector ||
            oldVehicle.connector_type ||
            'CCS2'
        ).trim();

        let batteryCapacity = oldVehicle.battery_capacity;

        if (req.body.battery_capacity !== undefined) {
            batteryCapacity =
                req.body.battery_capacity === ''
                    ? null
                    : Number(req.body.battery_capacity);
        }


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (
            !vehicleName ||
            !vehicleNumber ||
            !vehicleModel ||
            !connectorType
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Vehicle name, vehicle number, model and connector type are required.'
            });
        }

        if (
            batteryCapacity !== null &&
            (
                !Number.isFinite(batteryCapacity) ||
                batteryCapacity <= 0
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Battery capacity must be a valid positive number.'
            });
        }


        // ----------------------------------------------------
        // DUPLICATE REGISTRATION CHECK
        // ----------------------------------------------------

        const [duplicates] = await pool.query(
            `
            SELECT id
            FROM vehicles
            WHERE user_id = ?
              AND UPPER(vehicle_number) = UPPER(?)
              AND id <> ?
            LIMIT 1
            `,
            [
                userId,
                vehicleNumber,
                vehicleId
            ]
        );

        if (duplicates.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    'Another vehicle with this registration number already exists.'
            });
        }


        // ----------------------------------------------------
        // UPDATE
        // ----------------------------------------------------

        await pool.query(
            `
            UPDATE vehicles
            SET
                vehicle_name = ?,
                vehicle_number = ?,
                vehicle_model = ?,
                connector_type = ?,
                battery_capacity = ?
            WHERE id = ?
              AND user_id = ?
            `,
            [
                vehicleName,
                vehicleNumber,
                vehicleModel,
                connectorType,
                batteryCapacity,
                vehicleId,
                userId
            ]
        );


        // ----------------------------------------------------
        // GET UPDATED VEHICLE
        // ----------------------------------------------------

        const [vehicles] = await pool.query(
            `
            SELECT
                id,
                user_id,
                vehicle_name,
                vehicle_number,
                vehicle_model,
                connector_type,
                battery_capacity,
                created_at
            FROM vehicles
            WHERE id = ?
            LIMIT 1
            `,
            [vehicleId]
        );

        const vehicle = formatVehicle(vehicles[0]);

        return res.status(200).json({
            success: true,
            message: 'Vehicle updated successfully.',
            data: vehicle,
            vehicle: vehicle
        });

    } catch (error) {
        console.error('Update Vehicle Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to update vehicle.',
            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined
        });
    }
};


// ============================================================
// DELETE VEHICLE
// DELETE /api/vehicles/:id
// ============================================================

export const deleteVehicle = async (req, res) => {
    try {
        const userId = getUserId(req);
        const vehicleId = Number(req.params.id);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid vehicle ID.'
            });
        }


        // ----------------------------------------------------
        // CHECK VEHICLE
        // ----------------------------------------------------

        const [vehicles] = await pool.query(
            `
            SELECT id
            FROM vehicles
            WHERE id = ?
              AND user_id = ?
            LIMIT 1
            `,
            [vehicleId, userId]
        );

        if (vehicles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found.'
            });
        }


        // ----------------------------------------------------
        // CHECK EXISTING BOOKINGS
        // ----------------------------------------------------

        const [bookings] = await pool.query(
            `
            SELECT id
            FROM bookings
            WHERE vehicle_id = ?
            LIMIT 1
            `,
            [vehicleId]
        );

        if (bookings.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    'This vehicle cannot be deleted because it is linked to an existing booking.'
            });
        }


        // ----------------------------------------------------
        // DELETE
        // ----------------------------------------------------

        await pool.query(
            `
            DELETE FROM vehicles
            WHERE id = ?
              AND user_id = ?
            `,
            [
                vehicleId,
                userId
            ]
        );

        console.log(
            `Vehicle ${vehicleId} deleted for user ${userId}`
        );

        return res.status(200).json({
            success: true,
            message: 'Vehicle deleted successfully.'
        });

    } catch (error) {
        console.error('Delete Vehicle Error:', error);

        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({
                success: false,
                message:
                    'This vehicle cannot be deleted because it is used by existing bookings.'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to delete vehicle.',
            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined
        });
    }
};


// ============================================================
// COMPATIBILITY ALIASES
// ============================================================

export const addVehicle = createVehicle;

export const removeVehicle = deleteVehicle;

export const getVehicle = getVehicleById;