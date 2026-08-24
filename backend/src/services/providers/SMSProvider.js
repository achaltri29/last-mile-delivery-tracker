const https = require('https');

class SMSProvider {
  static async send(to, text) {
    const apiKey = process.env.FAST2SMS_API_KEY;

    if (apiKey) {
      return new Promise((resolve) => {
        // Fast2SMS expects 10-digit Indian numbers. Strip +91 or any extra characters.
        const cleanNumber = to.replace(/[^0-9]/g, '').slice(-10);

        const payload = JSON.stringify({
          route: 'q',
          message: text,
          language: 'english',
          flash: 0,
          numbers: cleanNumber
        });

        const options = {
          hostname: 'www.fast2sms.com',
          path: '/dev/bulkV2',
          method: 'POST',
          headers: {
            'authorization': apiKey,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 10000 // 10 seconds timeout
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.return === true) {
                console.log(`[SMS Sent] Fast2SMS Request ID: ${result.request_id}`);
                resolve({ success: true, requestId: result.request_id });
              } else {
                console.error('Fast2SMS API Error:', result.message || data);
                resolve({ success: false, error: result.message || 'API returned failure status' });
              }
            } catch (err) {
              console.error('Fast2SMS Malformed Response Error:', data);
              resolve({ success: false, error: 'Malformed API response JSON' });
            }
          });
        });

        req.on('timeout', () => {
          req.destroy();
          console.error('Fast2SMS Network Error: Request timed out');
          resolve({ success: false, error: 'Request timed out' });
        });

        req.on('error', (err) => {
          console.error('Fast2SMS Network Error:', err.message);
          resolve({ success: false, error: err.message });
        });

        req.write(payload);
        req.end();
      });
    } else {
      // Fallback: log to console
      console.log(`[SMS Sent Mock] To: ${to} | Body: ${text}`);
      return { success: true, mock: true };
    }
  }
}

module.exports = SMSProvider;
