-- Lets a restock receipt carry free-text costs (maintenance, one-off supplies) that aren't
-- tracked as inventory stock, as ordinary `expenses` rows owned by the purchase -- so they show
-- up auto-categorized in Expenses while still rolling into the purchase's single cashflow entry.
ALTER TABLE expenses ADD COLUMN purchase_id INTEGER REFERENCES inventory_purchases(id) ON DELETE CASCADE;
