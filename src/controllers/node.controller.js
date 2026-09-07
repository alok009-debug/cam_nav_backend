const pool = require('../db/sql.db');

// ============ GET ALL NODES ============
const getAllNodes = async (req, res) => {
    try {
        const [nodes] = await pool.query(`
            SELECT 
                n.*,
                l.name AS location_name,
                CASE WHEN n.location_id IS NOT NULL THEN 'Yes' ELSE 'No' END AS is_location_text
            FROM campus_nodes n
            LEFT JOIN locations l ON n.location_id = l.locId
            ORDER BY n.node_id DESC
        `);
        res.json(nodes);
    } catch (error) {
        console.error('Error fetching nodes:', error);
        res.status(500).json({ error: 'Failed to fetch nodes' });
    }
};

// ============ GET ALL EDGES ============
const getAllEdges = async (req, res) => {
    try {
        const [edges] = await pool.query(`
            SELECT 
                e.*,
                fn.node_name AS from_node_name,
                tn.node_name AS to_node_name
            FROM campus_edges e
            JOIN campus_nodes fn ON e.from_node_id = fn.node_id
            JOIN campus_nodes tn ON e.to_node_id = tn.node_id
            ORDER BY e.edge_id DESC
        `);
        res.json(edges);
    } catch (error) {
        console.error('Error fetching edges:', error);
        res.status(500).json({ error: 'Failed to fetch edges' });
    }
};

// ============ CREATE NODE ============
const createNode = async (req, res) => {
    try {
        const { 
            node_name, 
            latitude, 
            longitude, 
            is_indoor, 
            building, 
            floor, 
            is_location, 
            location_id,
            admin_id 
        } = req.body;

        if (!node_name || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ 
                error: 'Node name, latitude, and longitude are required' 
            });
        }

        const [maxNode] = await pool.query('SELECT MAX(node_id) as max_id FROM campus_nodes');
        const newNodeId = (maxNode[0].max_id || 0) + 1;

        await pool.query(`
            INSERT INTO campus_nodes (
                node_id, node_name, latitude, longitude, is_indoor, 
                building, floor, is_location, location_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            newNodeId, 
            node_name, 
            latitude, 
            longitude, 
            is_indoor || 0, 
            building || null, 
            floor || null, 
            is_location ? 1 : 0, 
            location_id || null
        ]);

        const [newNode] = await pool.query(`
            SELECT * FROM campus_nodes WHERE node_id = ?
        `, [newNodeId]);

        res.status(201).json({
            success: true,
            message: `Node "${node_name}" created successfully`,
            node: newNode[0]
        });

    } catch (error) {
        console.error('Error creating node:', error);
        res.status(500).json({ error: 'Failed to create node: ' + error.message });
    }
};

// ============ CONNECT NODES ============
const connectNodes = async (req, res) => {
    try {
        const { from_node_id, to_node_id, distance_meters, edge_type, direction_hint } = req.body;

        if (!from_node_id || !to_node_id || !distance_meters) {
            return res.status(400).json({ 
                error: 'From node, to node, and distance are required' 
            });
        }

        const [fromNode] = await pool.query(
            'SELECT node_id FROM campus_nodes WHERE node_id = ?',
            [from_node_id]
        );
        const [toNode] = await pool.query(
            'SELECT node_id FROM campus_nodes WHERE node_id = ?',
            [to_node_id]
        );

        if (fromNode.length === 0 || toNode.length === 0) {
            return res.status(404).json({ error: 'One or both nodes not found' });
        }

        const [existing] = await pool.query(`
            SELECT edge_id FROM campus_edges 
            WHERE (from_node_id = ? AND to_node_id = ?) 
               OR (from_node_id = ? AND to_node_id = ?)
        `, [from_node_id, to_node_id, to_node_id, from_node_id]);

        if (existing.length > 0) {
            return res.status(409).json({ 
                error: 'Edge already exists between these nodes',
                existingEdgeId: existing[0].edge_id
            });
        }

        await pool.query(`
            INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
            VALUES (?, ?, ?, ?, ?)
        `, [from_node_id, to_node_id, distance_meters, edge_type || 'walkway', direction_hint || `Walk towards ${toNode[0].node_name}`]);

        await pool.query(`
            INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
            VALUES (?, ?, ?, ?, ?)
        `, [to_node_id, from_node_id, distance_meters, edge_type || 'walkway', `Walk back towards ${fromNode[0].node_name}`]);

        res.json({
            success: true,
            message: 'Nodes connected successfully'
        });

    } catch (error) {
        console.error('Error connecting nodes:', error);
        res.status(500).json({ error: 'Failed to connect nodes: ' + error.message });
    }
};

module.exports = {
    getAllNodes,
    getAllEdges,
    createNode,
    connectNodes
};