const { google } = require("googleapis");

const SHEET_NAME = "Festival_Polenta2026";

async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

function findMessageRow(rows, emailId) {
  for (let i = 1; i < rows.length; i++) {
    const messageId = rows[i][18]; // Coluna S
    if (messageId === emailId) return i + 1;
  }
  return null;
}

async function updateStatusByEvent(sheets, rowNumber, eventType) {
  const updates = [];

  if (eventType === "email.delivered") {
    updates.push({ range: `'${SHEET_NAME}'!P${rowNumber}`, values: [["Sim"]] });
  }

  if (eventType === "email.opened") {
    updates.push({ range: `'${SHEET_NAME}'!P${rowNumber}`, values: [["Sim"]] });
    updates.push({ range: `'${SHEET_NAME}'!Q${rowNumber}`, values: [["Sim"]] });
  }

  if (eventType === "email.clicked") {
    updates.push({ range: `'${SHEET_NAME}'!P${rowNumber}`, values: [["Sim"]] });
    updates.push({ range: `'${SHEET_NAME}'!Q${rowNumber}`, values: [["Sim"]] });
    updates.push({ range: `'${SHEET_NAME}'!R${rowNumber}`, values: [["Sim"]] });
  }

  if (eventType === "email.bounced" || eventType === "email.failed") {
    updates.push({ range: `'${SHEET_NAME}'!P${rowNumber}`, values: [["Não"]] });
  }

  if (updates.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates,
    },
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({ ok: true, message: "Resend webhook online" });
    }

    const event = req.body;
    const eventType = event?.type;
    const emailId = event?.data?.email_id;

    if (!eventType || !emailId) {
      return res.status(400).json({ ok: false, error: "Evento inválido" });
    }

    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1:S`,
    });

    const rows = response.data.values || [];
    const rowNumber = findMessageRow(rows, emailId);

    if (!rowNumber) {
      return res.status(200).json({
        ok: true,
        message: "Message_ID não encontrado na planilha",
        emailId,
        eventType,
      });
    }

    await updateStatusByEvent(sheets, rowNumber, eventType);

    return res.status(200).json({
      ok: true,
      eventType,
      emailId,
      rowNumber,
    });
  } catch (error) {
    console.error("Erro webhook Resend:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
};