const { google } = require("googleapis");

const CAMPAIGN_SHEETS = String(
  process.env.CAMPAIGN_SHEETS || ""
)
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

async function findMessageRow(sheets, emailId) {
  for (const sheetName of CAMPAIGN_SHEETS) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${sheetName}'!A1:V`,
    });

    const rows = response.data.values || [];

    for (let i = 1; i < rows.length; i++) {
      const messageId = rows[i][18]; // coluna S

      if (messageId === emailId) {
        return {
          sheetName,
          rowNumber: i + 1,
          rows,
        };
      }
    }
  }

  return null;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function calculateLeadScore(recebido, aberto, clicou, clicouWhats) {
  let score = 0;

  if (normalizeText(recebido) === "sim") score += 1;
  if (normalizeText(aberto) === "sim") score += 2;
  if (normalizeText(clicou) === "sim") score += 5;
  if (normalizeText(clicouWhats) === "sim") score += 10;

  return score;
}

function getSegment(score) {
  const value = Number(score || 0);

  if (value >= 15) return "Premium";
  if (value >= 8) return "Quente";
  if (value >= 3) return "Morno";

  return "Frio";
}

async function updateStatusByEvent(
  sheets,
  sheetName,
  rowNumber,
  eventType,
  rows
) {
  const updates = [];

  let recebido = rows[rowNumber - 1][15] || ""; // P Recebido
  let aberto = rows[rowNumber - 1][16] || ""; // Q Aberto
  let clicou = rows[rowNumber - 1][17] || ""; // R Clicou
  let clicouWhats = rows[rowNumber - 1][19] || ""; // T Clicou_whats

  if (eventType === "email.delivered") {
    recebido = "Sim";

    updates.push({
      range: `'${sheetName}'!P${rowNumber}`,
      values: [["Sim"]],
    });
  }

  if (eventType === "email.opened") {
    recebido = "Sim";
    aberto = "Sim";

    updates.push({
      range: `'${sheetName}'!P${rowNumber}`,
      values: [["Sim"]],
    });

    updates.push({
      range: `'${sheetName}'!Q${rowNumber}`,
      values: [["Sim"]],
    });
  }

  if (eventType === "email.clicked") {
    recebido = "Sim";
    aberto = "Sim";
    clicou = "Sim";

    updates.push({
      range: `'${sheetName}'!P${rowNumber}`,
      values: [["Sim"]],
    });

    updates.push({
      range: `'${sheetName}'!Q${rowNumber}`,
      values: [["Sim"]],
    });

    updates.push({
      range: `'${sheetName}'!R${rowNumber}`,
      values: [["Sim"]],
    });
  }

  if (eventType === "email.bounced" || eventType === "email.failed") {
    recebido = "Não";

    updates.push({
      range: `'${sheetName}'!P${rowNumber}`,
      values: [["Não"]],
    });
  }

  const leadScore = calculateLeadScore(recebido, aberto, clicou, clicouWhats);
  const segment = getSegment(leadScore);

  updates.push({
    range: `'${sheetName}'!U${rowNumber}`,
    values: [[leadScore]],
  });

  updates.push({
    range: `'${sheetName}'!V${rowNumber}`,
    values: [[segment]],
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
      return res.status(200).json({
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

const found = await findMessageRow(sheets, emailId);

if (!found) {
  return res.status(200).json({
    ok: true,
    message: "Message_ID não encontrado",
    emailId,
    eventType,
  });
}

const { sheetName, rowNumber, rows } = found;

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
  sheetName,
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