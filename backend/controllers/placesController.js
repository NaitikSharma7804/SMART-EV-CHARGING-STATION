// backend/controllers/placesController.js
import * as placesService from '../services/placesService.js';
import pool from '../config/db.js';

export const searchPlaces = async (req, res) => {
    try {
        const { query, lat, lng } = req.query;

        if (!query) {
            return res.status(400).json({ success: false, message: 'Search query is required.' });
        }

        const results = await placesService.searchPlaces(query, lat, lng);
        return res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error('Search Places Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to search places.' });
    }
};

export const autocompletePlaces = async (req, res) => {
    try {
        const { input, lat, lng } = req.query;

        if (!input) {
            return res.status(400).json({ success: false, message: 'Input text is required for autocomplete.' });
        }

        const results = await placesService.autocompletePlaces(input, lat, lng);
        return res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error('Autocomplete Places Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch place suggestions.' });
    }
};

export const getNearbyPlacesForStation = async (req, res) => {
    try {
        const { station_id, lat, lng, radius = 5000, category = 'all' } = req.query;

        let targetLat = lat;
        let targetLng = lng;

        // If station_id is provided, retrieve station coordinates directly from DB
        if (station_id) {
            const [stations] = await pool.query('SELECT latitude, longitude, name FROM charging_stations WHERE id = ?', [station_id]);
            if (stations.length === 0) {
                return res.status(404).json({ success: false, message: 'Charging station not found.' });
            }
            targetLat = stations[0].latitude;
            targetLng = stations[0].longitude;
        }

        if (!targetLat || !targetLng) {
            return res.status(400).json({ 
                success: false, 
                message: 'Station ID or GPS coordinates (lat, lng) are required.' 
            });
        }

        const data = await placesService.fetchNearbyPlaces(targetLat, targetLng, radius, category);

        return res.status(200).json({
            success: true,
            source: data.source,
            count: data.places.length,
            radius_meters: radius,
            category,
            places: data.places
        });
    } catch (error) {
        console.error('Get Nearby Places Error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Nearby places are temporarily unavailable.',
            error: error.message 
        });
    }
};