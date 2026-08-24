const EmailProvider = require('./providers/EmailProvider');
const SMSProvider = require('./providers/SMSProvider');
const User = require('../models/User');

class NotificationService {
  /**
   * Dispatches status notifications to the customer bound to the order.
   * @param {object} order Mongoose order document
   * @param {string} newStatus The target status
   */
  static async notifyStatusChange(order, newStatus) {
    try {
      // Resolve customer details if not populated
      let customer = order.customer;
      if (customer && !customer.email) {
        customer = await User.findById(customer);
      }

      if (!customer) {
        console.warn(`[NotificationService] Skipping notifications: customer details not found for order #${order.orderNumber}`);
        return;
      }

      const subject = `Order Update: #${order.orderNumber} - ${newStatus}`;
      const text = `Hello ${customer.name},\n\nYour last-mile delivery order #${order.orderNumber} status has updated to: ${newStatus}.\n\nThank you for choosing Unthinkable Solutions Last-Mile Delivery Tracker.`;

      // Trigger parallel notifications
      const emailPromise = EmailProvider.send(customer.email, subject, text);
      const smsPromise = SMSProvider.send(customer.phone, text);

      const [emailRes, smsRes] = await Promise.all([emailPromise, smsPromise]);
      return { email: emailRes, sms: smsRes };

    } catch (error) {
      console.error('Notification dispatch failed:', error.message);
    }
  }
}

module.exports = NotificationService;
