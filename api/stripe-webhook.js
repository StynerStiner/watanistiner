const Stripe = require('stripe');
const { google } = require('googleapis');

function getCredentials() {
  const raw = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf8');
  return JSON.parse(raw);
}

async function getGoogleSheetsClient() {
  const creds = getCredentials();

  const auth = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

async function updatePaymentStatus(sheets, sheetName, applicationId, stripeSessionId) {
  // Get all rows to find the one with this application ID
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:W`,
  });

  const rows = response.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === applicationId) { // Column C = Application ID
      // Update Payment Status (column V = index 21) and Stripe Session ID (column W = index 22)
      const rowNumber = i + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!V${rowNumber}:W${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Paid', stripeSessionId]],
        },
      });
      return true;
    }
  }
  return false;
}

// Vercel requires raw body for webhook signature verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const applicationId = session.metadata.application_id;
      const category = session.metadata.category;
      const stripeSessionId = session.id;

      if (applicationId && category) {
        const sheets = await getGoogleSheetsClient();

        // Update both the All Submissions tab and the category tab
        await updatePaymentStatus(sheets, 'All Submissions', applicationId, stripeSessionId);
        await updatePaymentStatus(sheets, category, applicationId, stripeSessionId);
      }
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
