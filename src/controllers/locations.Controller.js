const pool = require('../db/sql.db');

// ============================================================
// HELPER: Calculate distance between two coordinates
// ============================================================
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
}

// ============================================================
// HELPER: Connect new node to ONLY the nearest node
// ============================================================
async function connectNewNodeToExisting(newNodeId, latitude, longitude) {
    // Find only the SINGLE nearest node within 50m
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
          AND SQRT(POW(latitude - ?, 2) + POW(longitude - ?, 2)) * 111000 < 50
        ORDER BY distance_meters ASC 
        LIMIT 1
    `, [latitude, longitude, newNodeId, newNodeId, newNodeId, latitude, longitude]);

    if (nearestNode && nearestNode.node_id) {
        const distance = Math.round(nearestNode.distance_meters);
        
        // Check if edge already exists
        const [existing] = await pool.query(`
            SELECT edge_id FROM campus_edges 
            WHERE (from_node_id = ? AND to_node_id = ?) 
               OR (from_node_id = ? AND to_node_id = ?)
        `, [newNodeId, nearestNode.node_id, nearestNode.node_id, newNodeId]);

        if (existing.length === 0) {
            await pool.query(`
                INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                VALUES (?, ?, ?, ?, ?)
            `, [newNodeId, nearestNode.node_id, Math.max(1, distance), 'walkway', `Walk towards ${nearestNode.node_name}`]);

            await pool.query(`
                INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                VALUES (?, ?, ?, ?, ?)
            `, [nearestNode.node_id, newNodeId, Math.max(1, distance), 'walkway', `Walk towards ${nearestNode.node_name}`]);

            console.log(` Auto-connected "${newNodeId}" → "${nearestNode.node_name}" (${distance}m)`);
        }
    }
}

// ============================================================
// HELPER: Auto-generate node and edges (FIXED)
// ============================================================
async function autoGenerateNodeAndEdges(location) {
    const { locId, name, latitude, longitude, building, floor, is_indoor, admin_id } = location;

    // 1. Check if node already exists
    const [existingNode] = await pool.query(
        'SELECT node_id FROM campus_nodes WHERE location_id = ?',
        [locId]
    );

    if (existingNode.length > 0) {
        console.log(` Node already exists for "${name}" (node_id: ${existingNode[0].node_id})`);
        return {
            nodeId: existingNode[0].node_id,
            connectedTo: null,
            distance: 0,
            directionHint: 'Node already exists'
        };
    }

    // 2. Create node
    const [maxNode] = await pool.query('SELECT MAX(node_id) as max_id FROM campus_nodes');
    const newNodeId = (maxNode[0].max_id || 0) + 1;

    await pool.query(`
        INSERT INTO campus_nodes (node_id, node_name, latitude, longitude, is_indoor, building, floor, is_location, location_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [newNodeId, name, latitude, longitude, is_indoor || 0, building || null, floor || null, 1, locId]);

    console.log(` Created node ${newNodeId} for "${name}"`);

    // 3. Find the SINGLE nearest node (within 50m)
    const [nearestNode] = await pool.query(`
        SELECT 
            node_id, 
            node_name,
            latitude, 
            longitude,
            SQRT(POW(latitude - ?, 2) + POW(longitude - ?, 2)) * 111000 as distance_meters
        FROM campus_nodes 
        WHERE node_id != ? 
          AND SQRT(POW(latitude - ?, 2) + POW(longitude - ?, 2)) * 111000 < 50
        ORDER BY distance_meters ASC 
        LIMIT 1
    `, [latitude, longitude, newNodeId, latitude, longitude]);

    // 4. Connect to SINGLE nearest node
    if (nearestNode && nearestNode.node_id) {
        const distance = Math.round(nearestNode.distance_meters);

        // Forward: new → nearest
        await pool.query(`
            INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
            VALUES (?, ?, ?, ?, ?)
        `, [newNodeId, nearestNode.node_id, Math.max(1, distance), 'walkway', `Walk towards ${nearestNode.node_name}`]);

        // Return: nearest → new
        await pool.query(`
            INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
            VALUES (?, ?, ?, ?, ?)
        `, [nearestNode.node_id, newNodeId, Math.max(1, distance), 'walkway', `Walk towards ${name}`]);

        console.log(` "${name}" ↔ "${nearestNode.node_name}" (${distance}m)`);
    }

    return {
        nodeId: newNodeId,
        connectedTo: nearestNode?.node_id || null,
        distance: nearestNode ? Math.round(nearestNode.distance_meters) : 0,
        directionHint: nearestNode ? `Walk towards ${nearestNode.node_name}` : 'No connection'
    };
}


// ============================================================
// CREATE LOCATION (FULLY AUTOMATIC)
// ============================================================
const createLocation = async (req, res) => {
    try {
        const { name, admin_id, latitude, longitude, floor, is_indoor, building, description, create_node } = req.body;

        if (!name || !admin_id || latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                error: "Name, admin_id, latitude, and longitude are required"
            });
        }

        // Check duplicate coordinates
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
        `, [name, admin_id, latitude, longitude, floor || null, is_indoor || 0, building || null, description || null]);

        const [newLocation] = await pool.query(
            'SELECT * FROM locations WHERE locId = ?',
            [result.insertId]
        );

        // AUTO-GENERATE NODE AND EDGES
        const autoResult = await autoGenerateNodeAndEdges(newLocation[0]);

        res.status(201).json({
            location: newLocation[0],
            node: autoResult ? {
                nodeId: autoResult.nodeId,
                connectedTo: autoResult.connectedTo,
                distance: autoResult.distance,
                directionHint: autoResult.directionHint
            } : null,
            message: ' Location created with auto-generated node and edges!'
        });

    } catch (error) {
        console.error('Error creating location:', error);
        res.status(500).json({ error: 'Failed to create location' });
    }
};
// ============================================================
// CONNECT ALL NODES (Using k-Nearest Neighbors, k=2)
// ============================================================
const connectAllNodes = async (req, res) => {
    try {
        console.log('Connecting nodes using k-Nearest Neighbors (k=2)...');
        
        // 1. Clear existing blanket edges if resetting graph topology
        // await pool.query('DELETE FROM campus_edges');

        const [nodes] = await pool.query(
            'SELECT node_id, node_name, latitude, longitude FROM campus_nodes ORDER BY node_id'
        );

        if (nodes.length < 2) {
            return res.json({ success: true, message: 'Need at least 2 nodes to connect', edgesCreated: 0 });
        }

        let edgesCreated = 0;

        for (let i = 0; i < nodes.length; i++) {
            const currentNode = nodes[i];
            
            // Calculate distances to all other nodes
            const distances = [];
            for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                const dist = calculateDistance(
                    currentNode.latitude, currentNode.longitude,
                    nodes[j].latitude, nodes[j].longitude
                );
                // Only consider nodes within reasonable walking distance (e.g., 60m)
                if (dist <= 60) {
                    distances.push({ node: nodes[j], dist: Math.round(dist) });
                }
            }

            // Sort by distance and pick top 2 nearest neighbors
            distances.sort((a, b) => a.dist - b.dist);
            const nearestNeighbors = distances.slice(0, 2);

            for (const neighbor of nearestNeighbors) {
                const targetNode = neighbor.node;
                const distance = neighbor.dist;

                const [existing] = await pool.query(`
                    SELECT edge_id FROM campus_edges 
                    WHERE (from_node_id = ? AND to_node_id = ?) 
                       OR (from_node_id = ? AND to_node_id = ?)
                `, [currentNode.node_id, targetNode.node_id, targetNode.node_id, currentNode.node_id]);

                if (existing.length === 0) {
                    await pool.query(`
                        INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                        VALUES (?, ?, ?, ?, ?)
                    `, [currentNode.node_id, targetNode.node_id, distance, 'walkway', `Walk towards ${targetNode.node_name}`]);

                    await pool.query(`
                        INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                        VALUES (?, ?, ?, ?, ?)
                    `, [targetNode.node_id, currentNode.node_id, distance, 'walkway', `Walk towards ${currentNode.node_name}`]);

                    edgesCreated += 2;
                }
            }
        }

        res.json({
            success: true,
            message: ` Created ${edgesCreated} edges using nearest-neighbor topology.`,
            edgesCreated: edgesCreated
        });

    } catch (error) {
        console.error(' Error connecting nodes:', error);
        res.status(500).json({ error: 'Failed to connect nodes: ' + error.message });
    }
};

// ============================================================
// CREATE MISSING NODES
// ============================================================
const createMissingNodes = async (req, res) => {
    try {
        console.log(' Checking for locations without nodes...');
        
        const [missingLocations] = await pool.query(`
            SELECT l.* 
            FROM locations l
            LEFT JOIN campus_nodes n ON l.locId = n.location_id
            WHERE n.node_id IS NULL
            ORDER BY l.locId
        `);

        if (missingLocations.length === 0) {
            return res.json({
                success: true,
                message: ' All locations already have nodes!',
                nodesCreated: 0,
                locations: []
            });
        }

        console.log(` Found ${missingLocations.length} locations without nodes`);

        let nodesCreated = 0;
        const createdNodes = [];

        for (const location of missingLocations) {
            const result = await autoGenerateNodeAndEdges(location);
            await new Promise(resolve => setTimeout(resolve, 50));
            nodesCreated++;
            createdNodes.push({
                locId: location.locId,
                name: location.name,
                nodeId: result.nodeId,
                connectedTo: result.connectedTo,
                distance: result.distance,
                directionHint: result.directionHint
            });
            console.log(`    Created node ${result.nodeId} for "${location.name}"`);
        }

        res.json({
            success: true,
            message: ` Created ${nodesCreated} nodes for ${missingLocations.length} locations`,
            nodesCreated: nodesCreated,
            totalLocations: missingLocations.length,
            createdNodes: createdNodes
        });

    } catch (error) {
        console.error(' Error creating missing nodes:', error);
        res.status(500).json({ error: 'Failed to create missing nodes: ' + error.message });
    }
};

// ============================================================
// GET ALL LOCATIONS
// ============================================================
const getAllLocations = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT locId, name, latitude, longitude, building FROM locations ORDER BY name'
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
};

// ============================================================
// GET ALL NODES
// ============================================================
const getAllNodes = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM campus_nodes ORDER BY node_id');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching nodes:', error);
        res.status(500).json({ error: 'Failed to fetch nodes' });
    }
};

// ============================================================
// GET ALL EDGES
// ============================================================
const getAllEdges = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                e.*,
                n1.node_name AS from_node_name,
                n2.node_name AS to_node_name
            FROM campus_edges e
            JOIN campus_nodes n1 ON e.from_node_id = n1.node_id
            JOIN campus_nodes n2 ON e.to_node_id = n2.node_id
            ORDER BY e.edge_id
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching edges:', error);
        res.status(500).json({ error: 'Failed to fetch edges' });
    }
};

// ============================================================
// GET LOCATIONS BY ADMIN
// ============================================================
const getAllLocationsByAdminID = async (req, res) => {
    const { admin_id } = req.query;
    try {
        const [rows] = await pool.query(
            `SELECT * FROM locations WHERE admin_id = ? ORDER BY locId DESC`,
            [admin_id]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
};

// ============================================================
// GET PUBLIC LOCATIONS
// ============================================================
const getPublicLocations = async (req, res) => {
    const { admin_id } = req.query;
    const defaultAdminId = admin_id || 12;

    try {
        const [rows] = await pool.query(
            'SELECT locId, name, latitude, longitude, building, admin_id FROM locations WHERE admin_id = ? ORDER BY name',
            [defaultAdminId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching public locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
};

// ============================================================
// GET LOCATION BY ID
// ============================================================
const getLocationById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Id is required' });
        }

        const [rows] = await pool.query(
            'SELECT name, building, latitude, longitude FROM locations WHERE locId = ?',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        res.json({ success: true, location: rows[0] });
    } catch (error) {
        console.error('Error fetching location:', error);
        res.status(500).json({ error: 'Failed to fetch location' });
    }
};

// ============================================================
// UPDATE LOCATION
// ============================================================
const updateLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, latitude, longitude, floor, is_indoor, building, description } = req.body;

        if (!name || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'Name, latitude, and longitude are required' });
        }

        const [existing] = await pool.query('SELECT * FROM locations WHERE locId = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const oldLat = parseFloat(existing[0].latitude);
        const oldLng = parseFloat(existing[0].longitude);
        const newLat = parseFloat(latitude);
        const newLng = parseFloat(longitude);
        const coordsChanged = (oldLat !== newLat || oldLng !== newLng);

        await pool.query(`
            UPDATE locations SET name = ?, latitude = ?, longitude = ?, floor = ?, is_indoor = ?, building = ?, description = ?
            WHERE locId = ?
        `, [name, latitude, longitude, floor || null, is_indoor || false, building || null, description || null, id]);

        if (coordsChanged) {
            const [node] = await pool.query('SELECT node_id FROM campus_nodes WHERE location_id = ?', [id]);
            if (node.length > 0) {
                await pool.query('DELETE FROM campus_edges WHERE from_node_id = ? OR to_node_id = ?', [node[0].node_id, node[0].node_id]);
                const [updatedLocation] = await pool.query('SELECT * FROM locations WHERE locId = ?', [id]);
                await autoGenerateNodeAndEdges(updatedLocation[0]);
            }
        }

        const [updatedLocation] = await pool.query('SELECT * FROM locations WHERE locId = ?', [id]);
        res.json(updatedLocation[0]);

    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
};

// ============================================================
// DELETE LOCATION
// ============================================================
const deleteLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const [node] = await pool.query('SELECT node_id FROM campus_nodes WHERE location_id = ?', [id]);

        if (node.length > 0) {
            await pool.query('DELETE FROM campus_edges WHERE from_node_id = ? OR to_node_id = ?', [node[0].node_id, node[0].node_id]);
            await pool.query('DELETE FROM campus_nodes WHERE node_id = ?', [node[0].node_id]);
        }

        await pool.query('DELETE FROM locations WHERE locId = ?', [id]);
        res.json({ success: true, message: 'Location and associated node/edges deleted' });
    } catch (error) {
        console.error('Error deleting location:', error);
        res.status(500).json({ error: 'Failed to delete location' });
    }
};

module.exports = {
    createLocation,
    getAllLocations,
    getAllNodes,
    getAllEdges,
    getAllLocationsByAdminID,
    getPublicLocations,
    getLocationById,
    updateLocation,
    deleteLocation,
    connectAllNodes,
    createMissingNodes
};