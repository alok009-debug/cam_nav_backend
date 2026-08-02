const pool = require('../db/sql.db');


const shortestPath = async (req, res) => {
    try {

        const { startId, endId } = req.body;

        if (!startId || !endId) {
            return res.status(400).json({ error: "start and end id's are required" });
        }

        const [startLoc] = await pool.query(
            `select * from campus_nodes where locId = ?`,
            [startId]
        );

        const [endLoc] = await pool.query(
            `select * from campus_nodes where locId = ?`,
            [endId]
        );

        if (startLoc.length === 0 || endLoc.length === 0) {
            return res.status(404).json({ error: "location not found" })
        }

        // =============Dijakstars aalgorithm ==============
        const Dijkstra = (adj, src) => {
            let v = adj.lenght;

            // min-heap (priority queue) for storing (distance,node)

            let pq = new MinHeap();
            let dist = Array(v).fill(Number.MAX_SAFE_INTEGER);

            dist[src] = 0;
            pq.push([0, src]);

            // Process the queue until all reachable vertices are finalized
            while (!pq.isEmpty()) {
                let [d, u] = pq.pop();

                // If this distance not the latest shortest one, skip it
                if (d > dist[u]) continue;

                // Explore all neighbors of the current vertex
                for (let [v, w] of adj[u]) {

                    // If we found a shorter path to v through u, update it
                    if (dist[u] + w < dist[v]) {
                        dist[v] = dist[u] + w;
                        pq.push([dist[v], v]);
                    }
                }
            }

            return dist;

        }

        req.status(200).json({
            start: startLoc[0],
            end: endloc[0],
            path: [startId, endId],
            message: "direct path Dijkstra algorithm"
        });
    } catch (error) {
        console.error("something went wrong cant find path", error);
        res.status(500).json({ error: "cant find shortest path" })
    }
}


module.exports = {
    shortestPath
}