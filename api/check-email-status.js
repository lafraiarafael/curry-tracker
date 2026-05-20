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

async function updateSheetRow(sheets, rowNumber, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!P${rowNumber}:R${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [values],
    },
  });
}

module.exports = async function handler(req, res) {
  try {
    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1:S`,
    });

    const rows = response.data.values || [];

    let updated = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      const rowNumber = i + 1;

      const recebido = row[15];
      const aberto = row[16];
      const clicou = row[17];
      const messageId = row[18];

      if (!messageId) continue;

      try {
        const response = await fetch(
          `https://api.resend.com/emails/${messageId}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            },
          }
        );

        const data = await response.json();

        const delivered =
          data?.last_event === "delivered" ? "Sim" : recebido || "Não";

        const opened =
          data?.opens?.length > 0 ? "Sim" : aberto || "Não";

        const clicked =
          data?.clicks?.length > 0 ? "Sim" : clicou || "Não";

        await updateSheetRow(sheets, rowNumber, [
          delivered,
          opened,
          clicked,
        ]);

        updated++;

        console.log(
          `✅ Linha ${rowNumber} atualizada → Recebido:${delivered} Aberto:${opened} Clicou:${clicked}`
        );
      } catch (err) {
        console.error(`❌ Erro linha ${rowNumber}`, err.message);
      }
    }

    return res.status(200).json({
      success: true,
      updated,
    });
  } catch (error) {
    console.error("Erro geral:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};