const { google } = require("googleapis");

const SHEET_NAME = "Festival_Polenta2026";
const MAX_ROWS_PER_RUN = 50;

async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function statusFromResend(data, current) {
  const lastEvent = normalizeStatus(data?.last_event);

  let recebido = current.recebido || "";
  let aberto = current.aberto || "";
  let clicou = current.clicou || "";

  if (["delivered", "opened", "clicked"].includes(lastEvent)) {
    recebido = "Sim";
  }

  if (["opened", "clicked"].includes(lastEvent)) {
    aberto = "Sim";
  }

  if (lastEvent === "clicked") {
    clicou = "Sim";
  }

  if (["bounced", "complained"].includes(lastEvent)) {
    recebido = "Não";
  }

  return {
    recebido,
    aberto,
    clicou,
    lastEvent,
  };
}

async function checkEmailStatus(messageId) {
  const response = await fetch(`https://api.resend.com/emails/${messageId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || JSON.stringify(data));
  }

  return data;
}

async function updateRow(sheets, rowNumber, result) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!P${rowNumber}:R${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[result.recebido, result.aberto, result.clicou]],
    },
  });
}

module.exports = async function handler(req, res) {
  try {
    const sheets = await getSheetsClient();

    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1:S`,
    });

    const rows = sheetResponse.data.values || [];

    let checked = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const details = [];

    for (let i = 1; i < rows.length; i++) {
      if (checked >= MAX_ROWS_PER_RUN) break;

      const row = rows[i];
      const rowNumber = i + 1;

      const recebidoAtual = row[15] || ""; // P
      const abertoAtual = row[16] || ""; // Q
      const clicouAtual = row[17] || ""; // R
      const messageId = row[18] || ""; // S

      if (!messageId) {
        skipped++;
        continue;
      }

      if (recebidoAtual && abertoAtual && clicouAtual) {
        skipped++;
        continue;
      }

      checked++;

      try {
        const data = await checkEmailStatus(messageId);

        const result = statusFromResend(data, {
          recebido: recebidoAtual,
          aberto: abertoAtual,
          clicou: clicouAtual,
        });

        await updateRow(sheets, rowNumber, result);

        updated++;

        details.push({
          row: rowNumber,
          messageId,
          lastEvent: result.lastEvent,
          recebido: result.recebido,
          aberto: result.aberto,
          clicou: result.clicou,
        });
      } catch (error) {
        errors++;

        details.push({
          row: rowNumber,
          messageId,
          error: error.message,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      sheet: SHEET_NAME,
      limit: MAX_ROWS_PER_RUN,
      checked,
      updated,
      skipped,
      errors,
      details,
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro geral:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
      time: new Date().toISOString(),
    });
  }
};