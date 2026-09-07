const pool = require('../db/sql.db');

// ============ GET LOCATIONS BY ADMIN ID ============
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

        console.log('Locations found:', rows.length);
        res.status(200).json(rows);
    } catch (error) {
        console.error("Error fetching locations", error);
        res.status(500).json({ error: "error in fetching locations" });
    }
};

// ============ FETCH ALL LOCATIONS ============
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
};

// ============ GET PUBLIC LOCATIONS ============
const getPublicLocations = async (req, res) => {
    const { admin_id } = req.query;

    if (!admin_id) {
        admin_id = 4;
    }
    console.log(admin_id);


    try {
        let query = 'SELECT locId, name, latitude, longitude, building, admin_id FROM locations';
        let params = [];

        if (admin_id) {
            query += ' WHERE admin_id = ?';
            params.push(admin_id);
        }

        query += ' ORDER BY name';

        console.log(' SQL Query:', query);
        console.log(' Params:', params);

        const [rows] = await pool.query(query, params);
        return res.json(rows);

    } catch (error) {
        console.error("Failed to fetch public locations:", error);
        return res.status(500).json({ error: "Failed to fetch Public locations" });
    }
};

// ============ GET LOCATION BY ID ============
const getLocationById = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(id);

        if (!id) {
            return res.status(400).json({ error: "Id is required" });
        }

        const [rows] = await pool.query(
            `SELECT name, building, latitude, longitude 
            FROM locations 
            WHERE locId = ?`,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: "Location not found" });
        }

        res.status(200).json({
            success: true,
            location: rows[0]
        });
    } catch (error) {
        console.error("cant fetch location by id", error);
        res.status(500).json({ error: "cant fetch location" });
    }
};

// ============ HELPER: Auto-generate node and edges ============
async function autoGenerateNodeAndEdges(location) {
    const { locId, name, latitude, longitude, building, floor, is_indoor, admin_id } = location;

    // ✅ Check if node already exists for this location
    const [existingNode] = await pool.query(
        'SELECT node_id FROM campus_nodes WHERE location_id = ?',
        [locId]
    );

    if (existingNode.length > 0) {
        console.log(`⏭️ Node already exists for "${name}" (node_id: ${existingNode[0].node_id})`);
        return {
            nodeId: existingNode[0].node_id,
            connectedTo: null,
            distance: 0,
            directionHint: 'Node already exists'
        };
    }

    // 1. Create node for this location
    const [maxNode] = await pool.query('SELECT MAX(node_id) as max_id FROM campus_nodes');
    const newNodeId = (maxNode[0].max_id || 0) + 1;

    await pool.query(`
        INSERT INTO campus_nodes (node_id, node_name, latitude, longitude, is_indoor, building, floor, is_location, location_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [newNodeId, name, latitude, longitude, is_indoor || 0, building || null, floor || null, 1, locId]);

    console.log(`✅ Created node ${newNodeId} for "${name}"`);

    // 2. Find nearest existing node and connect
    const [nearestNode] = await pool.query(`
        SELECT 
            node_id, 
            node_name,
            latitude, 
            longitude,
            SQRT(POW(latitude - ?, 2) + POW(longitude - ?, 2)) * 111000 as distance_meters
        FROM campus_nodes 
        WHERE node_id != ? 
          AND node_id NOT IN (SELECT from_node_id FROM campus_edges WHERE to_node_id = ?)
          AND node_id NOT IN (SELECT to_node_id FROM campus_edges WHERE from_node_id = ?)
        ORDER BY distance_meters ASC
        LIMIT 1
    `, [latitude, longitude, newNodeId, newNodeId, newNodeId]);

    if (nearestNode && nearestNode.node_id) {
        const distance = Math.round(nearestNode.distance_meters);

        // 3. Generate direction hint
        const directionHint = generateDirectionHint(
            latitude, longitude,
            nearestNode.latitude, nearestNode.longitude,
            nearestNode.node_name
        );

        // 4. Create bidirectional edges
        await pool.query(`
            INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
            VALUES (?, ?, ?, ?, ?)
        `, [newNodeId, nearestNode.node_id, Math.max(1, distance), 'walkway', directionHint]);

        await pool.query(`
            INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
            VALUES (?, ?, ?, ?, ?)
        `, [nearestNode.node_id, newNodeId, Math.max(1, distance), 'walkway', `Walk back towards ${name}`]);

        console.log(`🔗 Connected "${name}" → "${nearestNode.node_name}" (${distance}m)`);

        return {
            nodeId: newNodeId,
            connectedTo: nearestNode.node_id,
            distance: distance,
            directionHint: directionHint
        };
    }

    return { nodeId: newNodeId, connectedTo: null, distance: 0 };
}

// ============ GENERATE DIRECTION HINT ============
function generateDirectionHint(lat1, lon1, lat2, lon2, targetName) {
    // Calculate bearing
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;

    const dLon = toRad(lon2 - lon1);
    const lat1Rad = toRad(lat1);
    const lat2Rad = toRad(lat2);

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
        Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

    let bearing = toDeg(Math.atan2(y, x));
    bearing = (bearing + 360) % 360;

    // Determine cardinal direction
    let direction = '';
    if (bearing >= 337.5 || bearing < 22.5) direction = 'North';
    else if (bearing >= 22.5 && bearing < 67.5) direction = 'Northeast';
    else if (bearing >= 67.5 && bearing < 112.5) direction = 'East';
    else if (bearing >= 112.5 && bearing < 157.5) direction = 'Southeast';
    else if (bearing >= 157.5 && bearing < 202.5) direction = 'South';
    else if (bearing >= 202.5 && bearing < 247.5) direction = 'Southwest';
    else if (bearing >= 247.5 && bearing < 292.5) direction = 'West';
    else if (bearing >= 292.5 && bearing < 337.5) direction = 'Northwest';

    return `Walk ${direction} towards ${targetName}`;
}

// ============ CREATE LOCATION ============
const createLocation = async (req, res) => {
    try {
        const {
            name,
            admin_id,
            latitude,
            longitude,
            floor,
            is_indoor,
            building,
            description,
            create_node  // ✅ NEW: flag to create node
        } = req.body;

        if (!name || !admin_id || latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                error: "Name, admin_id, latitude, and longitude are required"
            });
        }

        // Check for duplicate coordinates
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

        // Insert location
        const [result] = await pool.query(`
            INSERT INTO locations (name, admin_id, latitude, longitude, floor, is_indoor, building, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [name, admin_id, latitude, longitude, floor || null, is_indoor || false, building || null, description || null]);

        const [newLocation] = await pool.query(
            'SELECT * FROM locations WHERE locId = ?',
            [result.insertId]
        );

        // ✅ AUTO-GENERATE NODE IF CHECKBOX IS CHECKED
        let autoResult = null;
        if (create_node !== false) {  // Default to true if not specified
            console.log(`🗺️ Creating node for "${name}" (create_node: true)`);
            autoResult = await autoGenerateNodeAndEdges(newLocation[0]);
        } else {
            console.log(`⏭️ Skipping node creation for "${name}"`);
        }

        res.status(201).json({
            location: newLocation[0],
            node: autoResult ? {
                nodeId: autoResult.nodeId,
                connectedTo: autoResult.connectedTo,
                distance: autoResult.distance,
                directionHint: autoResult.directionHint
            } : null,
            message: autoResult
                ? 'Location created with auto-generated node and edges!'
                : 'Location created without node'
        });

    } catch (error) {
        console.error('Error creating location:', error);
        res.status(500).json({ error: 'Failed to create location' });
    }
};

// ============ UPDATE LOCATION (with auto-reconnect) ============
const updateLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, latitude, longitude, floor, is_indoor, building, description } = req.body;

        if (!name || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "Name, latitude, and longitude are required" });
        }

        // Check if location exists
        const [existing] = await pool.query(
            'SELECT * FROM locations WHERE locId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        // Check if coordinates changed
        const oldLat = parseFloat(existing[0].latitude);
        const oldLng = parseFloat(existing[0].longitude);
        const newLat = parseFloat(latitude);
        const newLng = parseFloat(longitude);
        const coordsChanged = (oldLat !== newLat || oldLng !== newLng);

        await pool.query(`
            UPDATE locations
            SET name = ?, latitude = ?, longitude = ?, floor = ?, is_indoor = ?, building = ?, description = ?
            WHERE locId = ?
        `, [name, latitude, longitude, floor || null, is_indoor || false, building || null, description || null, id]);

        //  If coordinates changed, update node and edges
        if (coordsChanged) {
            // Find the node for this location
            const [node] = await pool.query(
                'SELECT node_id FROM campus_nodes WHERE location_id = ?',
                [id]
            );

            if (node.length > 0) {
                // Update node coordinates
                await pool.query(`
                    UPDATE campus_nodes 
                    SET latitude = ?, longitude = ?, node_name = ?
                    WHERE node_id = ?
                `, [latitude, longitude, name, node[0].node_id]);

                // Delete old edges
                await pool.query(
                    'DELETE FROM campus_edges WHERE from_node_id = ? OR to_node_id = ?',
                    [node[0].node_id, node[0].node_id]
                );

                // Reconnect to nearest node
                const [updatedLocation] = await pool.query(
                    'SELECT * FROM locations WHERE locId = ?',
                    [id]
                );
                await autoGenerateNodeAndEdges(updatedLocation[0]);

                console.log(` Reconnected node for "${name}" after coordinate change`);
            }
        }

        const [updatedLocation] = await pool.query(
            'SELECT * FROM locations WHERE locId = ?',
            [id]
        );

        res.json(updatedLocation[0]);

    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
};

// ============ DELETE LOCATION (with cleanup) ============
const deleteLocation = async (req, res) => {
    try {
        const { id } = req.params;

        // Find node for this location
        const [node] = await pool.query(
            'SELECT node_id FROM campus_nodes WHERE location_id = ?',
            [id]
        );

        // Delete edges and node
        if (node.length > 0) {
            await pool.query('DELETE FROM campus_edges WHERE from_node_id = ? OR to_node_id = ?', [node[0].node_id, node[0].node_id]);
            await pool.query('DELETE FROM campus_nodes WHERE node_id = ?', [node[0].node_id]);
        }

        // Delete location
        await pool.query('DELETE FROM locations WHERE locId = ?', [id]);

        res.json({
            success: true,
            message: 'Location and associated node/edges deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting location:', error);
        res.status(500).json({ error: 'Failed to delete location' });
    }
};

module.exports = {
    getAllLocations,
    getAllLocationsByAdminID,
    getPublicLocations,
    getLocationById,
    createLocation,
    updateLocation,
    deleteLocation
};