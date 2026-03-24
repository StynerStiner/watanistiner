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

// Grant row colors (subtle tints for visual identification)
const GRANT_COLORS = {
  'The Watani Fund':              { red: 0.85, green: 0.92, blue: 1.0 },   // light blue
  'The Stiner Legacy Grant':      { red: 0.85, green: 1.0,  blue: 0.88 },  // light green
  'The Liberation Builders Grant':{ red: 1.0,  green: 0.95, blue: 0.8 },   // light gold
  'The Watani Freedom Fund':      { red: 0.9,  green: 0.87, blue: 1.0 },   // light purple
  'The COINTELPRO Survivors Grant':{ red: 1.0, green: 0.88, blue: 0.85 },  // light coral
  'The Watani Stiner Scholarship':{ red: 0.88, green: 0.97, blue: 0.95 },  // light teal
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

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function getSheetId(sheets, sheetName) {
  const resp = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
  });
  const sheet = resp.data.sheets.find(s => s.properties.title === sheetName);
  return sheet ? sheet.properties.sheetId : null;
}

async function insertMonthDivider(sheets, sheetName, month) {
  const sheetId = await getSheetId(sheets, sheetName);
  if (sheetId === null) return;

  // Get current data to find the last row
  const dataResp = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:A`,
  });
  const lastRow = (dataResp.data.values || []).length;

  // Append divider row
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:W`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[`── ${month.toUpperCase()} ──`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']],
    },
  });

  // Format the divider row with a dark background
  const dividerRow = lastRow; // 0-indexed
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dividerRow,
              endRowIndex: dividerRow + 1,
              startColumnIndex: 0,
              endColumnIndex: 23,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.15, green: 0.15, blue: 0.15 },
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                  fontSize: 11,
                },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: dividerRow,
              endIndex: dividerRow + 1,
            },
            properties: { pixelSize: 36 },
            fields: 'pixelSize',
          },
        },
      ],
    },
  });
}

async function shouldInsertDivider(sheets, sheetName, currentMonth) {
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${sheetName}!B:B`,
    });
    const values = resp.data.values || [];
    if (values.length <= 1) return true; // Only header row, first entry ever

    // Find the last non-divider, non-empty month value
    for (let i = values.length - 1; i >= 1; i--) {
      const val = (values[i][0] || '').trim();
      if (val && !val.startsWith('──')) {
        return val !== currentMonth;
      }
    }
    return true; // No previous entries found
  } catch (e) {
    return false;
  }
}

// Define the sort order for grants within a month
const GRANT_SORT_ORDER = {
  'The Watani Fund': 1,
  'The Stiner Legacy Grant': 2,
  'The Liberation Builders Grant': 3,
  'The Watani Freedom Fund': 4,
  'The COINTELPRO Survivors Grant': 5,
  'The Watani Stiner Scholarship': 6,
};

async function appendToSheet(sheets, sheetName, row, month, grantName) {
  // Check if we need a month divider
  const needsDivider = await shouldInsertDivider(sheets, sheetName, month);
  if (needsDivider) {
    await insertMonthDivider(sheets, sheetName, month);
  }

  // Append the new row
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:W`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  // Now re-sort the current month's rows by grant name and re-color them
  await sortAndColorCurrentMonth(sheets, sheetName, month);
}

async function sortAndColorCurrentMonth(sheets, sheetName, currentMonth) {
  const sheetId = await getSheetId(sheets, sheetName);
  if (sheetId === null) return;

  // Get all data
  const dataResp = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:W`,
  });
  const allRows = dataResp.data.values || [];
  if (allRows.length <= 1) return; // Only header

  // Find the start of the current month (the divider row)
  let monthStartIndex = -1;
  for (let i = allRows.length - 1; i >= 1; i--) {
    const cellA = (allRows[i][0] || '').trim();
    if (cellA.startsWith('──') && cellA.toUpperCase().includes(currentMonth.toUpperCase())) {
      monthStartIndex = i;
      break;
    }
  }

  if (monthStartIndex === -1) return; // No divider found

  // Collect data rows after the divider (until end of sheet or next divider)
  const dataRows = [];
  for (let i = monthStartIndex + 1; i < allRows.length; i++) {
    const cellA = (allRows[i][0] || '').trim();
    if (cellA.startsWith('──')) break; // Next month divider
    dataRows.push({ index: i, data: allRows[i] });
  }

  if (dataRows.length <= 1) {
    // Only one row, just color it
    if (dataRows.length === 1) {
      const grantName = dataRows[0].data[3] || ''; // Column D = Grant Name
      const color = GRANT_COLORS[grantName];
      if (color) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          requestBody: {
            requests: [{
              repeatCell: {
                range: { sheetId, startRowIndex: dataRows[0].index, endRowIndex: dataRows[0].index + 1, startColumnIndex: 0, endColumnIndex: 23 },
                cell: { userEnteredFormat: { backgroundColor: color, wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
                fields: 'userEnteredFormat(backgroundColor,wrapStrategy,verticalAlignment)',
              },
            }],
          },
        });
      }
    }
    return;
  }

  // Sort data rows by grant name
  dataRows.sort((a, b) => {
    const orderA = GRANT_SORT_ORDER[a.data[3]] || 99;
    const orderB = GRANT_SORT_ORDER[b.data[3]] || 99;
    return orderA - orderB;
  });

  // Write sorted rows back
  const sortedValues = dataRows.map(r => r.data);
  const startRow = monthStartIndex + 2; // 1-indexed, after divider
  const endRow = startRow + sortedValues.length - 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A${startRow}:W${endRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: sortedValues },
  });

  // Re-color all rows
  const colorRequests = [];
  for (let i = 0; i < sortedValues.length; i++) {
    const grantName = sortedValues[i][3] || '';
    const color = GRANT_COLORS[grantName];
    if (color) {
      colorRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: monthStartIndex + 1 + i, endRowIndex: monthStartIndex + 2 + i, startColumnIndex: 0, endColumnIndex: 23 },
          cell: { userEnteredFormat: { backgroundColor: color, wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
          fields: 'userEnteredFormat(backgroundColor,wrapStrategy,verticalAlignment)',
        },
      });
    }
  }

  if (colorRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      requestBody: { requests: colorRequests },
    });
  }
}

async function ensureHeaders(sheets, sheetName) {
  const headers = [
    'Timestamp', 'Month', 'Application ID', 'Grant Name', 'Category',
    'First Name', 'Last Name', 'Email', 'Phone', 'Street Address',
    'City', 'State', 'Zip Code', 'Why Applying', 'Mission or Project',
    'Community Impact', 'Prior Funding', 'Prior Funding Details',
    'How Heard', 'Additional Notes', 'Fee Amount', 'Payment Status', 'Stripe Session ID'
  ];

  let needsSetup = false;
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${sheetName}!A1:W1`,
    });
    if (!response.data.values || response.data.values.length === 0) {
      needsSetup = true;
    }
  } catch (e) {
    needsSetup = true;
  }

  if (needsSetup) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${sheetName}!A1:W1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });

    // Format the sheet: text wrapping + column widths
    const sheetId = await getSheetId(sheets, sheetName);
    if (sheetId !== null) {
      // Column widths: narrower for short fields, wider for essays
      // A=Timestamp, B=Month, C=AppID, D=Grant, E=Category, F=First, G=Last,
      // H=Email, I=Phone, J=Address, K=City, L=State, M=Zip,
      // N=Why Applying, O=Mission, P=Community Impact,
      // Q=Prior Funding, R=Prior Details, S=How Heard, T=Notes,
      // U=Fee, V=Payment Status, W=Stripe Session
      const columnWidths = [
        140, 110, 130, 180, 130, 100, 100,
        180, 110, 160, 100, 60, 70,
        300, 300, 300,
        90, 180, 120, 250,
        70, 100, 200
      ];

      const requests = [];

      // Set text wrapping on ALL cells
      requests.push({
        repeatCell: {
          range: { sheetId: sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 23 },
          cell: {
            userEnteredFormat: {
              wrapStrategy: 'WRAP',
              verticalAlignment: 'TOP',
            },
          },
          fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)',
        },
      });

      // Set column widths
      columnWidths.forEach((width, i) => {
        requests.push({
          updateDimensionProperties: {
            range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
            properties: { pixelSize: width },
            fields: 'pixelSize',
          },
        });
      });

      // Bold + freeze header row
      requests.push({
        repeatCell: {
          range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 23 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
              wrapStrategy: 'WRAP',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)',
        },
      });
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
        },
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        requestBody: { requests },
      });
    }
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

    // Append to both tabs (with month dividers + grant colors)
    await appendToSheet(sheets, 'All Submissions', row, month, grantConfig.name);
    await appendToSheet(sheets, grantConfig.category, row, month, grantConfig.name);

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
    return res.status(500).json({ error: 'Something went wrong. Please try again or contact grants@watanistiner.com' });
  }
};
