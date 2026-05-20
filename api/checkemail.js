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

function statusFromResend(data, current) {
  const lastEvent = String(data?.last_event || "").toLowerCase();

  const recebido =
    ["delivered", "opened", "clicked"].includes(lastEvent)
      ? "Sim"
      : current.recebido || "";

  const aberto =
    ["opened", "clicked"].includes(lastEvent)
      ? "Sim"
      : current.aberto || "";

  const clicou =
    lastEvent === "clicked"
      ? "Sim"
      : current.clicou || "";

  return { recebido, aberto, clicou };
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
    let errors = 0;

for (let i = 1; i < Math.min(rows.length, 6); i++) {
          const row = rows[i];
      const rowNumber = i + 1;

      const recebidoAtual = row[15] || ""; // P
      const abertoAtual = row[16] || "";   // Q
      const clicouAtual = row[17] || "";   // R
      const messageId = row[18] || "";     // S

      if (!messageId) continue;

      checked++;

      try {
        const resendResponse = await fetch(
          `https://api.resend.com/emails/${messageId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            },
          }
        );

        const data = await resendResponse.json();

        if (!resendResponse.ok) {
          console.log(`Erro Resend linha ${rowNumber}:`, data);
          errors++;
          continue;
        }

        const result = statusFromResend(data, {
          recebido: recebidoAtual,
          aberto: abertoAtual,
          clicou: clicouAtual,
        });

        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: `'${SHEET_NAME}'!P${rowNumber}:R${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[result.recebido, result.aberto, result.clicou]],
          },
        });

        updated++;
      } catch (error) {
        console.log(`Erro linha ${rowNumber}:`, error.message);
        errors++;
      }
    }

    return res.status(200).json({
      ok: true,
      sheet: SHEET_NAME,
      checked,
      updated,
      errors,
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro geral:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
};