const pool = require('../db/sql.db');

// ============ SHORTEST PATH USING DIJKSTRA ============
const shortestPath = async (req, res) => {
    try {
        const { startId, endId } = req.body;

        console.log(`📍 Finding shortest path from ${startId} to ${endId}`);

        if (!startId || !endId) {
            return res.status(400).json({ error: "Start and end IDs are required" });
        }

        // 🔧 FIX: Try to find as node_id first, then as location_id
        let [startLoc] = await pool.query(
            `SELECT * FROM campus_nodes WHERE node_id = ? OR location_id = ?`,
            [startId, startId]
        );

        let [endLoc] = await pool.query(
            `SELECT * FROM campus_nodes WHERE node_id = ? OR location_id = ?`,
            [endId, endId]
        );

        // If still not found, try to find the node linked to this location_id
        if (startLoc.length === 0) {
            const [loc] = await pool.query(
                `SELECT * FROM locations WHERE locId = ?`,
                [startId]
            );
            if (loc.length > 0) {
                const [node] = await pool.query(
                    `SELECT * FROM campus_nodes WHERE location_id = ?`,
                    [startId]
                );
                if (node.length > 0) startLoc = node;
            }
        }

        if (endLoc.length === 0) {
            const [loc] = await pool.query(
                `SELECT * FROM locations WHERE locId = ?`,
                [endId]
            );
            if (loc.length > 0) {
                const [node] = await pool.query(
                    `SELECT * FROM campus_nodes WHERE location_id = ?`,
                    [endId]
                );
                if (node.length > 0) endLoc = node;
            }
        }

        if (startLoc.length === 0 || endLoc.length === 0) {
            // 🔧 DEBUG: Show available nodes
            const [allNodes] = await pool.query('SELECT node_id, node_name, location_id FROM campus_nodes');
            console.log('📋 Available nodes:', allNodes);
            
            return res.status(404).json({ 
                error: "Location not found in graph",
                startFound: startLoc.length > 0,
                endFound: endLoc.length > 0,
                availableNodes: allNodes.map(n => ({
                    node_id: n.node_id,
                    node_name: n.node_name,
                    location_id: n.location_id
                }))
            });
        }

        const startNode = startLoc[0];
        const endNode = endLoc[0];

        console.log(`📍 Start: ${startNode.node_name} (node: ${startNode.node_id}, location: ${startNode.location_id})`);
        console.log(`📍 End: ${endNode.node_name} (node: ${endNode.node_id}, location: ${endNode.location_id})`);

        // 2. Get all edges
        const [edges] = await pool.query('SELECT * FROM campus_edges');

        // 3. Build adjacency list
        const adj = buildAdjacencyList(edges);

        // 4. Run Dijkstra
        const result = dijkstra(adj, startNode.node_id, endNode.node_id);

        if (!result || result.path.length === 0) {
            return res.status(404).json({ 
                error: "No path found between these locations" 
            });
        }

        // 5. Get node details for the path
        const pathNodes = [];
        for (const nodeId of result.path) {
            const [node] = await pool.query(
                `SELECT * FROM campus_nodes WHERE node_id = ?`,
                [nodeId]
            );
            if (node.length > 0) {
                pathNodes.push({
                    node_id: node[0].node_id,
                    node_name: node[0].node_name,
                    latitude: node[0].latitude,
                    longitude: node[0].longitude
                });
            }
        }

        // 6. Get direction hints for the path
        const directions = [];
        for (let i = 0; i < result.path.length - 1; i++) {
            const fromId = result.path[i];
            const toId = result.path[i + 1];
            
            const [edge] = await pool.query(
                `SELECT * FROM campus_edges 
                 WHERE (from_node_id = ? AND to_node_id = ?) 
                    OR (from_node_id = ? AND to_node_id = ?)`,
                [fromId, toId, toId, fromId]
            );
            
            if (edge.length > 0) {
                directions.push({
                    from: fromId,
                    to: toId,
                    distance: edge[0].distance_meters,
                    direction: edge[0].direction_hint || 'Continue walking'
                });
            }
        }

        res.status(200).json({
            success: true,
            start: {
                node_id: startNode.node_id,
                name: startNode.node_name,
                latitude: startNode.latitude,
                longitude: startNode.longitude
            },
            end: {
                node_id: endNode.node_id,
                name: endNode.node_name,
                latitude: endNode.latitude,
                longitude: endNode.longitude
            },
            path: result.path,
            pathNodes: pathNodes,
            directions: directions,
            totalDistance: result.totalDistance,
            message: "Shortest path found successfully"
        });

    } catch (error) {
        console.error("❌ Shortest path error:", error);
        res.status(500).json({ 
            error: "Failed to find shortest path",
            details: error.message 
        });
    }
};

// ============ BUILD ADJACENCY LIST ============
function buildAdjacencyList(edges) {
    const adj = {};

    edges.forEach(edge => {
        const { from_node_id, to_node_id, distance_meters } = edge;

        if (!adj[from_node_id]) adj[from_node_id] = [];
        if (!adj[to_node_id]) adj[to_node_id] = [];

        adj[from_node_id].push({ node: to_node_id, weight: distance_meters });
        adj[to_node_id].push({ node: from_node_id, weight: distance_meters });
    });

    return adj;
}

// ============ DIJKSTRA ALGORITHM ============
function dijkstra(adj, src, dest) {
    const nodes = Object.keys(adj).map(Number);
    const dist = {};
    const prev = {};
    const visited = {};

    nodes.forEach(node => {
        dist[node] = Infinity;
        prev[node] = null;
        visited[node] = false;
    });

    dist[src] = 0;
    const pq = [{ node: src, dist: 0 }];

    while (pq.length > 0) {
        pq.sort((a, b) => a.dist - b.dist);
        const { node: u } = pq.shift();

        if (visited[u]) continue;
        visited[u] = true;

        if (u === dest) break;

        const neighbors = adj[u] || [];
        for (const neighbor of neighbors) {
            const v = neighbor.node;
            const weight = neighbor.weight;

            if (!visited[v] && dist[u] + weight < dist[v]) {
                dist[v] = dist[u] + weight;
                prev[v] = u;
                pq.push({ node: v, dist: dist[v] });
            }
        }
    }

    if (dist[dest] === Infinity) {
        return { path: [], totalDistance: 0 };
    }

    const path = [];
    let current = dest;
    while (current !== null) {
        path.unshift(current);
        current = prev[current];
    }

    return {
        path: path,
        totalDistance: dist[dest]
    };
}

module.exports = { shortestPath };