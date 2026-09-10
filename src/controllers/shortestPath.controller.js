const pool = require('../db/sql.db');

// ============ SHORTEST PATH USING DIJKSTRA ============
const shortestPath = async (req, res) => {
    try {
        const { startId, endId } = req.body;

        console.log(` Finding shortest path from ${startId} to ${endId}`);

        if (!startId || !endId) {
            return res.status(400).json({ error: "Start and end IDs are required" });
        }

        // Find start and end nodes
        let [startLoc] = await pool.query(
            `SELECT * FROM campus_nodes WHERE node_id = ? OR location_id = ?`,
            [startId, startId]
        );

        let [endLoc] = await pool.query(
            `SELECT * FROM campus_nodes WHERE node_id = ? OR location_id = ?`,
            [endId, endId]
        );

        // Fallback to locations table
        if (startLoc.length === 0) {
            const [loc] = await pool.query(`SELECT * FROM locations WHERE locId = ?`, [startId]);
            if (loc.length > 0) {
                const [node] = await pool.query(`SELECT * FROM campus_nodes WHERE location_id = ?`, [startId]);
                if (node.length > 0) startLoc = node;
            }
        }

        if (endLoc.length === 0) {
            const [loc] = await pool.query(`SELECT * FROM locations WHERE locId = ?`, [endId]);
            if (loc.length > 0) {
                const [node] = await pool.query(`SELECT * FROM campus_nodes WHERE location_id = ?`, [endId]);
                if (node.length > 0) endLoc = node;
            }
        }

        if (startLoc.length === 0 || endLoc.length === 0) {
            return res.status(404).json({
                error: "Location not found in graph",
                startFound: startLoc.length > 0,
                endFound: endLoc.length > 0
            });
        }

        const startNode = startLoc[0];
        const endNode = endLoc[0];

        console.log(` Start: ${startNode.node_name} (node: ${startNode.node_id})`);
        console.log(` End: ${endNode.node_name} (node: ${endNode.node_id})`);

        // Get all edges
        const [edges] = await pool.query('SELECT * FROM campus_edges');

        // Build adjacency list
        const adj = buildAdjacencyList(edges);

        // Run Dijkstra with proper unreachable handling
        const result = dijkstra(adj, startNode.node_id, endNode.node_id);

        // FIX: Check if path was found
        if (!result || result.path.length === 0) {
            return res.status(404).json({
                success: false,
                error: "No path found between these locations",
                from: startNode.node_name,
                to: endNode.node_name,
                message: "These locations are not connected in the campus graph. Please add edges between them."
            });
        }

        // Get node details for the path
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

        // Get direction hints
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
        console.error(" Shortest path error:", error);
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

// ============ DIJKSTRA WITH UNREACHABLE HANDLING ============
function dijkstra(adj, src, dest) {
    const nodes = Object.keys(adj).map(Number);

    //  If source or destination not in graph, return empty path
    if (!adj[src] || !adj[dest]) {
        console.log(`⚠️ Source (${src}) or destination (${dest}) not in graph`);
        return { path: [], totalDistance: 0 };
    }

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

    //  Track nodes processed to detect unreachable
    let processedCount = 0;
    const maxNodes = nodes.length;

    while (pq.length > 0) {
        pq.sort((a, b) => a.dist - b.dist);
        const { node: u } = pq.shift();

        //  Safety: Prevent infinite loop
        if (processedCount > maxNodes * 2) {
            console.log(`⚠️ Too many iterations (${processedCount}), breaking loop`);
            break;
        }

        if (visited[u]) continue;
        visited[u] = true;
        processedCount++;

        //  If we reached destination, we can stop early
        if (u === dest) {
            console.log(`✅ Found path to destination after ${processedCount} iterations`);
            break;
        }

        //  If no neighbors, continue (dead end)
        const neighbors = adj[u] || [];
        if (neighbors.length === 0) {
            console.log(`⚠️ Node ${u} has no neighbors (dead end)`);
            continue;
        }

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

    //  Check if destination is reachable
    if (dist[dest] === Infinity || dist[dest] === undefined) {
        console.log(` Destination ${dest} is unreachable from ${src}`);
        return { path: [], totalDistance: 0 };
    }

    // Reconstruct path
    const path = [];
    let current = dest;
    let safetyCount = 0;
    const maxPathLength = nodes.length;

    while (current !== null && safetyCount < maxPathLength * 2) {
        path.unshift(current);
        current = prev[current];
        safetyCount++;
    }

    //  If path doesn't start with source, something went wrong
    if (path.length === 0 || path[0] !== src) {
        console.log(`⚠️ Invalid path reconstructed: ${path}`);
        return { path: [], totalDistance: 0 };
    }

    return {
        path: path,
        totalDistance: dist[dest]
    };
}




// Priority Queue helper for Dijkstra's Algorithm
class PriorityQueue {
    constructor() {
        this.values = [];
    }

    enqueue(node, priority) {
        this.values.push({ node, priority });
        this.sort();
    }

    dequeue() {
        return this.values.shift();
    }

    sort() {
        this.values.sort((a, b) => a.priority - b.priority);
    }

    isEmpty() {
        return this.values.length === 0;
    }
}

/**
 * Find the shortest path between two locations (or nodes)
 * Endpoint: POST /api/shortest-path
 * Body: { startId, endId } OR { startNodeId, endNodeId }
 */
const getShortestPathKNN = async (req, res) => {
    try {
        const { startId, endId, startNodeId, endNodeId } = req.body;

        if ((!startId && !startNodeId) || (!endId && !endNodeId)) {
            return res.status(400).json({
                error: 'Please provide both start and end locations/nodes.'
            });
        }

        // ============ STEP 1: RESOLVE LOCATION IDs TO NODE IDs ============
        let sourceNodeId = startNodeId;
        let targetNodeId = endNodeId;

        if (startId) {
            const [startNodes] = await pool.query(
                'SELECT node_id FROM campus_nodes WHERE location_id = ? LIMIT 1',
                [startId]
            );
            if (startNodes.length === 0) {
                return res.status(404).json({ error: `Start location (ID: ${startId}) has no mapped campus node.` });
            }
            sourceNodeId = startNodes[0].node_id;
        }

        if (endId) {
            const [endNodes] = await pool.query(
                'SELECT node_id FROM campus_nodes WHERE location_id = ? LIMIT 1',
                [endId]
            );
            if (endNodes.length === 0) {
                return res.status(404).json({ error: `Destination location (ID: ${endId}) has no mapped campus node.` });
            }
            targetNodeId = endNodes[0].node_id;
        }

        if (sourceNodeId === targetNodeId) {
            return res.status(200).json({
                success: true,
                message: 'Start and destination are identical.',
                totalDistanceMeters: 0,
                pathNodes: [],
                directions: []
            });
        }

        // ============ STEP 2: LOAD NODES & EDGES FOR GRAPH CONSTRUCTION ============
        const [allNodes] = await pool.query('SELECT node_id, node_name, latitude, longitude, building, floor FROM campus_nodes');
        const [allEdges] = await pool.query('SELECT from_node_id, to_node_id, distance_meters, direction_hint FROM campus_edges');

        if (allNodes.length === 0 || allEdges.length === 0) {
            return res.status(500).json({ error: 'Campus graph data is missing or incomplete.' });
        }

        // Build Adjacency List
        const nodeMap = new Map();
        allNodes.forEach(node => {
            nodeMap.set(node.node_id, node);
        });

        const graph = new Map();
        allNodes.forEach(node => graph.set(node.node_id, []));

        allEdges.forEach(edge => {
            if (graph.has(edge.from_node_id)) {
                graph.get(edge.from_node_id).push({
                    node: edge.to_node_id,
                    weight: parseFloat(edge.distance_meters),
                    hint: edge.direction_hint
                });
            }
        });

        // ============ STEP 3: DIJKSTRA'S SHORTEST PATH ALGORITHM ============
        const distances = {};
        const previous = {};
        const directionHints = {};
        const pq = new PriorityQueue();

        allNodes.forEach(node => {
            const id = node.node_id;
            if (id === sourceNodeId) {
                distances[id] = 0;
                pq.enqueue(id, 0);
            } else {
                distances[id] = Infinity;
                pq.enqueue(id, Infinity);
            }
            previous[id] = null;
            directionHints[id] = null;
        });

        while (!pq.isEmpty()) {
            const { node: currentLowestNode } = pq.dequeue();

            if (currentLowestNode === targetNodeId) {
                break; // Target reached
            }

            if (!currentLowestNode || distances[currentLowestNode] === Infinity) {
                continue;
            }



            const neighbors = graph.get(currentLowestNode) || [];
            for (const neighbor of neighbors) {
                const candidateDistance = distances[currentLowestNode] + neighbor.weight;

                if (candidateDistance < distances[neighbor.node]) {
                    distances[neighbor.node] = candidateDistance;
                    previous[neighbor.node] = currentLowestNode;
                    directionHints[neighbor.node] = neighbor.hint;
                    pq.enqueue(neighbor.node, candidateDistance);
                }
            }
        }



        const pathNodes = [];
        const directions = [];
        let curr = targetNodeId;

        while (curr !== null) {
            const nodeData = nodeMap.get(curr);
            pathNodes.unshift(nodeData);

            if (previous[curr] !== null) {
                directions.unshift({
                    fromNodeId: previous[curr],
                    toNodeId: curr,
                    instruction: directionHints[curr] || `Walk towards ${nodeData.node_name}`
                });
            }
            curr = previous[curr];
        }
        if (distances[targetNodeId] === Infinity) {
            return res.status(404).json({
                error: `No navigable path exists between Node ${sourceNodeId} and Node ${targetNodeId}. Please run /api/graph/smart-connect to generate missing edges.`
            });
        }
        // ============ STEP 4: RECONSTRUCT PATH & BUILD DIRECTORY PAYLOAD ============
        if (distances[targetNodeId] === Infinity) {
            return res.status(404).json({
                error: 'No navigable path found between the selected locations. Please ensure network graph is connected.'
            });
        }


        // Return complete response for frontend rendering
        return res.status(200).json({
            success: true,
            totalDistanceMeters: Math.round(distances[targetNodeId]),
            estimatedWalkTimeMinutes: Math.ceil(distances[targetNodeId] / 80), // ~80m per min average walking speed
            totalNodesInPath: pathNodes.length,
            path: pathNodes.map(node => ({
                nodeId: node.node_id,
                name: node.node_name,
                latitude: parseFloat(node.latitude),
                longitude: parseFloat(node.longitude),
                building: node.building,
                floor: node.floor
            })),
            directions
        });

    } catch (error) {
        console.error(' Pathfinding error:', error);
        res.status(500).json({ error: 'Failed to calculate shortest path: ' + error.message });
    }
};

module.exports = { shortestPath, getShortestPathKNN };
