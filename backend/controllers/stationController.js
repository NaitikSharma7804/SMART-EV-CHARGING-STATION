// ============================================================
// EV CHARGE HUB
// STATION CONTROLLER
// ============================================================

import pool from '../config/db.js';


// ============================================================
// GET ALL STATIONS
// GET /api/stations
// ============================================================

export const getStations = async (req, res) => {
    try {
        const {
            lat,
            lng,
            radius = 25
        } = req.query;

        let query = `
            SELECT
                id,
                name,
                address,
                city,
                state,
                latitude,
                longitude,
                operator_name,
                opening_time,
                closing_time,
                is_24_hours,
                status,
                rating,
                total_reviews,
                created_at
            FROM charging_stations
            WHERE status != 'Inactive'
            ORDER BY name ASC
        `;

        const params = [];

        const [stations] = await pool.query(
            query,
            params
        );

        // ----------------------------------------------------
        // If latitude/longitude are supplied, calculate
        // approximate distance using the Haversine formula.
        // ----------------------------------------------------

        let formattedStations = stations.map(station => ({
            ...station,
            distance: null
        }));

        if (
            lat !== undefined &&
            lng !== undefined &&
            Number.isFinite(Number(lat)) &&
            Number.isFinite(Number(lng))
        ) {
            const userLat = Number(lat);
            const userLng = Number(lng);
            const maxRadius = Number(radius) || 25;

            formattedStations = stations
                .map(station => {
                    const stationLat = Number(station.latitude);
                    const stationLng = Number(station.longitude);

                    if (
                        !Number.isFinite(stationLat) ||
                        !Number.isFinite(stationLng)
                    ) {
                        return null;
                    }

                    const distance =
                        calculateDistance(
                            userLat,
                            userLng,
                            stationLat,
                            stationLng
                        );

                    return {
                        ...station,
                        distance:
                            Math.round(distance * 100) / 100
                    };
                })
                .filter(Boolean)
                .filter(
                    station =>
                        station.distance <= maxRadius
                )
                .sort(
                    (a, b) =>
                        a.distance - b.distance
                );
        }

        return res.status(200).json({
            success: true,
            count: formattedStations.length,
            data: formattedStations,
            stations: formattedStations
        });

    } catch (error) {
        console.error(
            'Get Stations Error:',
            error
        );

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch charging stations.',
            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined
        });
    }
};


// ============================================================
// GET SINGLE STATION
// GET /api/stations/:id
// ============================================================

// ============================================================
// GET SINGLE STATION
// GET /api/stations/:id
// ============================================================

export const getStationById = async (req, res) => {
    try {
        const stationId = Number(req.params.id);

        if (
            !Number.isInteger(stationId) ||
            stationId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station ID.'
            });
        }

        // ----------------------------------------------------
        // GET STATION
        // ----------------------------------------------------

        const [stations] = await pool.query(
            `
            SELECT
                id,
                name,
                address,
                city,
                state,
                latitude,
                longitude,
                operator_name,
                opening_time,
                closing_time,
                is_24_hours,
                status,
                rating,
                total_reviews,
                created_at,
                updated_at
            FROM charging_stations
            WHERE id = ?
            LIMIT 1
            `,
            [stationId]
        );

        if (stations.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found.'
            });
        }

        const station = stations[0];

        // ----------------------------------------------------
        // GET CHARGERS
        // ----------------------------------------------------

        const [chargers] = await pool.query(
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
            WHERE station_id = ?
            ORDER BY id ASC
            `,
            [stationId]
        );

        // ----------------------------------------------------
        // GET AMENITIES
        //
        // Your database uses:
        // amenities
        // station_amenities
        //
        // NOT station_facilities
        // ----------------------------------------------------

        let amenities = [];

        try {
            const [amenityRows] = await pool.query(
                `
                SELECT
                    a.id,
                    a.name
                FROM amenities a
                INNER JOIN station_amenities sa
                    ON sa.amenity_id = a.id
                WHERE sa.station_id = ?
                ORDER BY a.name ASC
                `,
                [stationId]
            );

            amenities = amenityRows.map(
                amenity => amenity.name
            );

        } catch (amenityError) {
            // Amenities should not prevent the station
            // booking page from loading.
            console.warn(
                'Could not load station amenities:',
                amenityError.message
            );

            amenities = [];
        }

        // ----------------------------------------------------
        // FORMAT CHARGERS
        // ----------------------------------------------------

        const formattedChargers = chargers.map(
            charger => ({
                id: charger.id,

                station_id:
                    charger.station_id,

                charger_number:
                    charger.charger_number,

                charger_type:
                    charger.charger_type,

                connector_type:
                    charger.connector_type,

                power_kw:
                    Number(
                        charger.power_kw || 0
                    ),

                price_per_hour:
                    Number(
                        charger.price_per_hour || 0
                    ),

                // Frontend compatibility
                price:
                    Number(
                        charger.price_per_hour || 0
                    ),

                charging_speed:
                    `${Number(
                        charger.power_kw || 0
                    )} kW`,

                status:
                    charger.status
            })
        );

        // ----------------------------------------------------
        // FORMAT STATION
        // ----------------------------------------------------

        const formattedStation = {
            ...station,

            // Frontend compatibility
            station_id:
                station.id,

            station_name:
                station.name,

            location:
                station.address,

            charging_speed:
                formattedChargers.length > 0
                    ? formattedChargers[0]
                        .charging_speed
                    : null,

            charger_type:
                formattedChargers.length > 0
                    ? formattedChargers[0]
                        .charger_type
                    : null,

            price:
                formattedChargers.length > 0
                    ? formattedChargers[0]
                        .price
                    : null,

            amenities,

            chargers:
                formattedChargers
        };

        console.log(
            `Station ${stationId} loaded successfully`
        );

        console.log(
            `Chargers found: ${formattedChargers.length}`
        );

        console.log(
            `Amenities found: ${amenities.length}`
        );

        return res.status(200).json({
            success: true,

            data: formattedStation,

            // Compatibility
            station: formattedStation
        });

    } catch (error) {
        console.error(
            'Get Station Details Error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to fetch station details.',
            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined
        });
    }
};


// ============================================================
// GET STATION AVAILABILITY
// GET /api/stations/:id/availability
// ============================================================

export const getStationAvailability = async (
    req,
    res
) => {
    try {
        const stationId = Number(
            req.params.id
        );

        if (
            !Number.isInteger(stationId) ||
            stationId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station ID.'
            });
        }


        const [slots] = await pool.query(
            `
            SELECT
                cs.id,
                cs.charger_id,
                cs.station_id,
                cs.slot_name,
                cs.start_time,
                cs.end_time,
                cs.status,

                c.charger_number,
                c.charger_type,
                c.connector_type,
                c.power_kw,
                c.price_per_hour

            FROM charging_slots cs

            JOIN chargers c
                ON cs.charger_id = c.id

            WHERE cs.station_id = ?

            ORDER BY
                cs.start_time ASC
            `,
            [stationId]
        );


        return res.status(200).json({
            success: true,
            count: slots.length,
            data: slots,
            slots: slots
        });

    } catch (error) {
        console.error(
            'Get Station Availability Error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to fetch station availability.',
            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined
        });
    }
};


// ============================================================
// HAVERSINE DISTANCE
// Returns distance in KM
// ============================================================

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {
    const earthRadius = 6371;

    const dLat =
        toRadians(lat2 - lat1);

    const dLon =
        toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) *
            Math.sin(dLat / 2) +

        Math.cos(
            toRadians(lat1)
        ) *
        Math.cos(
            toRadians(lat2)
        ) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return earthRadius * c;
}


function toRadians(degrees) {
    return degrees *
        (Math.PI / 180);
}


// ============================================================
// COMPATIBILITY ALIASES
// ============================================================

export const getStation =
    getStationById;

export const stationDetails =
    getStationById;