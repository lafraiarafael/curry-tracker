const { google } = require("googleapis");

const MENU_DINO_URL = "https://currypasta.menudino.com/";

function formatPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function buildRowPhone(row) {
  const ddi = formatPhone(row[2]); // C
  const ddd = formatPhone(row[3]); // D
  const telefone = formatPhone(row[4]); // E

  if (!telefone) return "";

  if (telefone.startsWith("55")) {
    return telefone;
  }

  return `${ddi}${ddd}${telefone}`;
}

async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

async function registerClick({ campaign, phone }) {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'${campaign}'!A1:T`,
  });

  const rows = response.data.values || [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowPhone = buildRowPhone(row);

    if (rowPhone === phone) {
      const rowNumber = i + 1;

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${campaign}'!T${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [["Sim"]],
        },
      });

      console.log(`✅ Clique WhatsApp registrado: ${phone} / ${campaign}`);
      return true;
    }
  }

  console.log(`⚠️ Telefone não encontrado: ${phone} / ${campaign}`);
  return false;
}

module.exports = async function handler(req, res) {
  try {
    const phone = formatPhone(req.query.id);
    const campaign = String(req.query.camp || "Delivery_proprio").trim();

    if (phone && campaign) {
      await registerClick({ campaign, phone });
    }

    return res.redirect(302, MENU_DINO_URL);
  } catch (error) {
    console.error("Erro tracker:", error.message);
    return res.redirect(302, MENU_DINO_URL);
  }
};