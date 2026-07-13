import { createHash, randomInt } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REQUIRED_COLUMNS = ["Ticket Number", "Order ID", "Buyer Name", "Buyer Email", "Buyer Phone"];

export function parseCsv(text) {
  const input = String(text).replace(/^\uFEFF/, "");
  if (!input.trim()) throw new Error("The CSV file is empty.");

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (character === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    field += character;
  }

  if (inQuotes) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (rows.length < 2) throw new Error("The CSV contains no eligible ticket rows.");
  return rows;
}

export function readEligibleEntries(csvText) {
  const rows = parseCsv(csvText);
  const headers = rows.shift().map((header) => header.trim());
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headerIndex.has(column));
  if (missingColumns.length > 0) {
    throw new Error(`The CSV is missing required columns: ${missingColumns.join(", ")}.`);
  }

  const tickets = rows.map((values, rowIndex) => {
    const get = (column) => String(values[headerIndex.get(column)] ?? "").trim();
    const ticketNumber = get("Ticket Number");
    if (!/^\d{4}$/.test(ticketNumber) || Number(ticketNumber) <= 0) {
      throw new Error(`Row ${rowIndex + 2} has a blank or malformed ticket number: ${ticketNumber || "(blank)"}.`);
    }

    const orderId = get("Order ID");
    const buyerName = get("Buyer Name");
    const buyerEmail = get("Buyer Email");
    if (!orderId || !buyerName || !buyerEmail) {
      throw new Error(`Row ${rowIndex + 2} is missing an order ID, buyer name, or buyer email.`);
    }

    return {
      ticketNumber,
      orderId,
      buyerName,
      buyerEmail,
      buyerPhone: get("Buyer Phone"),
      package: get("Package"),
      amountPaid: Number(get("Amount Paid")) || 0,
      paymentConfirmedAt: get("Payment Confirmed At"),
    };
  });

  const seenTickets = new Set();
  for (const entry of tickets) {
    if (seenTickets.has(entry.ticketNumber)) {
      throw new Error(`Duplicate ticket number found: ${entry.ticketNumber}.`);
    }
    seenTickets.add(entry.ticketNumber);
  }

  return tickets.sort((left, right) => Number(left.ticketNumber) - Number(right.ticketNumber));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function chooseWinner(entries, index = randomInt(0, entries.length)) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("There are no eligible tickets to draw.");
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) throw new Error("The winner index is invalid.");
  return entries[index];
}

function totalConfirmedSales(entries) {
  const orderTotals = new Map();
  for (const entry of entries) {
    if (!orderTotals.has(entry.orderId)) orderTotals.set(entry.orderId, entry.amountPaid);
  }
  return [...orderTotals.values()].reduce((total, amount) => total + amount, 0);
}

export function buildDrawReport({ entries, winner, sourceFile, sourceFileHash, drawnAt = new Date().toISOString() }) {
  const confirmedSales = totalConfirmedSales(entries);
  return {
    drawRunAt: drawnAt,
    sourceFile,
    sourceFileHash,
    totalEligibleTickets: entries.length,
    totalConfirmedSales: confirmedSales,
    winnerPrize: Math.round(confirmedSales * 0.5 * 100) / 100,
    winner: {
      ticketNumber: winner.ticketNumber,
      orderId: winner.orderId,
      buyerName: winner.buyerName,
      buyerEmail: winner.buyerEmail,
      buyerPhone: winner.buyerPhone,
    },
  };
}

export async function runDraw(sourcePath, reportDirectory = path.resolve("draw-reports")) {
  const sourceBuffer = await readFile(sourcePath);
  const sourceText = sourceBuffer.toString("utf8");
  const entries = readEligibleEntries(sourceText);
  const winner = chooseWinner(entries);
  const report = buildDrawReport({
    entries,
    winner,
    sourceFile: path.resolve(sourcePath),
    sourceFileHash: sha256(sourceBuffer),
  });

  await mkdir(reportDirectory, { recursive: true });
  const timestamp = report.drawRunAt.replace(/[:.]/g, "-");
  const reportPath = path.resolve(reportDirectory, `draw-report-${timestamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return { report, reportPath };
}

async function cli() {
  const args = process.argv.slice(2);
  const sourcePath = args[0];
  if (!sourcePath || sourcePath.startsWith("-")) {
    throw new Error("Usage: npm run draw -- ./path/to/draw-entries.csv [--report-dir ./draw-reports]");
  }

  const reportFlagIndex = args.indexOf("--report-dir");
  const reportDirectory = reportFlagIndex >= 0 && args[reportFlagIndex + 1]
    ? path.resolve(args[reportFlagIndex + 1])
    : path.resolve("draw-reports");
  const { report, reportPath } = await runDraw(path.resolve(sourcePath), reportDirectory);

  console.log("Wedding 50/50 draw complete");
  console.log(`Winning ticket: ${report.winner.ticketNumber}`);
  console.log(`Order ID: ${report.winner.orderId}`);
  console.log(`Buyer name: ${report.winner.buyerName}`);
  console.log(`Buyer email: ${report.winner.buyerEmail}`);
  console.log(`Buyer phone: ${report.winner.buyerPhone || "(not provided)"}`);
  console.log(`Total eligible tickets: ${report.totalEligibleTickets}`);
  console.log(`Source file SHA-256: ${report.sourceFileHash}`);
  console.log(`Draw report: ${reportPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    console.error(`Draw failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
