-- Add a nearby landmark field to customers, used to help delivery/pickup staff
-- locate an address (common convention for laundry/delivery apps in the PH market).
ALTER TABLE customers ADD COLUMN landmark TEXT;
