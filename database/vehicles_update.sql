USE ev_charge_hub;

-- Add is_default column to vehicles table
ALTER TABLE vehicles 
ADD COLUMN is_default BOOLEAN DEFAULT FALSE AFTER connector_type;