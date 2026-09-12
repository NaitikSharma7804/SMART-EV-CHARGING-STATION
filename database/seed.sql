USE ev_charge_hub;

-- 1. Insert Admin and Demo Users
-- Password hash for 'Password123'
INSERT INTO users (name, email, mobile, password_hash, role_id, is_verified) VALUES 
('System Admin', 'admin@evchargehub.com', '9999999999', '$2a$10$XU1n7kY...[generate an actual bcrypt hash here]...', 2, TRUE),
('John Doe', 'john@example.com', '9876543210', '$2a$10$XU1n7kY...[hash]...', 1, TRUE),
('Jane Smith', 'jane@example.com', '9876543211', '$2a$10$XU1n7kY...[hash]...', 1, TRUE);

-- 2. Insert Demo Vehicles
INSERT INTO vehicles (user_id, vehicle_number, brand, model, battery_capacity, connector_type, is_default) VALUES 
(2, 'MH-12-AB-1234', 'Tata', 'Nexon EV', 30.2, 'CCS2', TRUE),
(3, 'KA-01-XY-9876', 'MG', 'ZS EV', 50.3, 'CCS2', TRUE);

-- 3. Insert Demo Stations (Mix of locations)
INSERT INTO charging_stations (name, address, latitude, longitude, contact, rating, status) VALUES 
('GreenTech Fast Charging', 'Hinjewadi Phase 1, Pune', 18.5913, 73.7389, '1800-123-456', 4.5, 'active'),
('ChargeGrid City Center', 'FC Road, Shivaji Nagar, Pune', 18.5246, 73.8400, '1800-987-654', 4.8, 'active'),
('EcoPower Highway Hub', 'Mumbai-Pune Expressway Plaza', 18.7500, 73.4000, '1800-111-222', 4.2, 'active');

-- 4. Insert Demo Chargers
INSERT INTO chargers (station_id, charger_number, connector_type, charging_speed, price, status) VALUES 
(1, 'GT-01', 'CCS2', '50kW DC', 18.50, 'AVAILABLE'),
(1, 'GT-02', 'Type 2', '22kW AC', 12.00, 'AVAILABLE'),
(2, 'CG-01', 'CCS2', '120kW DC', 24.00, 'RESERVED'),
(2, 'CG-02', 'CHAdeMO', '50kW DC', 18.50, 'AVAILABLE'),
(3, 'EP-01', 'CCS2', '50kW DC', 18.00, 'OCCUPIED'),
(3, 'EP-02', 'CCS2', '50kW DC', 18.00, 'MAINTENANCE');

-- 5. Insert Demo Facilities
INSERT INTO station_facilities (station_id, facility_name) VALUES 
(1, 'Cafe'), (1, 'Restroom'), (1, 'Wi-Fi'),
(2, 'Shopping Mall'), (2, 'Restroom'), (2, 'Paid Parking'),
(3, 'Restaurant'), (3, 'Restroom'), (3, 'ATM');