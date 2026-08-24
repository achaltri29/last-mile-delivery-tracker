const User = require('../models/User');

class AutoAssignmentService {
  /**
   * Calculates distance between two points in km using the Haversine formula.
   */
  static getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Run the deterministic auto-assignment algorithm for an order.
   * @param {object} order Mongoose order document
   * @returns {Promise<object|null>} The assigned Agent user document or null if none assigned
   */
  static async assignAgent(order) {
    const pickupZone = order.pickupZone;
    if (!pickupZone) {
      return null;
    }

    // 1. Find all available agents registered in the pickup zone
    const agents = await User.find({
      role: 'agent',
      'agentMetadata.isAvailable': true,
      'agentMetadata.currentZone': pickupZone
    });

    if (agents.length === 0) {
      return null;
    }

    // Determine if coordinates are available for order pickup and for agents
    // Coordinates format: { latitude, longitude } on pickupAddress (optional) and agentMetadata (optional)
    const hasOrderCoords = order.pickupAddress && 
      typeof order.pickupAddress.latitude === 'number' && 
      typeof order.pickupAddress.longitude === 'number';

    // 2. Select agent using deterministic hierarchy
    let selectedAgent = null;

    const agentsWithDistance = agents.map(agent => {
      let distance = null;
      const hasAgentCoords = agent.agentMetadata &&
        typeof agent.agentMetadata.coordinates?.latitude === 'number' &&
        typeof agent.agentMetadata.coordinates?.longitude === 'number';

      if (hasOrderCoords && hasAgentCoords) {
        distance = this.getHaversineDistance(
          order.pickupAddress.latitude,
          order.pickupAddress.longitude,
          agent.agentMetadata.coordinates.latitude,
          agent.agentMetadata.coordinates.longitude
        );
      }
      return { agent, distance };
    });

    const canUseDistance = agentsWithDistance.every(item => item.distance !== null);

    if (canUseDistance && agentsWithDistance.length > 0) {
      // Sort primarily by distance
      agentsWithDistance.sort((a, b) => {
        if (a.distance !== b.distance) {
          return a.distance - b.distance;
        }
        // Workload tie-breaker if distances are equal
        const aWorkload = a.agent.agentMetadata.activeOrderCount || 0;
        const bWorkload = b.agent.agentMetadata.activeOrderCount || 0;
        if (aWorkload !== bWorkload) {
          return aWorkload - bWorkload;
        }
        // Alphabetical tie-breaker on ID if workloads are equal
        return a.agent._id.toString().localeCompare(b.agent._id.toString());
      });
      selectedAgent = agentsWithDistance[0].agent;
    } else {
      // Sort primarily by activeOrderCount, tie-break by ID
      const sortedAgents = [...agents].sort((a, b) => {
        const aWorkload = a.agentMetadata.activeOrderCount || 0;
        const bWorkload = b.agentMetadata.activeOrderCount || 0;
        if (aWorkload !== bWorkload) {
          return aWorkload - bWorkload;
        }
        return a._id.toString().localeCompare(b._id.toString());
      });
      selectedAgent = sortedAgents[0];
    }

    return selectedAgent;
  }
}

module.exports = AutoAssignmentService;
