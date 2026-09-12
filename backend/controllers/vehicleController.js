// backend/controllers/vehicleController.js
const pool = require('../config/db');

// 1. Get all vehicles for the logged-in user
exports.getVehicles = async (req, res) => {
    try {
        const userId = req.user.id;
        const [vehicles] = await pool.query(
            'SELECT * FROM vehicles WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
            [userId]
        );

        return res.status(200).json({ success: true, count: vehicles.length, data: vehicles });
    } catch (error) {
        console.error('Get Vehicles Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch vehicles.' });
    }
};

// 2. Add a new vehicle
exports.addVehicle = async (req, res) => {
    try {
        const userId = req.user.id;
        const { vehicle_number, brand, model, battery_capacity, connector_type, is_default } = req.body;

        if (!vehicle_number || !brand || !model || !battery_capacity || !connector_type) {
            return res.status(400).json({ success: false, message: 'All vehicle fields are required.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // If this is marked as default (or if it's the user's first vehicle), handle defaults
            let setAsDefault = is_default === true || is_default === 'true';
            
            const [existing] = await connection.query('SELECT id FROM vehicles WHERE user_id = ?', [userId]);
            if (existing.length === 0) setAsDefault = true; // Force first vehicle to be default

            if (setAsDefault) {
                await connection.query('UPDATE vehicles SET is_default = FALSE WHERE user_id = ?', [userId]);
            }

            const [result] = await connection.query(
                `INSERT INTO vehicles (user_id, vehicle_number, brand, model, battery_capacity, connector_type, is_default)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, vehicle_number.trim(), brand.trim(), model.trim(), battery_capacity, connector_type.trim(), setAsDefault]
            );

            await connection.commit();
            return res.status(201).json({ success: true, message: 'Vehicle added successfully.', vehicleId: result.insertId });
        } catch (dbError) {
            await connection.rollback();
            throw dbError;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Add Vehicle Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to add vehicle.' });
    }
};

// 3. Update a vehicle
exports.updateVehicle = async (req, res) => {
    try {
        const vehicleId = req.params.id;
        const userId = req.user.id;
        const { vehicle_number, brand, model, battery_capacity, connector_type } = req.body;

        const [result] = await pool.query(
            `UPDATE vehicles 
             SET vehicle_number = ?, brand = ?, model = ?, battery_capacity = ?, connector_type = ? 
             WHERE id = ? AND user_id = ?`,
            [vehicle_number, brand, model, battery_capacity, connector_type, vehicleId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized.' });
        }

        return res.status(200).json({ success: true, message: 'Vehicle updated successfully.' });
    } catch (error) {
        console.error('Update Vehicle Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update vehicle.' });
    }
};

// 4. Delete a vehicle
exports.deleteVehicle = async (req, res) => {
    try {
        const vehicleId = req.params.id;
        const userId = req.user.id;

        const [result] = await pool.query('DELETE FROM vehicles WHERE id = ? AND user_id = ?', [vehicleId, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized.' });
        }

        return res.status(200).json({ success: true, message: 'Vehicle deleted successfully.' });
    } catch (error) {
        console.error('Delete Vehicle Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete vehicle.' });
    }
};

// 5. Set vehicle as default
exports.setDefaultVehicle = async (req, res) => {
    try {
        const vehicleId = req.params.id;
        const userId = req.user.id;

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Reset all user's vehicles to not default
            await connection.query('UPDATE vehicles SET is_default = FALSE WHERE user_id = ?', [userId]);

            // Set the specified one to default
            const [result] = await connection.query(
                'UPDATE vehicles SET is_default = TRUE WHERE id = ? AND user_id = ?',
                [vehicleId, userId]
            );

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized.' });
            }

            await connection.commit();
            return res.status(200).json({ success: true, message: 'Default vehicle updated.' });
        } catch (dbError) {
            await connection.rollback();
            throw dbError;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Set Default Vehicle Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update default vehicle.' });
    }
};