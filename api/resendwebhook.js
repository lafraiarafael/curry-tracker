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

    if (messageId === emailId) {
      return i + 1;
    }
  }

  return null;
}

function calculateLeadScore(recebido, aberto, clicou, clicouWhats) {
  let score = 0;

  if (String(recebido || "").toLowerCase() === "sim") {
    score += 1;
  }

  if (String(aberto || "").toLowerCase() === "sim") {
    score += 2;
  }

  if (String(clicou || "").toLowerCase() === "sim") {
    score += 5;
  }

  if (String(clicouWhats || "").toLowerCase() === "sim") {
    score += 10;
  }

  return score;
}

async function updateStatusByEvent(
  sheets,
  rowNumber,
  eventType,
  rows
) {
  const updates = [];

  let recebido = rows[rowNumber - 1][15] || ""; // P
  let aberto = rows[rowNumber - 1][16] || ""; // Q
  let clicou = rows[rowNumber - 1][17] || ""; // R
  let clicouWhats = rows[rowNumber - 1][19] || ""; // T

  if (eventType === "email.delivered") {
    recebido = "Sim";

    updates.push({
      range: `'${SHEET_NAME}'!P${rowNumber}`,
      values: [["Sim"]],
    });
  }

  if (eventType === "email.opened") {
    recebido = "Sim";
    aberto = "Sim";

    updates.push({
      range: `'${SHEET_NAME}'!P${rowNumber}`,
      values: [["Sim"]],
    });

    updates.push({
      range: `'${SHEET_NAME}'!Q${rowNumber}`,
      values: [["Sim"]],
    });
  }

  if (eventType === "email.clicked") {
    recebido = "Sim";
    aberto = "Sim";
    clicou = "Sim";

    updates.push({
      range: `'${SHEET_NAME}'!P${rowNumber}`,
      values: [["Sim"]],
    });

    updates.push({
      range: `'${SHEET_NAME}'!Q${rowNumber}`,
      values: [["Sim"]],
    });

    updates.push({
      range: `'${SHEET_NAME}'!R${rowNumber}`,
      values: [["Sim"]],
    });
  }

  if (
    eventType === "email.bounced" ||
    eventType === "email.failed"
  ) {
    recebido = "Não";

    updates.push({
      range: `'${SHEET_NAME}'!P${rowNumber}`,
      values: [["Não"]],
    });
  }

  const leadScore = calculateLeadScore(
    recebido,
    aberto,
    clicou,
    clicouWhats
  );

  updates.push({
    range: `'${SHEET_NAME}'!U${rowNumber}`,
    values: [[leadScore]],
  });

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
      return res
        .status(200)
        .json({
          ok: true,
          message: "Resend webhook online",
        });
    }

    const event = req.body;

    const eventType = event?.type;
    const emailId = event?.data?.email_id;

    if (!eventType || !emailId) {
      return res.status(400).json({
        ok: false,
        error: "Evento inválido",
      });
    }

    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1:U`,
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

    await updateStatusByEvent(
      sheets,
      rowNumber,
      eventType,
      rows
    );

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