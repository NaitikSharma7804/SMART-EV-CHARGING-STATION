// backend/services/placesService.js
import https from 'https';

// Helper to calculate distance between two lat/lng coordinates (in km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
};

// Realistic mock generator when Google API is not configured / offline
const getMockPlaces = (lat, lng, category) => {
    const baseLat = parseFloat(lat);
    const baseLng = parseFloat(lng);

    const mockCatalog = {
        eat: [
            { name: 'Green Leaf Vegan Bistro', type: 'restaurant', rating: 4.6, reviews: 340, price_level: '₹₹', open_now: true, distance_offset: 0.003 },
            { name: 'Urban Spice Grill & Curry', type: 'restaurant', rating: 4.4, reviews: 520, price_level: '₹₹₹', open_now: true, distance_offset: 0.006 },
            { name: 'The Daily Brew & Bakery', type: 'cafe', rating: 4.8, reviews: 195, price_level: '₹₹', open_now: true, distance_offset: 0.002 }
        ],
        stay: [
            { name: 'Grand Hyatt Executive Suites', type: 'hotel', rating: 4.7, reviews: 890, price_level: '₹₹₹₹', open_now: true, distance_offset: 0.008 },
            { name: 'EcoStay Business Hotel', type: 'hotel', rating: 4.2, reviews: 210, price_level: '₹₹', open_now: true, distance_offset: 0.005 }
        ],
        relax: [
            { name: 'Central Green EV Lounge & Park', type: 'park', rating: 4.5, reviews: 140, price_level: 'Free', open_now: true, distance_offset: 0.004 },
            { name: 'Aura Spa & Wellness Retreat', type: 'spa', rating: 4.6, reviews: 85, price_level: '₹₹₹', open_now: true, distance_offset: 0.007 }
        ],
        shop: [
            { name: 'City Center Mega Mall', type: 'shopping_mall', rating: 4.5, reviews: 1420, price_level: '₹₹₹', open_now: true, distance_offset: 0.009 },
            { name: 'QuickMart Express Convenience', type: 'supermarket', rating: 4.1, reviews: 95, price_level: '₹', open_now: true, distance_offset: 0.001 }
        ],
        essentials: [
            { name: '24/7 Secure EV Parking Bay', type: 'parking', rating: 4.8, reviews: 310, price_level: '₹', open_now: true, distance_offset: 0.001 },
            { name: 'City Care Emergency Clinic & Pharmacy', type: 'hospital', rating: 4.3, reviews: 160, price_level: '₹₹', open_now: true, distance_offset: 0.004 },
            { name: 'HDFC & SBI ATM Kiosk', type: 'atm', rating: 4.0, reviews: 50, price_level: 'Free', open_now: true, distance_offset: 0.002 }
        ]
    };

    const targetCategories = category && mockCatalog[category] ? [category] : Object.keys(mockCatalog);
    const results = [];

    targetCategories.forEach(catKey => {
        mockCatalog[catKey].forEach((item, index) => {
            const itemLat = baseLat + (item.distance_offset * (index % 2 === 0 ? 1 : -1));
            const itemLng = baseLng + (item.distance_offset * (index % 2 === 0 ? -1 : 1));
            const dist = calculateDistance(baseLat, baseLng, itemLat, itemLng);

            results.push({
                place_id: `mock_${catKey}_${index}_${Date.now()}`,
                name: item.name,
                category: catKey,
                type: item.type,
                rating: item.rating,
                user_ratings_total: item.reviews,
                price_level: item.price_level,
                address: `Near Station (${dist} km away), Sector ${index + 1}`,
                location: { lat: itemLat, lng: itemLng },
                distance_km: dist,
                is_open: item.open_now,
                photo_url: `https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=80`,
                source: 'demo_fallback'
            });
        });
    });

    return results.sort((a, b) => a.distance_km - b.distance_km);
};

// Map high-level categories to Google Places types
const categoryTypeMap = {
    eat: 'restaurant|cafe|bakery',
    stay: 'lodging',
    relax: 'park|spa|movie_theater',
    shop: 'shopping_mall|supermarket|convenience_store',
    essentials: 'atm|hospital|pharmacy|parking'
};

export const searchPlaces = async (query, lat, lng) => {
    return [];
};

export const autocompletePlaces = async (input, lat, lng) => {
    return [];
};

// Fetch from Google Places API or fallback
export const fetchNearbyPlaces = async (lat, lng, radius = 5000, category = 'all') => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    // If no key provided, return mock demo data immediately
    if (!apiKey || apiKey === 'your_google_places_api_key_here') {
        return {
            source: 'demo_mode',
            places: getMockPlaces(lat, lng, category === 'all' ? null : category)
        };
    }

    try {
        const typeFilter = category !== 'all' && categoryTypeMap[category] ? `&type=${categoryTypeMap[category].split('|')[0]}` : '';
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}${typeFilter}&key=${apiKey}`;

        const responseData = await new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', (err) => reject(err));
        });

        if (responseData.status !== 'OK' || !responseData.results) {
            console.warn(`Google Places API returned status: ${responseData.status}. Falling back to demo data.`);
            return {
                source: 'fallback_due_to_api_status',
                places: getMockPlaces(lat, lng, category === 'all' ? null : category)
            };
        }

        const formatted = responseData.results.map((p) => {
            const pLat = p.geometry.location.lat;
            const pLng = p.geometry.location.lng;
            return {
                place_id: p.place_id,
                name: p.name,
                category: category !== 'all' ? category : 'explore',
                type: p.types ? p.types[0] : 'point_of_interest',
                rating: p.rating || 4.0,
                user_ratings_total: p.user_ratings_total || 10,
                address: p.vicinity || 'Near Charging Station',
                location: { lat: pLat, lng: pLng },
                distance_km: calculateDistance(parseFloat(lat), parseFloat(lng), pLat, pLng),
                is_open: p.opening_hours ? p.opening_hours.open_now : true,
                photo_url: p.photos && p.photos.length > 0 
                    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${p.photos[0].photo_reference}&key=${apiKey}`
                    : 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=80',
                source: 'google_places_live'
            };
        });

        return {
            source: 'live_google_api',
            places: formatted.sort((a, b) => a.distance_km - b.distance_km)
        };
    } catch (error) {
        console.error('Google Places Request Failed, using fallback:', error.message);
        return {
            source: 'fallback_error',
            places: getMockPlaces(lat, lng, category === 'all' ? null : category)
        };
    }
};