USE ev_charge_hub;

-- Charging Stations
CREATE TABLE IF NOT EXISTS charging_stations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    contact VARCHAR(50),
    rating DECIMAL(3, 2) DEFAULT 0.00,
    status ENUM('active', 'inactive', 'maintenance') DEFAULT 'active',
    operating_hours VARCHAR(100) DEFAULT '24/7',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Index for faster geospatial bounding box queries
    INDEX idx_location (latitude, longitude)
);

-- Chargers at each station
CREATE TABLE IF NOT EXISTS chargers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    station_id INT NOT NULL,
    charger_number VARCHAR(20) NOT NULL,
    connector_type VARCHAR(50) NOT NULL,
    charging_speed VARCHAR(50) NOT NULL, -- e.g., '50kW DC', '22kW AC'
    price DECIMAL(8, 2) NOT NULL, -- Price per kWh
    status ENUM('AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE') DEFAULT 'AVAILABLE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (station_id) REFERENCES charging_stations(id) ON DELETE CASCADE
);

-- Station Facilities (WiFi, Cafe, Restroom, etc.)
CREATE TABLE IF NOT EXISTS station_facilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    station_id INT NOT NULL,
    facility_name VARCHAR(50) NOT NULL,
    FOREIGN KEY (station_id) REFERENCES charging_stations(id) ON DELETE CASCADE
);