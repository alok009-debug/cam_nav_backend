const mysql = require('mysql2/promise');
require('dotenv').config();

const seedData = async () => {
    console.log('🌱 Starting smart database seed...');

    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'campus_navigator',
        port: parseInt(process.env.DB_PORT) || 3306,
        ...(process.env.NODE_ENV === 'production' && {
            ssl: { rejectUnauthorized: false }
        })
    });

    try {
        // ============ 1. GET ALL LOCATIONS THAT NEED NODES ============
        console.log('📍 Finding locations without nodes...');

        const [locationsWithoutNodes] = await pool.query(`
            SELECT l.locId, l.name, l.latitude, l.longitude, l.building, l.floor, l.is_indoor, l.admin_id
            FROM locations l
            LEFT JOIN campus_nodes n ON l.locId = n.location_id
            WHERE n.node_id IS NULL
            ORDER BY l.locId
        `);

        if (locationsWithoutNodes.length === 0) {
            console.log('✅ All locations already have nodes!');
        } else {
            console.log(`📊 Found ${locationsWithoutNodes.length} locations without nodes`);

            // ============ 2. CREATE NODES FOR MISSING LOCATIONS ============
            let insertedCount = 0;
            for (const loc of locationsWithoutNodes) {
                // Find max node_id to assign new IDs
                const [maxId] = await pool.query('SELECT MAX(node_id) as max_id FROM campus_nodes');
                const nextId = (maxId[0].max_id || 0) + 1;

                await pool.query(`
                    INSERT INTO campus_nodes (node_id, node_name, latitude, longitude, is_indoor, building, floor, is_location, location_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    nextId,
                    loc.name,
                    loc.latitude,
                    loc.longitude,
                    loc.is_indoor || 0,
                    loc.building || null,
                    loc.floor || null,
                    1,  // is_location = true
                    loc.locId
                ]);

                insertedCount++;
                console.log(`   ✅ Created node ${nextId} for "${loc.name}"`);
            }
            console.log(`✅ ${insertedCount} nodes created`);
        }

        // ============ 3. FIND NODES WITHOUT EDGES ============
        console.log('🔗 Finding nodes without connections...');

        const [nodesWithoutEdges] = await pool.query(`
            SELECT n.node_id, n.node_name, n.latitude, n.longitude, n.location_id
            FROM campus_nodes n
            LEFT JOIN campus_edges e1 ON n.node_id = e1.from_node_id
            LEFT JOIN campus_edges e2 ON n.node_id = e2.to_node_id
            WHERE e1.edge_id IS NULL AND e2.edge_id IS NULL
              AND n.location_id IS NOT NULL
              AND n.node_id > 10  -- Skip existing campus nodes
            ORDER BY n.node_id
        `);

        if (nodesWithoutEdges.length === 0) {
            console.log('✅ All nodes already have connections!');
        } else {
            console.log(`📊 Found ${nodesWithoutEdges.length} nodes without edges`);

            // ============ 4. CREATE EDGES BASED ON PROXIMITY ============
            let edgeCount = 0;

            for (let i = 0; i < nodesWithoutEdges.length; i++) {
                const currentNode = nodesWithoutEdges[i];

                // Find nearest node to connect to
                const [nearest] = await pool.query(`
                    SELECT 
                        n2.node_id,
                        n2.node_name,
                        n2.latitude,
                        n2.longitude,
                        SQRT(
                            POW(n2.latitude - ?, 2) + 
                            POW(n2.longitude - ?, 2)
                        ) as distance_units
                    FROM campus_nodes n2
                    WHERE n2.node_id != ?
                      AND n2.node_id NOT IN (
                          SELECT from_node_id FROM campus_edges WHERE to_node_id = ?
                          UNION
                          SELECT to_node_id FROM campus_edges WHERE from_node_id = ?
                      )
                    ORDER BY distance_units ASC
                    LIMIT 1
                `, [currentNode.latitude, currentNode.longitude, currentNode.node_id, currentNode.node_id, currentNode.node_id]);

                if (nearest && nearest.node_id) {
                    // Calculate approximate distance in meters
                    const distanceMeters = Math.round(nearest.distance_units * 111000);

                    await pool.query(`
                        INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                        VALUES (?, ?, ?, ?, ?)
                    `, [
                        currentNode.node_id,
                        nearest.node_id,
                        Math.max(1, distanceMeters), // Minimum 1 meter
                        'walkway',
                        `Walk towards ${nearest.node_name}`
                    ]);

                    // Also add return edge
                    await pool.query(`
                        INSERT INTO campus_edges (from_node_id, to_node_id, distance_meters, edge_type, direction_hint)
                        VALUES (?, ?, ?, ?, ?)
                    `, [
                        nearest.node_id,
                        currentNode.node_id,
                        Math.max(1, distanceMeters),
                        'walkway',
                        `Walk back towards ${currentNode.node_name}`
                    ]);

                    edgeCount += 2;
                    console.log(`   🔗 Connected "${currentNode.node_name}" → "${nearest.node_name}" (${distanceMeters}m)`);
                }
            }
            console.log(`✅ ${edgeCount} edges created`);
        }

        // ============ 5. VERIFY ============
        const [nodeCount] = await pool.query('SELECT COUNT(*) as total FROM campus_nodes');
        const [edgeCountResult] = await pool.query('SELECT COUNT(*) as total FROM campus_edges');

        console.log(`\n📊 Summary:`);
        console.log(`   🟢 ${nodeCount[0].total} total nodes`);
        console.log(`   🔗 ${edgeCountResult[0].total} total edges`);
        console.log(`\n✅ Smart seed completed successfully!`);

    } catch (error) {
        console.error('❌ Seed failed:', error.message);
        console.error('   SQL Error:', error.sql);
    } finally {
        await pool.end();
    }
};

// Run the seed
seedData();