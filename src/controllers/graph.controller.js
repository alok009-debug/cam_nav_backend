const pool = require('../db/sql.db');

// ============ GENERATE GRAPH FOR ALL LOCATIONS ============
const generateGraph = async (req, res) => {
    try {
        const adminId = req.adminId;
        console.log(` Generating graph for admin: ${adminId}`);

        // 1. Get all locations for this admin
        const [locations] = await pool.query(
            'SELECT * FROM locations WHERE admin_id = ?',
            [adminId]
        );

        if (locations.length === 0) {
            return res.status(404).json({ error: 'No locations found for this admin' });
        }

        console.log(` Found ${locations.length} locations`);

        let nodesCreated = 0;
        let edgesCreated = 0;
        let skipped = 0;

        // 2. For each location, create node if missing
        for (const loc of locations) {
            // Checking if node already exists
            const [existingNode] = await pool.query(
                'SELECT node_id FROM campus_nodes WHERE location_id = ?',
                [loc.locId]
            );

            if (existingNode.length === 0) {
                // Create node
                const [maxNode] = await pool.query('SELECT MAX(node_id) as max_id FROM campus_nodes');
                const newNodeId = (maxNode[0].max_id || 0) + 1;

                await pool.query(`
                    INSERT INTO campus_nodes (node_id, node_name, latitude, longitude, is_indoor, building, floor, is_location, location_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [newNodeId, loc.name, loc.latitude, loc.longitude, loc.is_indoor || 0, loc.building || null, loc.floor || null, 1, loc.locId]);

                nodesCreated++;
                console.log(`    Created node ${newNodeId} for "${loc.name}"`);

                // Connect to nearest node
                const [nearest] = await pool.query(`
                    SELECT 
                        node_id, 
                        node_name,
                        latitude, 
                        longitude,
                        SQRT(POW(latitude - ?, 2) + POW(longitude - ?, 2)) * 111000 as distance_meters
                    FROM campus_nodes 
                    WHERE node_id != ? 
                      AND location_id != ?
                      AND node_id NOT IN (SELECT from_node_id FROM campus_edges WHERE to_node_id = ?)
                      AND node_id NOT IN (SELECT to_node_id FROM campus_edges WHERE from_node_id = ?)
                    ORDER BY distance_meters ASC
                    LIMIT 1
                `, [loc.latitude, loc.longitude, newNodeId, loc.locId, newNodeId, newNodeId]);

                if (nearest && nearest.node_id) {
                    const distance = Math.round(nearest.distance_meters);

                    // Create edges
                    await pool.query(`
                        INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                        VALUES (?, ?, ?, ?, ?)
                    `, [newNodeId, nearest.node_id, Math.max(1, distance), 'walkway', `Walk towards ${nearest.node_name}`]);

                    await pool.query(`
                        INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                        VALUES (?, ?, ?, ?, ?)
                    `, [nearest.node_id, newNodeId, Math.max(1, distance), 'walkway', `Walk back towards ${loc.name}`]);

                    edgesCreated += 2;
                    console.log(`    Connected "${loc.name}" → "${nearest.node_name}" (${distance}m)`);
                } else {
                    console.log(`    No nearby node found for "${loc.name}"`);
                }
            } else {
                skipped++;
            }
        }

        // 3. Also connect existing nodes that have no edges
        const [isolatedNodes] = await pool.query(`
            SELECT n.node_id, n.node_name, n.latitude, n.longitude
            FROM campus_nodes n
            LEFT JOIN campus_edges e ON n.node_id = e.from_node_id OR n.node_id = e.to_node_id
            WHERE e.edge_id IS NULL
              AND n.location_id IS NOT NULL
        `);

        for (const node of isolatedNodes) {
            const [nearest] = await pool.query(`
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
            `, [node.latitude, node.longitude, node.node_id, node.node_id, node.node_id]);

            if (nearest && nearest.node_id) {
                const distance = Math.round(nearest.distance_meters);
                await pool.query(`
                    INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                    VALUES (?, ?, ?, ?, ?)
                `, [node.node_id, nearest.node_id, Math.max(1, distance), 'walkway', `Walk towards ${nearest.node_name}`]);
                await pool.query(`
                    INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                    VALUES (?, ?, ?, ?, ?)
                `, [nearest.node_id, node.node_id, Math.max(1, distance), 'walkway', `Walk back towards ${node.node_name}`]);
                edgesCreated += 2;
                console.log(`    Connected isolated "${node.node_name}" → "${nearest.node_name}" (${distance}m)`);
            }
        }

        const message = `Generated ${nodesCreated} nodes and ${edgesCreated} edges. ${skipped} locations already had nodes.`;
        console.log(message);

        res.json({
            success: true,
            message: message,
            stats: {
                nodesCreated,
                edgesCreated,
                skipped,
                totalLocations: locations.length,
                isolatedNodesConnected: isolatedNodes.length
            }
        });

    } catch (error) {
        console.error(' Graph generation error:', error);
        res.status(500).json({ error: 'Failed to generate graph: ' + error.message });
    }
};
// ============ CREATE HUB AND CONNECT ISOLATED NODES ============
const createHubAndConnect = async (req, res) => {
    try {
        const adminId = req.adminId;
        console.log(` Creating hub for admin: ${adminId}`);

        // 1. Get all isolated nodes (nodes with no edges)
        //  FIX: Remove admin_id condition from campus_nodes query
        const [isolatedNodes] = await pool.query(`
            SELECT n.node_id, n.node_name, n.latitude, n.longitude, n.location_id
            FROM campus_nodes n
            LEFT JOIN campus_edges e ON n.node_id = e.from_node_id OR n.node_id = e.to_node_id
            WHERE e.edge_id IS NULL
              AND n.location_id IS NOT NULL
              AND n.node_id > 10
        `);

        if (isolatedNodes.length === 0) {
            return res.json({
                success: true,
                message: 'No isolated nodes found! All nodes already connected.',
                stats: { nodesConnected: 0 }
            });
        }

        console.log(` Found ${isolatedNodes.length} isolated nodes`);

        // 2. Calculate center point
        let sumLat = 0, sumLng = 0;
        for (const node of isolatedNodes) {
            sumLat += parseFloat(node.latitude);
            sumLng += parseFloat(node.longitude);
        }
        const centerLat = sumLat / isolatedNodes.length;
        const centerLng = sumLng / isolatedNodes.length;

        console.log(` Center point: ${centerLat}, ${centerLng}`);

        // 3. Create Hub node
        const [maxNode] = await pool.query('SELECT MAX(node_id) as max_id FROM campus_nodes');
        const hubNodeId = (maxNode[0].max_id || 0) + 1;

        await pool.query(`
            INSERT INTO campus_nodes (node_id, node_name, latitude, longitude, is_location, building)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [hubNodeId, 'Central Hub', centerLat, centerLng, 0, 'Campus Center']);

        console.log(` Created Hub node ${hubNodeId}`);

        // 4. Connect all isolated nodes to Hub
        let edgesCreated = 0;
        for (const node of isolatedNodes) {
            const distance = Math.round(
                Math.sqrt(
                    Math.pow(parseFloat(node.latitude) - centerLat, 2) +
                    Math.pow(parseFloat(node.longitude) - centerLng, 2)
                ) * 111000
            );

            // Connect node → Hub
            await pool.query(`
                INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                VALUES (?, ?, ?, ?, ?)
            `, [node.node_id, hubNodeId, Math.max(1, distance), 'walkway', `Walk towards Central Hub`]);

            // Connect Hub → node
            await pool.query(`
                INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                VALUES (?, ?, ?, ?, ?)
            `, [hubNodeId, node.node_id, Math.max(1, distance), 'walkway', `Walk towards ${node.node_name}`]);

            edgesCreated += 2;
            console.log(`    Connected "${node.node_name}" → Hub (${distance}m)`);
        }

        console.log(` Created ${edgesCreated} edges`);

        res.json({
            success: true,
            message: ` Connected ${isolatedNodes.length} isolated nodes to Central Hub (${edgesCreated} edges created)`,
            stats: {
                nodesConnected: isolatedNodes.length,
                edgesCreated: edgesCreated,
                hubNodeId: hubNodeId
            }
        });

    } catch (error) {
        console.error(' Hub creation error:', error);
        res.status(500).json({ error: 'Failed to create hub: ' + error.message });
    }
};

// ============ SMART CONNECT - Auto-connect nearby nodes ============
const smartConnect = async (req, res) => {
    try {
        console.log(` Smart connect initiated...`);

        // 1. Get all nodes with location_id
        const [nodes] = await pool.query(`
            SELECT node_id, node_name, latitude, longitude, location_id
            FROM campus_nodes
            WHERE location_id IS NOT NULL
              AND node_id > 10
        `);

        if (nodes.length < 2) {
            return res.json({ 
                success: true, 
                message: 'Need at least 2 locations to connect.',
                stats: { edgesAdded: 0 }
            });
        }

        console.log(` Found ${nodes.length} nodes`);

        let edgesAdded = 0;
        let skipped = 0;

        // 2. For each pair of nodes, check if they are within 1km
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const node1 = nodes[i];
                const node2 = nodes[j];

                // Calculate distance in meters
                const distance = Math.round(
                    Math.sqrt(
                        Math.pow(parseFloat(node1.latitude) - parseFloat(node2.latitude), 2) + 
                        Math.pow(parseFloat(node1.longitude) - parseFloat(node2.longitude), 2)
                    ) * 111000
                );

                // If within 1km, connect them
                if (distance < 1000) {
                    // Check if edge already exists
                    const [existing] = await pool.query(`
                        SELECT edge_id FROM campus_edges 
                        WHERE (from_node_id = ? AND to_node_id = ?) 
                           OR (from_node_id = ? AND to_node_id = ?)
                    `, [node1.node_id, node2.node_id, node2.node_id, node1.node_id]);

                    if (existing.length === 0) {
                        // Add forward edge
                        await pool.query(`
                            INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                            VALUES (?, ?, ?, ?, ?)
                        `, [node1.node_id, node2.node_id, Math.max(1, distance), 'walkway', `Walk towards ${node2.node_name}`]);

                        // Add return edge
                        await pool.query(`
                            INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                            VALUES (?, ?, ?, ?, ?)
                        `, [node2.node_id, node1.node_id, Math.max(1, distance), 'walkway', `Walk back towards ${node1.node_name}`]);

                        edgesAdded += 2;
                        console.log(`   Connected "${node1.node_name}" ↔ "${node2.node_name}" (${distance}m)`);
                    } else {
                        skipped++;
                    }
                }
            }
        }

        // 3. Also connect isolated nodes (nodes with no edges) to nearest node
        const [isolatedNodes] = await pool.query(`
            SELECT n.node_id, n.node_name, n.latitude, n.longitude
            FROM campus_nodes n
            LEFT JOIN campus_edges e ON n.node_id = e.from_node_id OR n.node_id = e.to_node_id
            WHERE e.edge_id IS NULL
              AND n.location_id IS NOT NULL
              AND n.node_id > 10
        `);

        for (const node of isolatedNodes) {
            // Find nearest node
            const [nearest] = await pool.query(`
                SELECT 
                    node_id, 
                    node_name,
                    SQRT(POW(latitude - ?, 2) + POW(longitude - ?, 2)) * 111000 as distance_meters
                FROM campus_nodes 
                WHERE node_id != ? 
                  AND location_id IS NOT NULL
                ORDER BY distance_meters ASC
                LIMIT 1
            `, [node.latitude, node.longitude, node.node_id]);

            if (nearest && nearest.node_id) {
                const distance = Math.round(nearest.distance_meters);
                await pool.query(`
                    INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                    VALUES (?, ?, ?, ?, ?)
                `, [node.node_id, nearest.node_id, Math.max(1, distance), 'walkway', `Walk towards ${nearest.node_name}`]);

                await pool.query(`
                    INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                    VALUES (?, ?, ?, ?, ?)
                `, [nearest.node_id, node.node_id, Math.max(1, distance), 'walkway', `Walk back towards ${node.node_name}`]);

                edgesAdded += 2;
                console.log(`    Connected isolated "${node.node_name}" → "${nearest.node_name}" (${distance}m)`);
            }
        }

        const message = ` Connected ${edgesAdded/2} pairs of nearby locations (${edgesAdded} edges added). ${skipped} pairs already connected.`;
        console.log(message);

        res.json({
            success: true,
            message: message,
            stats: {
                edgesAdded: edgesAdded,
                pairsConnected: edgesAdded / 2,
                skipped: skipped,
                totalNodes: nodes.length,
                isolatedNodesConnected: isolatedNodes.length
            }
        });

    } catch (error) {
        console.error('Smart connect error:', error);
        res.status(500).json({ error: 'Failed to connect locations: ' + error.message });
    }
};
module.exports = { 
    generateGraph, 
    createHubAndConnect,
    smartConnect  
};