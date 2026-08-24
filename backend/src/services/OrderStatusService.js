const Order = require('../models/Order');
const User = require('../models/User');
const TrackingHistory = require('../models/TrackingHistory');

class OrderStatusService {
  /**
   * Helper to validate status transition logic
   */
  static isValidTransition(current, next, actorRole) {
    // Admin override rules
    if (actorRole === 'admin') {
      // Logical boundaries: Admin cannot alter a Delivered order
      if (current === 'Delivered') {
        return false;
      }
      return true;
    }

    // Standard state transition map
    const transitions = {
      'Pending': ['Pending Assignment', 'Assigned'],
      'Pending Assignment': ['Assigned'],
      'Assigned': ['Picked Up'],
      'Picked Up': ['In Transit'],
      'In Transit': ['Out for Delivery'],
      'Out for Delivery': ['Delivered', 'Failed'],
      'Failed': ['Rescheduled'],
      'Rescheduled': ['Pending Assignment']
    };

    const allowed = transitions[current];
    return allowed ? allowed.includes(next) : false;
  }

  /**
   * Enforce order status change, logs tracking history, attempts, and agent workloads.
   * @param {string} orderId 
   * @param {string} newStatus 
   * @param {object} actor { id, name, role }
   * @param {string} remarks 
   * @param {string} [manualAgentId] For admin manual assignments
   */
  static async changeStatus(orderId, newStatus, actor, remarks = '', manualAgentId = null) {
    const order = await Order.findById(orderId);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    const previousStatus = order.status;

    // 1. Validate status transition
    if (!this.isValidTransition(previousStatus, newStatus, actor.role)) {
      const err = new Error(`Invalid status transition from '${previousStatus}' to '${newStatus}'`);
      err.statusCode = 400;
      throw err;
    }

    let previousAgentId = order.deliveryAgent;
    let targetAgentId = manualAgentId || order.deliveryAgent;

    // If status is Assigned, make sure there is an agent
    if (newStatus === 'Assigned' && !targetAgentId) {
      const err = new Error('Cannot transition status to Assigned without a delivery agent.');
      err.statusCode = 400;
      throw err;
    }

    // 2. Adjust agent workloads
    // Scenario A: Transitioning to Assigned (new or overridden assignment)
    if (newStatus === 'Assigned') {
      // If agent is changing or it's a new assignment
      if (previousStatus !== 'Assigned' || previousAgentId?.toString() !== targetAgentId.toString()) {
        
        // Decrement previous agent (if one existed and order was previously active/assigned)
        if (previousAgentId && ['Assigned', 'Picked Up', 'In Transit', 'Out for Delivery'].includes(previousStatus)) {
          const prevAgent = await User.findById(previousAgentId);
          if (prevAgent && prevAgent.agentMetadata) {
            prevAgent.agentMetadata.activeOrderCount = Math.max(0, (prevAgent.agentMetadata.activeOrderCount || 0) - 1);
            await prevAgent.save();
          }
        }

        // Increment new agent
        const newAgent = await User.findById(targetAgentId);
        if (!newAgent || newAgent.role !== 'agent') {
          const err = new Error('Selected user is not a delivery agent');
          err.statusCode = 400;
          throw err;
        }
        if (newAgent.agentMetadata) {
          newAgent.agentMetadata.activeOrderCount = (newAgent.agentMetadata.activeOrderCount || 0) + 1;
          await newAgent.save();
        }
        order.deliveryAgent = targetAgentId;
      }
    }

    // Scenario B: Transitioning to Delivered or Failed (an active attempt ends)
    if (newStatus === 'Delivered' || newStatus === 'Failed') {
      if (['Assigned', 'Picked Up', 'In Transit', 'Out for Delivery'].includes(previousStatus) && order.deliveryAgent) {
        const agent = await User.findById(order.deliveryAgent);
        if (agent && agent.agentMetadata) {
          agent.agentMetadata.activeOrderCount = Math.max(0, (agent.agentMetadata.activeOrderCount || 0) - 1);
          await agent.save();
        }
      }
      
      // Log physical attempt
      const attemptNum = order.attempts.length + 1;
      order.attempts.push({
        attemptNumber: attemptNum,
        agent: order.deliveryAgent,
        dateTime: new Date(),
        status: newStatus,
        failureRemarks: newStatus === 'Failed' ? remarks : undefined
      });
    }

    // Scenario C: Transitioning to Rescheduled (releasing agent)
    if (newStatus === 'Rescheduled') {
      // Clear assigned agent since the attempt is being rescheduled
      order.deliveryAgent = null;
    }

    // 3. Update order document status
    order.status = newStatus;
    await order.save();

    // 4. Create immutable tracking history log
    await TrackingHistory.create({
      orderId: order._id,
      previousStatus: previousStatus,
      newStatus: newStatus,
      actor: {
        userId: actor.id,
        role: actor.role,
        name: actor.name
      },
      remarks: remarks
    });

    // 5. Trigger notifications (non-blocking)
    const NotificationService = require('./NotificationService');
    NotificationService.notifyStatusChange(order, newStatus).catch(err => {
      console.error('Notification dispatch background error:', err.message);
    });

    return order;
  }
}

module.exports = OrderStatusService;
