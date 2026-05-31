const { google } = require("googleapis");

const CAMPAIGN_SHEETS = String(process.env.CAMPAIGN_SHEETS || "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

if (!process.env.SPREADSHEET_ID) {
  throw new Error("SPREADSHEET_ID não definido");
}

if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
  throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL não definido");
}

if (!process.env.GOOGLE_PRIVATE_KEY) {
  throw new Error("GOOGLE_PRIVATE_KEY não definido");
}

if (CAMPAIGN_SHEETS.length === 0) {
  throw new Error("CAMPAIGN_SHEETS não definido ou vazio");
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

function createSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

function splitArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function updateSheetSegments(sheets, sheetName) {
  console.log(`Atualizando segmentação na planilha: ${sheetName}`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'${sheetName}'!A1:V`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log(`  Nenhuma linha de dados encontrada em ${sheetName}`);
    return { updatedRows: 0, skippedRows: 0 };
  }

  const updates = [];
  let updatedRows = 0;
  let skippedRows = 0;

  for (let i = 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const row = rows[i];
    const recebido = row[15] || "";
    const aberto = row[16] || "";
    const clicou = row[17] || "";
    const clicouWhats = row[19] || "";
    const expectedScore = calculateLeadScore(recebido, aberto, clicou, clicouWhats);
    const expectedSegment = getSegment(expectedScore);
    const currentScore = row[20] || "";
    const currentSegment = row[21] || "";

    if (
      String(currentScore).trim() !== String(expectedScore).trim() ||
      String(currentSegment).trim().toLowerCase() !== String(expectedSegment).trim().toLowerCase()
    ) {
      updates.push({
        range: `'${sheetName}'!U${rowNumber}:V${rowNumber}`,
        values: [[expectedScore, expectedSegment]],
      });
      updatedRows += 1;
    } else {
      skippedRows += 1;
    }
  }

  if (updates.length > 0) {
    const batches = splitArray(updates, 100);

    for (const batch of batches) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: process.env.SPREADSHEET_ID,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: batch,
        },
      });
    }
  }

  return { updatedRows, skippedRows };
}

async function main() {
  const sheets = createSheetsClient();
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const sheetName of CAMPAIGN_SHEETS) {
    const result = await updateSheetSegments(sheets, sheetName);
    totalUpdated += result.updatedRows;
    totalSkipped += result.skippedRows;
  }

  console.log(`\nProcesso concluído.`);
  console.log(`Linhas atualizadas: ${totalUpdated}`);
  console.log(`Linhas já corretas: ${totalSkipped}`);
}

main().catch((error) => {
  console.error("Erro ao recalcular segmentação:", error);
  process.exit(1);
});
