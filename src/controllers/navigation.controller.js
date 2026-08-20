const pool = require('../db/sql.db');

// ============ GET TEXT DIRECTIONS ============
const getTextDirections = async (req, res) => {
  try {
    const { startId, endId } = req.query;
    
    if (!startId || !endId) {
      return res.status(400).json({ 
        error: 'Start and end location IDs are required' 
      });
    }

    console.log(`📍 Finding path from ${startId} to ${endId}`);

    // 1. Get all nodes and edges
    const [nodes] = await pool.query('SELECT * FROM campus_nodes');
    const [edges] = await pool.query('SELECT * FROM campus_edges');

    // 2. Find the actual nodes for start and end
    const startNode = nodes.find(n => n.node_id === parseInt(startId));
    const endNode = nodes.find(n => n.node_id === parseInt(endId));

    if (!startNode || !endNode) {
      return res.status(404).json({ error: 'Location not found in graph' });
    }

    console.log(`📍 Start: ${startNode.node_name} (${startNode.node_id})`);
    console.log(`📍 End: ${endNode.node_name} (${endNode.node_id})`);

    // 3. Build graph
    const graph = buildGraph(edges);
    
    // 4. Find path using BFS
    const path = findPathBFS(graph, parseInt(startId), parseInt(endId));
    
    if (!path || path.length === 0) {
      return res.status(404).json({ 
        error: 'No path found between these locations' 
      });
    }

    console.log('🛤️ Path found:', path);

    // 5. Generate directions
    const directions = generateDirections(path, nodes, edges);

    // 6. Calculate total distance
    const totalDistance = calculateTotalDistance(edges, path);

    res.json({
      success: true,
      path: path,
      directions: directions,
      totalDistance: totalDistance,
      from: startNode.node_name,
      to: endNode.node_name
    });

  } catch (error) {
    console.error('❌ Navigation error:', error);
    res.status(500).json({ error: 'Failed to find path' });
  }
};

// ============ HELPER: Build Graph ============
function buildGraph(edges) {
  const graph = {};
  
  edges.forEach(edge => {
    const { from_node_id, to_node_id, distance_meters } = edge;
    
    if (!graph[from_node_id]) graph[from_node_id] = [];
    if (!graph[to_node_id]) graph[to_node_id] = [];
    
    graph[from_node_id].push({ 
      nodeId: to_node_id, 
      distance: distance_meters 
    });
    graph[to_node_id].push({ 
      nodeId: from_node_id, 
      distance: distance_meters 
    });
  });
  
  return graph;
}

// ============ HELPER: BFS Pathfinding ============
function findPathBFS(graph, startNodeId, endNodeId) {
  const queue = [[startNodeId]];
  const visited = new Set([startNodeId]);
  
  while (queue.length > 0) {
    const path = queue.shift();
    const currentNode = path[path.length - 1];
    
    if (currentNode === endNodeId) {
      return path;
    }
    
    const neighbors = graph[currentNode] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.nodeId)) {
        visited.add(neighbor.nodeId);
        queue.push([...path, neighbor.nodeId]);
      }
    }
  }
  
  return null;
}

// ============ HELPER: Calculate Total Distance ============
function calculateTotalDistance(edges, path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const edge = edges.find(e => 
      (e.from_node_id === path[i] && e.to_node_id === path[i+1]) ||
      (e.from_node_id === path[i+1] && e.to_node_id === path[i])
    );
    if (edge) total += edge.distance_meters;
  }
  return total;
}

// ============ GENERATE TEXT DIRECTIONS ============
function generateDirections(path, nodes, edges) {
  const directions = [];
  
  for (let i = 0; i < path.length; i++) {
    const nodeId = path[i];
    const node = nodes.find(n => n.node_id === nodeId);
    
    if (i === 0) {
      // Start
      directions.push({
        step: i + 1,
        instruction: `📍 Start at ${node.node_name}`,
        node: node.node_name,
        type: 'start'
      });
    } else if (i === path.length - 1) {
      // End
      directions.push({
        step: i + 1,
        instruction: `🏁 Arrive at ${node.node_name}`,
        node: node.node_name,
        type: 'arrive'
      });
    } else {
      // Middle steps - Determine turn direction
      const prevNode = nodes.find(n => n.node_id === path[i-1]);
      const nextNode = nodes.find(n => n.node_id === path[i+1]);
      
      // Find the edge from previous to current
      const edge = edges.find(e => 
        (e.from_node_id === path[i-1] && e.to_node_id === path[i]) ||
        (e.from_node_id === path[i] && e.to_node_id === path[i-1])
      );
      
      // Calculate turn direction based on coordinates
      const turnDirection = calculateTurn(prevNode, node, nextNode);
      const distance = edge ? edge.distance_meters : 0;
      
      directions.push({
        step: i + 1,
        instruction: `${turnDirection} for ${distance}m`,
        node: node.node_name,
        type: turnDirection.toLowerCase().includes('left') ? 'left' : 
              turnDirection.toLowerCase().includes('right') ? 'right' : 'straight',
        distance: distance
      });
    }
  }
  
  return directions;
}

// ============ CALCULATE TURN DIRECTION ============
function calculateTurn(prevNode, currentNode, nextNode) {
  // Calculate vectors
  const v1 = {
    x: currentNode.longitude - prevNode.longitude,
    y: currentNode.latitude - prevNode.latitude
  };
  const v2 = {
    x: nextNode.longitude - currentNode.longitude,
    y: nextNode.latitude - currentNode.latitude
  };
  
  // Calculate cross product
  const cross = v1.x * v2.y - v1.y * v2.x;
  
  // Determine turn direction
  if (Math.abs(cross) < 0.0000001) {
    return '➡️ Go straight';
  } else if (cross > 0) {
    return '↩️ Turn left';
  } else {
    return '↪️ Turn right';
  }
}

module.exports = { getTextDirections };