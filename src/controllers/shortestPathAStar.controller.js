const pool = require('../db/sql.db');
const { aStar } = require('../utils/astar');

// ============================================================
// A* SHORTEST PATH CONTROLLER
// ============================================================
const getShortestPathAStar = async (req, res) => {
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
                return res.status(404).json({
                    error: `Start location (ID: ${startId}) has no mapped campus node.`
                });
            }
            sourceNodeId = startNodes[0].node_id;
        }

        if (endId) {
            const [endNodes] = await pool.query(
                'SELECT node_id FROM campus_nodes WHERE location_id = ? LIMIT 1',
                [endId]
            );
            if (endNodes.length === 0) {
                return res.status(404).json({
                    error: `Destination location (ID: ${endId}) has no mapped campus node.`
                });
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

        // ============ STEP 2: LOAD NODES & EDGES ============
        const [allNodes] = await pool.query(
            'SELECT node_id, node_name, latitude, longitude, building, floor FROM campus_nodes'
        );
        const [allEdges] = await pool.query(
            'SELECT from_node_id, to_node_id, distance_meters, direction_hint FROM campus_edges'
        );

        if (allNodes.length === 0 || allEdges.length === 0) {
            return res.status(500).json({
                error: 'Campus graph data is missing or incomplete.'
            });
        }

        // ============ STEP 3: BUILD NODE MAP + GRAPH ============
        const nodeMap = {};
        allNodes.forEach(node => {
            nodeMap[node.node_id] = node;
        });

        const graph = {};
        allNodes.forEach(node => graph[node.node_id] = []);

        allEdges.forEach(edge => {
            if (graph[edge.from_node_id]) {
                graph[edge.from_node_id].push({
                    node: edge.to_node_id,
                    weight: parseFloat(edge.distance_meters),
                    hint: edge.direction_hint
                });
            }
            // Reverse edge (in case DB doesn't store both directions)
            if (graph[edge.to_node_id]) {
                graph[edge.to_node_id].push({
                    node: edge.from_node_id,
                    weight: parseFloat(edge.distance_meters),
                    hint: edge.direction_hint
                });
            }
        });

        // ============ STEP 4: RUN A* ============
        const result = aStar(graph, nodeMap, sourceNodeId, targetNodeId);

        if (!result || result.path.length === 0) {
            return res.status(404).json({
                success: false,
                error: `No navigable path exists between Node ${sourceNodeId} and Node ${targetNodeId}.`,
                suggestion: 'Run POST /api/admin/connect-all to auto-connect nodes.'
            });
        }

        // ============ STEP 5: BUILD RESPONSE ============
        const pathNodes = [];
        const directions = [];

        for (let i = 0; i < result.path.length; i++) {
            const nodeId = result.path[i];
            const node = nodeMap[nodeId];
            if (!node) continue;

            pathNodes.push({
                nodeId: node.node_id,
                name: node.node_name,
                latitude: parseFloat(node.latitude),
                longitude: parseFloat(node.longitude),
                building: node.building,
                floor: node.floor
            });

            if (i < result.path.length - 1) {
                const nextNodeId = result.path[i + 1];
                const edge = allEdges.find(e =>
                    (e.from_node_id === nodeId && e.to_node_id === nextNodeId) ||
                    (e.from_node_id === nextNodeId && e.to_node_id === nodeId)
                );

                directions.push({
                    fromNodeId: nodeId,
                    toNodeId: nextNodeId,
                    distance: edge ? edge.distance_meters : 0,
                    instruction: edge?.direction_hint || `Walk towards ${nodeMap[nextNodeId]?.node_name}`
                });
            }
        }

        const totalDistance = Math.round(result.totalDistance);
        const estimatedTime = Math.ceil(totalDistance / 80); // ~80m per min

        return res.status(200).json({
            success: true,
            algorithm: 'A*',
            totalDistanceMeters: totalDistance,
            estimatedWalkTimeMinutes: estimatedTime,
            totalNodesInPath: pathNodes.length,
            path: pathNodes,
            directions
        });

    } catch (error) {
        console.error('❌ A* pathfinding error:', error);
        res.status(500).json({
            error: 'Failed to calculate shortest path: ' + error.message
        });
    }
};

module.exports = { getShortestPathAStar };