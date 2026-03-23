const Stripe = require('stripe');
const { google } = require('googleapis');

// Grant configuration
const GRANT_CONFIG = {
  'The Watani Fund ($15 fee)': { fee: 1500, category: 'Entrepreneurship', name: 'The Watani Fund' },
  'The Stiner Legacy Grant ($10 fee)': { fee: 1000, category: 'Entrepreneurship', name: 'The Stiner Legacy Grant' },
  'The Liberation Builders Grant ($15 fee)': { fee: 1500, category: 'Entrepreneurship', name: 'The Liberation Builders Grant' },
  'The Watani Freedom Fund ($10 fee)': { fee: 1000, category: 'Movement & Activism', name: 'The Watani Freedom Fund' },
  'The COINTELPRO Survivors Grant ($15 fee)': { fee: 1500, category: 'Movement & Activism', name: 'The COINTELPRO Survivors Grant' },
  'The Watani Stiner Scholarship ($10 fee)': { fee: 1000, category: 'Education', name: 'The Watani Stiner Scholarship' },
};

// Required fields
const REQUIRED_FIELDS = ['firstName', 'lastName', 'email', 'streetAddress', 'city', 'state', 'zipCode', 'grant', 'whyApplying'];

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateApplicationId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  return `WSG-${year}-${month}-${random}`;
}

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

async function appendToSheet(sheets, sheetName, row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:W`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

async function ensureHeaders(sheets, sheetName) {
  const headers = [
    'Timestamp', 'Month', 'Application ID', 'Grant Name', 'Category',
    'First Name', 'Last Name', 'Email', 'Phone', 'Street Address',
    'City', 'State', 'Zip Code', 'Why Applying', 'Mission or Project',
    'Community Impact', 'Prior Funding', 'Prior Funding Details',
    'How Heard', 'Additional Notes', 'Fee Amount', 'Payment Status', 'Stripe Session ID'
  ];

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${sheetName}!A1:W1`,
    });
    if (!response.data.values || response.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!A1:W1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers] },
      });
    }
  } catch (e) {
    // If sheet tab doesn't exist or is empty, write headers
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${sheetName}!A1:W1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });
  }
}

module.exports = async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  if (origin && !origin.includes('watanistiner.com') && !origin.includes('localhost')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;

    // Honeypot check
    if (data.honeypot) {
      return res.status(200).json({ url: 'https://www.watanistiner.com/thank-you' });
    }

    // Validate required fields
    for (const field of REQUIRED_FIELDS) {
      if (!data[field] || !data[field].trim()) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    // Validate email
    if (!validateEmail(data.email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Validate grant
    const grantConfig = GRANT_CONFIG[data.grant];
    if (!grantConfig) {
      return res.status(400).json({ error: 'Invalid grant selection' });
    }

    // Validate text lengths
    if (data.whyApplying && data.whyApplying.length > 3000) {
      return res.status(400).json({ error: 'Essay exceeds maximum length' });
    }

    // Generate application ID and timestamp
    const applicationId = generateApplicationId();
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const month = now.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' });
    const feeDisplay = `$${grantConfig.fee / 100}`;

    // Build row
    const row = [
      timestamp,
      month,
      applicationId,
      grantConfig.name,
      grantConfig.category,
      data.firstName.trim(),
      data.lastName.trim(),
      data.email.trim(),
      (data.phone || '').trim(),
      data.streetAddress.trim(),
      data.city.trim(),
      data.state.trim(),
      data.zipCode.trim(),
      (data.whyApplying || '').trim(),
      (data.missionOrProject || '').trim(),
      (data.communityImpact || '').trim(),
      (data.priorFunding || '').trim(),
      (data.priorFundingDetails || '').trim(),
      (data.howHeard || '').trim(),
      (data.additionalNotes || '').trim(),
      feeDisplay,
      'Pending',
      '',
    ];

    // Write to Google Sheets
    const sheets = await getGoogleSheetsClient();

    // Ensure headers exist on all tabs
    await ensureHeaders(sheets, 'All Submissions');
    await ensureHeaders(sheets, grantConfig.category);

    // Append to both tabs
    await appendToSheet(sheets, 'All Submissions', row);
    await appendToSheet(sheets, grantConfig.category, row);

    // Forward to FormSubmit (email backup) - fire and forget
    try {
      const formData = new URLSearchParams();
      formData.append('_subject', `New Grant Application — ${grantConfig.name} — ${applicationId}`);
      formData.append('_captcha', 'false');
      formData.append('_template', 'table');
      formData.append('Application ID', applicationId);
      formData.append('Grant', grantConfig.name);
      formData.append('Category', grantConfig.category);
      formData.append('Fee', feeDisplay);
      formData.append('First Name', data.firstName);
      formData.append('Last Name', data.lastName);
      formData.append('Email', data.email);
      formData.append('Phone', data.phone || 'N/A');
      formData.append('Address', `${data.streetAddress}, ${data.city}, ${data.state} ${data.zipCode}`);
      formData.append('Why Applying', data.whyApplying || 'N/A');
      formData.append('Mission or Project', data.missionOrProject || 'N/A');
      formData.append('Community Impact', data.communityImpact || 'N/A');
      formData.append('Prior Funding', data.priorFunding || 'N/A');
      formData.append('Prior Funding Details', data.priorFundingDetails || 'N/A');
      formData.append('How Heard', data.howHeard || 'N/A');
      formData.append('Additional Notes', data.additionalNotes || 'N/A');

      fetch(process.env.FORMSUBMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      }).catch(() => {}); // Don't block on email failure
    } catch (e) {
      // Email is backup — don't fail the whole submission
    }

    // Create Stripe Checkout Session
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Application Fee — ${grantConfig.name}`,
              description: `Non-refundable application processing fee for ${grantConfig.name}. Application ID: ${applicationId}`,
            },
            unit_amount: grantConfig.fee,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `https://www.watanistiner.com/thank-you?paid=true&app_id=${applicationId}`,
      cancel_url: `https://www.watanistiner.com/apply?payment=cancelled`,
      customer_email: data.email.trim(),
      metadata: {
        application_id: applicationId,
        grant_name: grantConfig.name,
        category: grantConfig.category,
        applicant_name: `${data.firstName} ${data.lastName}`,
      },
    });

    return res.status(200).json({ url: session.url, applicationId });

  } catch (error) {
    console.error('Submit error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again or contact grants@watanistiner.com', debug: error.message });
  }
};
