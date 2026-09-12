// ============================================================
// HAVERSINE DISTANCE (for A* heuristic)
// ============================================================
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ============================================================
// A* ALGORITHM
// Returns: { path: [nodeIds], totalDistance: number }
// ============================================================
function aStar(graph, nodeMap, src, dest) {
    const openSet = new Set([src]);
    const closedSet = new Set();

    const gScore = {};
    const fScore = {};
    const cameFrom = {};

    // Initialize
    Object.keys(nodeMap).forEach(id => {
        gScore[id] = Infinity;
        fScore[id] = Infinity;
        cameFrom[id] = null;
    });

    gScore[src] = 0;
    fScore[src] = haversineDistance(
        nodeMap[src].latitude, nodeMap[src].longitude,
        nodeMap[dest].latitude, nodeMap[dest].longitude
    );

    while (openSet.size > 0) {
        // Pick node with lowest fScore
        let current = null;
        let lowestF = Infinity;
        for (const id of openSet) {
            if (fScore[id] < lowestF) {
                lowestF = fScore[id];
                current = id;
            }
        }

        if (current === dest) {
            // Reconstruct path
            const path = [];
            let node = current;
            while (node !== null) {
                path.unshift(parseInt(node));
                node = cameFrom[node];
            }
            return { path, totalDistance: gScore[dest] };
        }

        openSet.delete(current);
        closedSet.add(current);

        const neighbors = graph[current] || [];
        for (const neighbor of neighbors) {
            const neighborId = neighbor.node;
            if (closedSet.has(neighborId)) continue;

            const tentativeG = gScore[current] + neighbor.weight;

            if (!openSet.has(neighborId)) {
                openSet.add(neighborId);
            } else if (tentativeG >= gScore[neighborId]) {
                continue;
            }

            cameFrom[neighborId] = current;
            gScore[neighborId] = tentativeG;
            fScore[neighborId] = tentativeG + haversineDistance(
                nodeMap[neighborId].latitude, nodeMap[neighborId].longitude,
                nodeMap[dest].latitude, nodeMap[dest].longitude
            );
        }
    }

    return { path: [], totalDistance: 0 };
}

module.exports = { aStar, haversineDistance };