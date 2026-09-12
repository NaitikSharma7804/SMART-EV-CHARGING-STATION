// backend/services/ocmService.js
const axios = require('axios');
const db = require('../config/db');

async function syncRealStations(lat = 18.5204, lng = 73.8567, distance = 25) {
    try {
        const apiKey = process.env.OCM_API_KEY;
        const url = `https://api.openchargemap.io/v3/poi/?output=json&latitude=${lat}&longitude=${lng}&distance=${distance}&maxresults=10&key=${apiKey}`;

        console.log('Fetching real stations from Open Charge Map...');
        const response = await axios.get(url);
        const stations = response.data;

        let addedCount = 0;

        for (const item of stations) {
            const name = item.AddressInfo.Title || 'Public EV Station';
            const address = `${item.AddressInfo.AddressLine1 || ''}, ${item.AddressInfo.Town || ''}`.trim();
            const latitude = item.AddressInfo.Latitude;
            const longitude = item.AddressInfo.Longitude;
            const operator = item.OperatorInfo?.Title || 'Independent Network';

            // Use 'charging_stations' instead of 'stations'
            const [existing] = await db.query('SELECT id FROM charging_stations WHERE latitude = ? AND longitude = ?', [latitude, longitude]);

            if (existing.length === 0) {
                // Insert Station into correct table (Core columns only)
                const [result] = await db.query(
                    `INSERT INTO charging_stations (name, address, latitude, longitude) 
                     VALUES (?, ?, ?, ?)`,
                    [name, address, latitude, longitude]
                );
                
                const stationId = result.insertId;

                // Insert default chargers for this real station
                await db.query(
                    `INSERT INTO chargers (station_id, charger_number, connector_type, charging_speed, price, status) 
                     VALUES (?, 'CH-01', 'Type 2 / CCS', '50 kW Fast', 15.00, 'AVAILABLE'),
                            (?, 'CH-02', 'Type 2 / CCS', '50 kW Fast', 15.00, 'AVAILABLE')`,
                    [stationId, stationId]
                );

                addedCount++;
            }
        }

        return { success: true, message: `Successfully synced ${addedCount} new real stations into database!` };
    } catch (error) {
        console.error('Error syncing OCM stations:', error.message);
        throw new Error('Failed to fetch external stations.');
    }
}

module.exports = { syncRealStations };