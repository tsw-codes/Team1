-- ============================================================
-- DEPRECATED — Original database schema (pre-Supabase)
-- ============================================================
-- This was the initial schema draft. It has been replaced by
-- schema.sql in this same folder, which is the current schema
-- designed for Supabase (PostgreSQL).
--
-- Known issues with this file:
--   - Typo: 'catagory' instead of 'category'
--   - Missing tables: manifests, transfers, inventory_adjustments
--   - 'stored' junction table doesn't match frontend data model
--   - 'status INT' uses integer codes, frontend uses strings
--   - 'users' table has no PRIMARY KEY constraint
--   - 'delivery_loc name' has a type error (name instead of VARCHAR)
--   - Password stored as plaintext VARCHAR (Supabase Auth handles this now)
--
-- Kept for reference only. Do not run this file.
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER,
	name VARCHAR(20),
	sku VARCHAR(10),
	unit VARCHAR(10),
	catagory VARCHAR(30),
	unitCost NUMERIC(12,2),
	totalCost NUMERIC(12,2),
    PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS location (
    name VARCHAR(20) NOT NULL,
	PRIMARY KEY(name)
);
CREATE TABLE IF NOT EXISTS project (
	name VARCHAR(20) UNIQUE,
	location VARCHAR(20),
	PRIMARY KEY(name, location),
	FOREIGN KEY (location) REFERENCES location(name)

);


CREATE TABLE IF NOT EXISTS stored (
	loc_name VARCHAR(20) NOT NULL,
	inv_id INTEGER NOT NULL,
	quantity INTEGER NOT NULL,
	updatedAt DATE,
	status INT,
	project VARCHAR(20),
	PRIMARY KEY (loc_name, inv_id),
	FOREIGN KEY (loc_name) REFERENCES location(name),
	FOREIGN KEY (inv_id) REFERENCES inventory(ID),
	FOREIGN KEY (project) REFERENCES project(name)
);

CREATE TABLE IF NOT EXISTS request(
	id VARCHAR(10),
	status INT,
	project VARCHAR(20),
	requestedBy INT,
	neededByDate DATE,
	priority INT,
	delivery_loc name,
	notes TEXT,
	PRIMARY KEY(id),
	FOREIGN KEY (delivery_loc) REFERENCES location(name),
	FOREIGN KEY (requestedBy) REFERENCES users(id)

);

CREATE TABLE IF NOT EXISTS request_item(
	id INT,
	request VARCHAR(10),
	quantity INT,
	PRIMARY KEY(id, request),
	FOREIGN KEY (id) REFERENCES inventory(id),
	FOREIGN KEY (request) REFERENCES request(id)
);

CREATE TABLE IF NOT EXISTS users (
	id INT,
	user_name VARCHAR(35),
	name VARCHAR(35),
	password VARCHAR(35),
	email VARCHAR(35),
	role VARCHAR(20)

);
