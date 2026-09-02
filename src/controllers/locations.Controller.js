const pool = require('../db/sql.db');

const getAllLocationsByAdminID = async (req, res) => {
    const { admin_id } = req.query;
    try {

        console.log("fetching locations data of admin id: ", admin_id);

        const [rows] = await pool.query(
            `SELECT * 
            FROM locations
            WHERE admin_id = ?
            ORDER BY locId DESC`,
            [admin_id]
        );

        console.log('Locations found:', rows.length); // Debug log

        res.status(200).json(rows);
    } catch (error) {
        console.error("Error fetching locations", error);
        res.status(500).json({ error: "error in featching locations" });
    }
}

// ============Featch all locations=============
const getAllLocations = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT locId, name, latitude, longitude, building, admin_id FROM locations ORDER BY name'
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching all locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
}

// ============ GET PUBLIC LOCATIONS ============
const getPublicLocations = async (req, res) => {
    const { admin_id } = req.query;

    try {
        // Build the base query
        let query = 'SELECT locId, name, latitude, longitude, building, admin_id FROM locations';
        let params = [];

        // Add WHERE clause if admin_id is provided
        if (admin_id) {
            query += ' WHERE admin_id = ?';
            params.push(admin_id);
        }

        // ✅ Add ORDER BY only once
        query += ' ORDER BY name';

        console.log('📊 SQL Query:', query);
        console.log('📊 Params:', params);

        const [rows] = await pool.query(query, params);
        return res.json(rows);

    } catch (error) {
        console.error("Failed to fetch public locations:", error);
        return res.status(500).json({ error: "Failed to fetch Public locations" });
    }
};

// ===========get locations by id===============

const getLocationById = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(id);

        if (!id) {
            return res.status(400).json({ error: "Id is required" })
        }

        const [rows] = await pool.query(
            `select name, building, latitude, longitude 
            from locations 
            where locId = ?`,
            [id]
        )
        if (rows.length === 0) {
            return res.json({ error: "Invalid location ID" });
        }

        res.status(200).json({
            success: true,
            location: rows[0]
        });
    } catch (error) {
        console.error("cant fetch location by id", error);
        res.status(500).json({ error: "cant fetch location" });
    }
}

// ===========creating locations===============
const createLocation = async (req, res) => {
    try {

        const { name, admin_id, latitude, longitude, floor, is_indoor, building, description } = req.body;

        if (!name || !admin_id || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "locations Name, admin id,  Latitude, Longitude are required" })
        }

        // checking existing locations to avoid duplicates
        const [existing] = await pool.query(
            'SELECT locId, name FROM locations WHERE latitude = ? AND longitude = ?',
            [latitude, longitude]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                error: 'A location already exists at these coordinates',
                existingId: existing[0].locId,
                existingName: existing[0].name
            });
        }

        const [result] = await pool.query(
            `INSERT INTO locations (name, admin_id, latitude, longitude, floor, is_indoor, building, description)
        VALUES (?,?,?,?,?,?,?,?)`,
            [name, admin_id, latitude, longitude, floor || null, is_indoor || false, building || null, description || null]
        )

        const [newLocation] = await pool.query(
            `select * from locations where locId = ?`,
            [result.insertId]
        );

        res.status(201).json(newLocation[0]);
    } catch (error) {
        console.error('Error creating location:', error);
        res.status(500).json({ error: 'Failed to create location' });
    }
}

// =========Update Locations ====================
const updateLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, latitude, longitude, floor, is_indoor, building, description } = req.body;

        if (!name || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "Location name, latitude, and longitude are required" });
        }

        const [result] = await pool.query(
            `UPDATE locations
             SET name = ?, latitude = ?, longitude = ?, floor = ?, is_indoor = ?, building = ?, description = ?
             WHERE locId = ?`,
            [name, latitude, longitude, floor || null, is_indoor || false, building || null, description || null, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const [updatedLocation] = await pool.query(
            `SELECT * FROM locations WHERE locId = ?`,
            [id]
        );

        res.json(updatedLocation[0]);

    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }

}

// Delete locations
const deleteLocation = async (req, res) => {
    try {

        const { id } = req.params;

        // checking wether the location even exist or not
        const [rows] = await pool.query(
            `select * from locations where locId = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "location not found" });
        }

        const [result] = await pool.query(
            `DELETE FROM locations WHERE locId =?`,
            [id]
        );
        res.json({ success: true, message: "location deleted successfull" });
    } catch (error) {
        console.error('Error deleting location:', error);
        res.status(500).json({ error: 'Failed to delete location' });
    }
}

module.exports = {
    getAllLocations,
    getAllLocationsByAdminID,
    getPublicLocations,
    getLocationById,
    createLocation,
    updateLocation,
    deleteLocation

}