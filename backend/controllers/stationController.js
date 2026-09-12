// backend/controllers/stationController.js
const pool = require('../config/db');

// 1. Get All Stations (Optional filtering by status)
exports.getAllStations = async (req, res) => {
    try {
        const [stations] = await pool.query(
            "SELECT * FROM charging_stations WHERE status = 'active' ORDER BY rating DESC"
        );
        return res.status(200).json({ success: true, count: stations.length, data: stations });
    } catch (error) {
        console.error('Get All Stations Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch charging stations.' });
    }
};

// 2. Get Station Details (Includes Chargers and Facilities)
exports.getStationById = async (req, res) => {
    try {
        const stationId = req.params.id;

        const [stations] = await pool.query('SELECT * FROM charging_stations WHERE id = ?', [stationId]);
        if (stations.length === 0) {
            return res.status(404).json({ success: false, message: 'Station not found.' });
        }

        const station = stations[0];

        // Fetch associated chargers and facilities concurrently
        const [chargersPromise, facilitiesPromise] = await Promise.all([
            pool.query('SELECT * FROM chargers WHERE station_id = ?', [stationId]),
            pool.query('SELECT facility_name FROM station_facilities WHERE station_id = ?', [stationId])
        ]);

        station.chargers = chargersPromise[0];
        station.facilities = facilitiesPromise[0].map(f => f.facility_name);

        return res.status(200).json({ success: true, data: station });
    } catch (error) {
        console.error('Get Station Details Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch station details.' });
    }
};

// 3. Find Nearby Stations using the Haversine Formula
exports.getNearbyStations = async (req, res) => {
    try {
        const { lat, lng, radius = 10 } = req.query; // Radius in Kilometers

        if (!lat || !lng) {
            return res.status(400).json({ success: false, message: 'Latitude (lat) and Longitude (lng) are required.' });
        }

        // MySQL Haversine Formula for distance calculation in KM (Earth radius ~ 6371km)
        const query = `
            SELECT id, name, address, latitude, longitude, contact, rating, status, operating_hours,
            ( 6371 * acos( cos( radians(?) ) * cos( radians( latitude ) ) 
            * cos( radians( longitude ) - radians(?) ) + sin( radians(?) ) 
            * sin( radians( latitude ) ) ) ) AS distance 
            FROM charging_stations 
            HAVING distance <= ? 
            ORDER BY distance ASC
            LIMIT 50
        `;

        const [stations] = await pool.query(query, [lat, lng, lat, radius]);

        // Fetch counts for available chargers at these stations
        if (stations.length > 0) {
            const stationIds = stations.map(s => s.id);
            const [availableChargers] = await pool.query(
                `SELECT station_id, COUNT(*) as available_count 
                 FROM chargers 
                 WHERE station_id IN (?) AND status = 'AVAILABLE'
                 GROUP BY station_id`,
                [stationIds]
            );

            // Map available counts to stations
            stations.forEach(station => {
                const match = availableChargers.find(c => c.station_id === station.id);
                station.available_chargers = match ? match.available_count : 0;
            });
        }

        return res.status(200).json({ 
            success: true, 
            count: stations.length, 
            radius_km: radius, 
            data: stations 
        });
    } catch (error) {
        console.error('Get Nearby Stations Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to search nearby stations.' });
    }
};