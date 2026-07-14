/**
 * Private Google Sheets backend for Ben and Tori's wedding 50/50.
 * Included orders become individual private jar rows and printable name slips.
 */

const SHEET_NAMES = Object.freeze({
  ORDERS: "Orders",
  SUMMARY: "Summary",
  JAR_ENTRIES: "Jar Entries",
  PRINTABLE_SLIPS: "Printable Jar Slips",
});

const ORDER_HEADERS = [
  "Submitted At",
  "Internal Order ID",
  "Name for Jar",
  "Email",
  "Phone",
  "E-transfer Name",
  "Entry Count",
  "Amount Due",
  "Message",
  "Entry Status",
  "Payment Received",
  "Payment Received At",
  "Payment Instructions Sent",
  "Notes",
];

const LEGACY_ORDER_HEADERS = [
  "Submitted At",
  "Internal Order ID",
  "Name for Jar",
  "Email",
  "Phone",
  "E-transfer Name",
  "Entry Count",
  "Amount Due",
  "Message",
  "Payment Status",
  "Payment Confirmed At",
  "Payment Instructions Sent",
  "Paid Confirmation Sent",
  "Notes",
];

const JAR_ENTRY_HEADERS = [
  "Jar Name",
  "Internal Order ID",
  "Buyer Email",
  "Buyer Phone",
  "Submitted At",
  "Entry Position",
];

const ENTRY_STATUSES = Object.freeze(["Included", "Cancelled", "Refunded"]);
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

const SITE_CONFIG = Object.freeze({
  eTransferAddress: "torigabriellerivard@hotmail.com",
  salesClosingDate: "2026-08-15T18:00:00-04:00",
  drawDate: "2026-08-15T20:00:00-04:00",
  publicWebsiteUrl: "https://benthompsondev.github.io/wedding-50-50/",
  weddingWebsiteUrl: "https://withjoy.com/tori-rivard-and-ben",
  timezone: "America/Toronto",
});

const ORDER_COLUMN = Object.freeze({
  submittedAt: 1,
  internalOrderId: 2,
  jarName: 3,
  email: 4,
  phone: 5,
  eTransferName: 6,
  entryCount: 7,
  amountDue: 8,
  message: 9,
  entryStatus: 10,
  paymentReceived: 11,
  paymentReceivedAt: 12,
  paymentInstructionsSent: 13,
  notes: 14,
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Wedding Draw")
    .addItem("Refresh Everything", "refreshEverything")
    .addSeparator()
    .addItem("Mark Selected Entry Cancelled", "markSelectedEntryCancelled")
    .addItem("Mark Selected Entry Refunded", "markSelectedEntryRefunded")
    .addItem("Re-send E-transfer Details", "resendPaymentInstructions")
    .addSeparator()
    .addItem("Create Jar Snapshot", "createJarSnapshot")
    .addItem("Create Printable Jar Slips", "createPrintableJarSlips")
    .addToUi();
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAMES.ORDERS || e.range.getRow() <= 1 || e.range.getNumRows() !== 1) return;

  const column = e.range.getColumn();
  if (column !== ORDER_COLUMN.entryStatus && column !== ORDER_COLUMN.paymentReceived) return;

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(10000);
    locked = true;
    if (column === ORDER_COLUMN.paymentReceived) {
      const received = isCheckedValue_(e.range.getValue());
      const timestampCell = sheet.getRange(e.range.getRow(), ORDER_COLUMN.paymentReceivedAt);
      if (received && !timestampCell.getValue()) timestampCell.setValue(new Date());
      if (!received) timestampCell.clearContent();
      refreshSummary_();
    } else {
      const status = String(e.range.getValue() || "").trim();
      if (!ENTRY_STATUSES.includes(status)) return;
      refreshEverything_();
    }
    SpreadsheetApp.flush();
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    lock.waitLock(10000);
    locked = true;
    const now = new Date();
    const payload = validateSubmission_(parseRequest_(e), now);
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    const existingRecords = getOrderRecords_(ordersSheet);
    const duplicate = findRecentDuplicate_(existingRecords, payload, now, DUPLICATE_WINDOW_MS);

    if (duplicate) {
      return jsonResponse_({
        ok: true,
        duplicate: true,
        entryCount: Number(duplicate.entryCount),
        amountDue: Number(duplicate.amountDue),
        paymentInstructionsSent: isYesValue_(duplicate.paymentInstructionsSent),
      });
    }

    if (internalOrderIdExists_(ordersSheet, payload.internalOrderId)) {
      throw new Error("This request has already been received. Please check your email for the payment details.");
    }

    ordersSheet.appendRow([
      now,
      safeCellText_(payload.internalOrderId),
      safeCellText_(payload.jarName),
      safeCellText_(payload.email),
      safeCellText_(payload.phone),
      safeCellText_(payload.eTransferName),
      payload.entryCount,
      payload.amountDue,
      safeCellText_(payload.message),
      "Included",
      false,
      "",
      "No",
      "",
    ]);

    const rowNumber = ordersSheet.getLastRow();
    let instructionsSent = false;
    try {
      sendPaymentInstructionsEmail_(payload);
      instructionsSent = true;
      ordersSheet.getRange(rowNumber, ORDER_COLUMN.paymentInstructionsSent).setValue("Yes");
    } catch (emailError) {
      addOrderNote_(ordersSheet, rowNumber, `E-transfer details email failed: ${publicErrorMessage_(emailError)}`);
    }

    refreshEverything_();
    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      entryCount: payload.entryCount,
      amountDue: payload.amountDue,
      paymentInstructionsSent: instructionsSent,
    });
  } catch (error) {
    return jsonResponse_({ ok: false, message: publicErrorMessage_(error) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action === "status") return jsonResponse_(getPublicStatus_());
  return jsonResponse_({ ok: true, message: "Wedding 50/50 endpoint is ready." });
}

function setupSpreadsheet() {
  try {
    const result = setupSpreadsheet_();
    SpreadsheetApp.getUi().alert(`Setup complete. ${result.orderCount} orders and ${result.includedEntryCount} included entries are ready.`);
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Could not set up the spreadsheet: ${publicErrorMessage_(error)}`);
  }
}

function migrateProductionData() {
  try {
    const result = setupSpreadsheet_();
    SpreadsheetApp.getUi().alert(
      `Migration complete: ${result.orderCount} orders, ${result.includedEntryCount} included entries, and $${result.submittedEntryValue.toFixed(2)} submitted.`,
    );
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Could not migrate the spreadsheet: ${publicErrorMessage_(error)}`);
  }
}

function setupSpreadsheet_() {
  const spreadsheet = getSpreadsheet_();
  const ordersSheet = spreadsheet.getSheetByName(SHEET_NAMES.ORDERS) || spreadsheet.insertSheet(SHEET_NAMES.ORDERS);
  migrateOrdersSheet_(ordersSheet);
  const summarySheet = getOrCreateSheet_(SHEET_NAMES.SUMMARY, ["Metric", "Value"]);
  const entriesSheet = getOrCreatePlainSheet_(SHEET_NAMES.JAR_ENTRIES);
  const slipsSheet = getOrCreatePlainSheet_(SHEET_NAMES.PRINTABLE_SLIPS);

  formatOrdersSheet_(ordersSheet);
  summarySheet.setFrozenRows(1);
  entriesSheet.setFrozenRows(1);
  slipsSheet.setHiddenGridlines(true);
  removeBlankDefaultSheet_(spreadsheet);

  const result = refreshEverything_();
  return {
    orderCount: getOrderRecords_(ordersSheet).length,
    includedEntryCount: result.summary.includedEntryCount,
    submittedEntryValue: result.summary.submittedEntryValue,
  };
}

function refreshEverything() {
  try {
    const result = refreshEverything_();
    SpreadsheetApp.getUi().alert(
      `Everything is refreshed: ${result.jarRows.length} jar entries and ${result.printableCount} printable slips.`,
    );
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Could not refresh the draw: ${publicErrorMessage_(error)}`);
  }
}

function refreshEverything_() {
  const summary = refreshSummary_();
  const jarRows = refreshJarEntries_();
  const printableCount = refreshPrintableJarSlips_(jarRows);
  return { summary, jarRows, printableCount };
}

function markSelectedEntryCancelled() {
  markSelectedEntryStatus_("Cancelled");
}

function markSelectedEntryRefunded() {
  markSelectedEntryStatus_("Refunded");
}

function markSelectedEntryStatus_(status) {
  const ui = SpreadsheetApp.getUi();
  try {
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    const rowNumber = getSelectedOrderRow_(ordersSheet);
    const record = getOrderRecord_(ordersSheet, rowNumber);
    validateRecordBasics_(record);
    const response = ui.alert(
      `Mark entry ${status}?`,
      `${record.jarName}'s ${record.entryCount} name slip${Number(record.entryCount) === 1 ? "" : "s"} will be removed from the current draw. The Orders row will stay in the private ledger.`,
      ui.ButtonSet.YES_NO,
    );
    if (response !== ui.Button.YES) return;

    ordersSheet.getRange(rowNumber, ORDER_COLUMN.entryStatus).setValue(status);
    addOrderNote_(ordersSheet, rowNumber, `Marked ${status} ${formatDate_(new Date())}`);
    refreshEverything_();
    SpreadsheetApp.flush();
    ui.alert(`Entry marked ${status}. The totals, jar list, and printable slips are refreshed.`);
  } catch (error) {
    ui.alert(`Could not mark the entry ${status}: ${publicErrorMessage_(error)}`);
  }
}

function resendPaymentInstructions() {
  const ui = SpreadsheetApp.getUi();
  try {
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    const rowNumber = getSelectedOrderRow_(ordersSheet);
    const record = getOrderRecord_(ordersSheet, rowNumber);
    validateRecordBasics_(record);
    sendPaymentInstructionsEmail_(record);
    ordersSheet.getRange(rowNumber, ORDER_COLUMN.paymentInstructionsSent).setValue("Yes");
    ui.alert(`E-transfer details sent to ${record.email}.`);
  } catch (error) {
    ui.alert(`Could not send e-transfer details: ${publicErrorMessage_(error)}`);
  }
}

function createPrintableJarSlips() {
  try {
    const jarRows = refreshJarEntries_();
    if (jarRows.length === 0) throw new Error("There are no included entries to print yet.");
    const count = refreshPrintableJarSlips_(jarRows);
    SpreadsheetApp.getUi().alert(`Printable Jar Slips created: ${count} slips. Print, cut on the borders, and place every slip in the jar.`);
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Could not create printable slips: ${publicErrorMessage_(error)}`);
  }
}

function createJarSnapshot() {
  try {
    const sourceRows = refreshJarEntries_();
    if (sourceRows.length === 0) throw new Error("There are no included jar entries to snapshot.");
    const spreadsheet = getSpreadsheet_();
    const timestamp = Utilities.formatDate(new Date(), SITE_CONFIG.timezone, "yyyyMMdd-HHmmss");
    const snapshotName = `Jar Snapshot ${timestamp}`;
    const sheet = spreadsheet.insertSheet(snapshotName);
    const values = [JAR_ENTRY_HEADERS].concat(sourceRows);
    sheet.getRange(1, 1, values.length, JAR_ENTRY_HEADERS.length).setValues(values);
    styleHeader_(sheet, JAR_ENTRY_HEADERS.length);
    sheet.autoResizeColumns(1, JAR_ENTRY_HEADERS.length);
    sheet.getRange(values.length + 2, 1, 3, 2).setValues([
      ["Created", new Date()],
      ["Entry count", sourceRows.length],
      ["SHA-256", sha256Hex_(JSON.stringify(sourceRows))],
    ]);
    SpreadsheetApp.getUi().alert(`${snapshotName} created with ${sourceRows.length} private jar entries.`);
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Could not create jar snapshot: ${publicErrorMessage_(error)}`);
  }
}

function getPublicStatus_() {
  try {
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    return buildPublicStatus_(getOrderRecords_(ordersSheet), new Date().toISOString());
  } catch (error) {
    return {
      confirmedSales: 0,
      confirmedEntryCount: 0,
      winnerPrize: 0,
      paidOrderCount: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
}

function refreshSummary_() {
  const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
  const summarySheet = getOrCreateSheet_(SHEET_NAMES.SUMMARY, ["Metric", "Value"]);
  const summary = calculateSummary_(getOrderRecords_(ordersSheet));
  const now = new Date();
  const rows = [
    ["Metric", "Value"],
    ["Submitted entry value", summary.submittedEntryValue],
    ["Payments received", summary.paymentsReceived],
    ["Payments still to check", summary.paymentsStillToCheck],
    ["Included orders", summary.includedOrderCount],
    ["Included jar entries", summary.includedEntryCount],
    ["Estimated winner prize", summary.winnerPrize],
    ["Ben and Tori's estimated portion", summary.couplePortion],
    ["Last updated", now],
  ];

  summarySheet.clear();
  summarySheet.getRange(1, 1, rows.length, 2).setValues(rows);
  styleHeader_(summarySheet, 2);
  summarySheet.getRange("B2:B4").setNumberFormat("$#,##0.00");
  summarySheet.getRange("B7:B8").setNumberFormat("$#,##0.00");
  summarySheet.getRange("B9").setNumberFormat("yyyy-mm-dd hh:mm");
  summarySheet.setColumnWidth(1, 250);
  summarySheet.setColumnWidth(2, 190);
  PropertiesService.getScriptProperties().setProperty("SUMMARY_LAST_UPDATED", now.toISOString());
  return summary;
}

function refreshJarEntries_() {
  const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
  const entriesSheet = getOrCreatePlainSheet_(SHEET_NAMES.JAR_ENTRIES);
  const rows = buildJarEntryRows_(getOrderRecords_(ordersSheet));

  entriesSheet.clear();
  entriesSheet.getRange(1, 1, 1, JAR_ENTRY_HEADERS.length).setValues([JAR_ENTRY_HEADERS]);
  if (rows.length > 0) entriesSheet.getRange(2, 1, rows.length, JAR_ENTRY_HEADERS.length).setValues(rows);
  styleHeader_(entriesSheet, JAR_ENTRY_HEADERS.length);
  entriesSheet.getRange("E2:E").setNumberFormat("yyyy-mm-dd hh:mm");
  entriesSheet.autoResizeColumns(1, JAR_ENTRY_HEADERS.length);
  return rows;
}

function buildJarEntryRows_(records) {
  const rows = [];
  records.forEach((record) => {
    if (record.entryStatus !== "Included") return;
    const entryCount = parseEntryCount_(record.entryCount);
    if (!record.jarName || entryCount === null) {
      throw new Error(`An included Orders row has an invalid jar name or entry count. Internal ID: ${record.internalOrderId || "missing"}`);
    }
    for (let position = 1; position <= entryCount; position += 1) {
      rows.push([
        record.jarName,
        record.internalOrderId,
        record.email,
        record.phone,
        record.submittedAt || "",
        position,
      ]);
    }
  });
  return rows;
}

function refreshPrintableJarSlips_(jarRows) {
  const rows = jarRows || refreshJarEntries_();
  const jarNames = shuffleCopy_(rows.map((row) => row[0]));
  const sheet = getOrCreatePlainSheet_(SHEET_NAMES.PRINTABLE_SLIPS);
  sheet.clear();
  sheet.setHiddenGridlines(true);
  if (jarNames.length === 0) return 0;

  const grid = buildPrintableSlipGrid_(jarNames, 2);
  const preparedCount = countPrintableSlips_(grid);
  if (preparedCount !== jarNames.length) throw new Error("Printable slip preparation count did not match Jar Entries.");

  sheet.getRange(1, 1, grid.length, 2)
    .setValues(grid)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontFamily("Georgia")
    .setFontSize(20)
    .setFontWeight("bold")
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, "#777777", SpreadsheetApp.BorderStyle.SOLID);
  for (let row = 1; row <= grid.length; row += 1) sheet.setRowHeight(row, 84);
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 280);

  const writtenCount = countPrintableSlips_(sheet.getRange(1, 1, grid.length, 2).getDisplayValues());
  if (writtenCount !== jarNames.length) throw new Error("Printable slip write count did not match Jar Entries.");
  return writtenCount;
}

function buildPrintableSlipGrid_(jarNames, columnCount) {
  const columns = Number.isInteger(columnCount) && columnCount > 0 ? columnCount : 2;
  const cleanNames = jarNames.map((name) => String(name || "").trim()).filter(Boolean);
  const grid = [];
  for (let index = 0; index < cleanNames.length; index += columns) {
    const row = cleanNames.slice(index, index + columns);
    while (row.length < columns) row.push("");
    grid.push(row);
  }
  return grid;
}

function countPrintableSlips_(grid) {
  return grid.reduce((count, row) => count + row.filter((value) => String(value || "").trim() !== "").length, 0);
}

function calculateSummary_(records) {
  const summary = {
    submittedEntryValue: 0,
    paymentsReceived: 0,
    paymentsStillToCheck: 0,
    includedOrderCount: 0,
    includedEntryCount: 0,
    winnerPrize: 0,
    couplePortion: 0,
  };

  records.forEach((record) => {
    if (record.entryStatus !== "Included") return;
    const amount = Number(record.amountDue) || 0;
    const entryCount = parseEntryCount_(record.entryCount);
    if (entryCount === null || calculateAmountForEntryCount_(entryCount) !== amount) {
      throw new Error(`An included Orders row has invalid pricing. Internal ID: ${record.internalOrderId || "missing"}`);
    }
    summary.submittedEntryValue += amount;
    summary.includedOrderCount += 1;
    summary.includedEntryCount += entryCount;
    if (isCheckedValue_(record.paymentReceived)) summary.paymentsReceived += amount;
  });

  summary.paymentsStillToCheck = summary.submittedEntryValue - summary.paymentsReceived;
  summary.winnerPrize = calculateWinnerPrize_(summary.submittedEntryValue);
  summary.couplePortion = summary.submittedEntryValue - summary.winnerPrize;
  return summary;
}

function buildPublicStatus_(records, lastUpdated) {
  const summary = calculateSummary_(records);
  return {
    confirmedSales: summary.submittedEntryValue,
    confirmedEntryCount: summary.includedEntryCount,
    winnerPrize: summary.winnerPrize,
    paidOrderCount: summary.includedOrderCount,
    lastUpdated: lastUpdated || new Date().toISOString(),
  };
}

function normalizeEntryStatus_(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "complete" || status === "paid" || status === "pending" || status === "included" || status === "") return "Included";
  if (status === "cancelled" || status === "canceled") return "Cancelled";
  if (status === "refunded") return "Refunded";
  throw new Error(`Unknown entry status: ${value}`);
}

function migrateLegacyOrderRow_(row, headers) {
  const index = {};
  headers.forEach((header, position) => { index[String(header || "").trim()] = position; });
  const read = (...names) => {
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(index, name)) return row[index[name]];
    }
    return "";
  };
  const legacyPaidConfirmation = read("Paid Confirmation Sent");
  const paymentReceived = isCheckedValue_(read("Payment Received")) || isYesValue_(legacyPaidConfirmation);
  const paymentReceivedAt = paymentReceived ? read("Payment Received At", "Payment Confirmed At") : "";
  return [
    read("Submitted At"), read("Internal Order ID"), read("Name for Jar"), read("Email"), read("Phone"),
    read("E-transfer Name"), read("Entry Count"), read("Amount Due"), read("Message"),
    normalizeEntryStatus_(read("Entry Status", "Payment Status")), paymentReceived, paymentReceivedAt,
    read("Payment Instructions Sent"), read("Notes"),
  ];
}

function migrateOrdersSheet_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), ORDER_HEADERS.length, 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const hasHeaders = headers.some((value) => String(value || "").trim() !== "");
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
    return;
  }

  const trimmedHeaders = headers.map((value) => String(value || "").trim());
  const isCurrent = ORDER_HEADERS.every((header, index) => trimmedHeaders[index] === header);
  if (isCurrent && !trimmedHeaders.slice(ORDER_HEADERS.length).some(Boolean)) return;

  const knownHeaders = new Set(ORDER_HEADERS.concat(LEGACY_ORDER_HEADERS));
  const unexpected = trimmedHeaders.filter(Boolean).filter((header) => !knownHeaders.has(header));
  if (unexpected.length > 0) throw new Error(`Orders has unexpected columns: ${unexpected.join(", ")}`);

  const lastRow = sheet.getLastRow();
  const sourceRows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues() : [];
  const nonEmptyRows = sourceRows.filter((row) => row.slice(0, 9)
    .some((value) => String(value === null || value === undefined ? "" : value).trim() !== ""));
  const migratedRows = nonEmptyRows.map((row) => migrateLegacyOrderRow_(row, trimmedHeaders));

  sheet.clear();
  sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
  if (migratedRows.length > 0) sheet.getRange(2, 1, migratedRows.length, ORDER_HEADERS.length).setValues(migratedRows);
}

function formatOrdersSheet_(sheet) {
  clearUnusedOrderRows_(sheet);
  styleHeader_(sheet, ORDER_HEADERS.length);
  sheet.getRange("A2:A").setNumberFormat("yyyy-mm-dd hh:mm");
  sheet.getRange("H2:H").setNumberFormat("$#,##0.00");
  sheet.getRange("L2:L").setNumberFormat("yyyy-mm-dd hh:mm");
  sheet.getRange(2, ORDER_COLUMN.entryStatus, sheet.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ENTRY_STATUSES, true).setAllowInvalid(false).build(),
  );
  sheet.getRange(2, ORDER_COLUMN.paymentReceived, sheet.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build(),
  );
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), ORDER_HEADERS.length).createFilter();

  const widths = [145, 155, 150, 210, 120, 170, 95, 105, 240, 115, 120, 155, 165, 280];
  widths.forEach((width, index) => sheet.setColumnWidth(index + 1, width));
  const statusRange = sheet.getRange(2, ORDER_COLUMN.entryStatus, sheet.getMaxRows() - 1, 1);
  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Included").setBackground("#e7f2ea").setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Cancelled").setBackground("#f6e5e2").setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Refunded").setBackground("#fff2cc").setRanges([statusRange]).build(),
  ];
  sheet.setConditionalFormatRules(rules);
}

function clearUnusedOrderRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  let lastDataRow = 1;
  values.forEach((row, index) => {
    if (row.some((value) => String(value === null || value === undefined ? "" : value).trim() !== "")) {
      lastDataRow = index + 2;
    }
  });
  if (lastDataRow < lastRow) sheet.getRange(lastDataRow + 1, 1, lastRow - lastDataRow, ORDER_HEADERS.length).clearContent();
}

function removeBlankDefaultSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName("Sheet1");
  if (!sheet || spreadsheet.getSheets().length <= 1) return;
  const values = sheet.getDataRange().getDisplayValues();
  const hasData = values.some((row) => row.some((value) => String(value || "").trim() !== ""));
  if (!hasData) spreadsheet.deleteSheet(sheet);
}

function findRecentDuplicate_(records, payload, now, windowMs) {
  const cutoff = now.getTime() - windowMs;
  const target = duplicateKey_(payload);
  return records.find((record) => {
    const submittedAt = record.submittedAt instanceof Date ? record.submittedAt : new Date(record.submittedAt);
    return !Number.isNaN(submittedAt.getTime()) && submittedAt.getTime() >= cutoff && submittedAt.getTime() <= now.getTime()
      && duplicateKey_(record) === target;
  }) || null;
}

function duplicateKey_(record) {
  return [record.email, record.jarName, record.entryCount, record.eTransferName]
    .map((value) => normalizeMatchText_(value))
    .join("|");
}

function normalizeMatchText_(value) {
  return String(value === null || value === undefined ? "" : value).trim().toLowerCase().replace(/\s+/g, " ");
}

function validateSubmission_(request, now) {
  if (cleanText_(request.honeypot, 200)) throw new Error("Submission rejected.");
  const closingDate = new Date(SITE_CONFIG.salesClosingDate);
  if (Number.isNaN(closingDate.getTime()) || now.getTime() >= closingDate.getTime()) throw new Error("Entries are closed.");

  const internalOrderId = cleanText_(request.internalOrderId, 80).toUpperCase();
  const jarName = cleanText_(request.jarName, 100);
  const email = cleanText_(request.email, 180).toLowerCase();
  const phone = cleanText_(request.phone, 40);
  const eTransferName = cleanText_(request.eTransferName, 100);
  const message = cleanText_(request.message, 500);
  const entryCount = parseEntryCount_(request.entryCount);

  if (!/^BT-[A-Z0-9]{6}-[A-Z0-9]{4}$/.test(internalOrderId)) throw new Error("The request ID is invalid. Refresh the page and try again.");
  if (jarName.length < 2) throw new Error("Enter the name to place in the jar.");
  if (!isValidEmail_(email)) throw new Error("Enter a valid email address.");
  if (eTransferName.length < 2) throw new Error("Enter the name that will appear on the e-transfer.");
  if (entryCount === null) throw new Error("Choose between 1 and 99 entries.");

  return { internalOrderId, jarName, email, phone, eTransferName, entryCount, amountDue: calculateAmountForEntryCount_(entryCount), message };
}

function validateRecordBasics_(record) {
  if (!record.internalOrderId || !record.jarName || !record.email) throw new Error("The selected row is missing required details.");
  if (parseEntryCount_(record.entryCount) === null) throw new Error("The selected row has an invalid entry count.");
  if (!isValidEmail_(record.email)) throw new Error("The selected row has an invalid email address.");
}

function sendPaymentInstructionsEmail_(record) {
  const amount = Number(record.amountDue) || 0;
  const entryCount = Number(record.entryCount) || 0;
  const subject = "Ben & Tori’s 50/50 E-transfer Details";
  const plainText = [
    `Hi ${firstName_(record.jarName)},`, "", "Thanks for joining our wedding 50/50.",
    `Please send an Interac e-transfer of $${amount.toFixed(2)} to ${SITE_CONFIG.eTransferAddress}.`,
    `Entries: ${entryCount}`, "",
    "Your entries are recorded. We'll check the e-transfer before the draw.", "",
    `Draw: ${formatPublicDateTime_(SITE_CONFIG.drawDate)}`, SITE_CONFIG.publicWebsiteUrl, "",
    "Thanks for helping us out!", "Ben & Tori",
  ].join("\n");

  const htmlBody = `
    <div style="background:#f8f3ea;padding:32px 16px;font-family:Arial,sans-serif;color:#21352f;">
      <div style="max-width:600px;margin:0 auto;background:#fffdf9;border-top:5px solid #173f35;padding:32px;">
        <p style="color:#b88f4e;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">Ben &amp; Tori's Wedding 50/50</p>
        <h1 style="font-family:Georgia,serif;font-size:32px;font-weight:normal;color:#173f35;">Your e-transfer details</h1>
        <p>Hi ${escapeHtml_(firstName_(record.jarName))},</p>
        <p>Thanks for joining our wedding 50/50. Please send the amount below by Interac e-transfer.</p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0;">
          <tr><td style="padding:10px 0;color:#6d7b73;">Send to</td><td style="padding:10px 0;text-align:right;font-weight:bold;overflow-wrap:anywhere;">${escapeHtml_(SITE_CONFIG.eTransferAddress)}</td></tr>
          <tr><td style="padding:10px 0;color:#6d7b73;">Amount</td><td style="padding:10px 0;text-align:right;font-weight:bold;">$${amount.toFixed(2)}</td></tr>
          <tr><td style="padding:10px 0;color:#6d7b73;">Entries</td><td style="padding:10px 0;text-align:right;font-weight:bold;">${entryCount}</td></tr>
        </table>
        <p>Your entries are recorded. We'll check the e-transfer before the draw.</p>
        <p>Draw: <strong>${escapeHtml_(formatPublicDateTime_(SITE_CONFIG.drawDate))}</strong></p>
        <p><a href="${escapeHtml_(SITE_CONFIG.publicWebsiteUrl)}" style="color:#173f35;font-weight:bold;">Open the 50/50 website</a></p>
        <p>Thanks for helping us out!<br><strong>Ben &amp; Tori</strong></p>
      </div>
    </div>`;
  MailApp.sendEmail({ to: record.email, subject, body: plainText, htmlBody });
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error("No submission data was received.");
  try { return JSON.parse(e.postData.contents); } catch (error) { throw new Error("The submission data was not valid JSON."); }
}

function getSelectedOrderRow_(ordersSheet) {
  const activeSheet = SpreadsheetApp.getActiveSheet();
  if (!activeSheet || activeSheet.getName() !== ordersSheet.getName()) throw new Error("Select a row on the Orders sheet first.");
  const rowNumber = activeSheet.getActiveRange().getRow();
  if (rowNumber <= 1) throw new Error("Select an Orders row below the header.");
  return rowNumber;
}

function getOrderRecord_(sheet, rowNumber) {
  return recordFromRow_(sheet.getRange(rowNumber, 1, 1, ORDER_HEADERS.length).getValues()[0]);
}

function getOrderRecords_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, ORDER_HEADERS.length).getValues()
    .filter((row) => row.slice(0, 9).some((value) => String(value === null || value === undefined ? "" : value).trim() !== ""))
    .map(recordFromRow_);
}

function recordFromRow_(row) {
  return {
    submittedAt: row[ORDER_COLUMN.submittedAt - 1],
    internalOrderId: String(row[ORDER_COLUMN.internalOrderId - 1] || "").trim(),
    jarName: String(row[ORDER_COLUMN.jarName - 1] || "").trim(),
    email: String(row[ORDER_COLUMN.email - 1] || "").trim(),
    phone: String(row[ORDER_COLUMN.phone - 1] || "").trim(),
    eTransferName: String(row[ORDER_COLUMN.eTransferName - 1] || "").trim(),
    entryCount: row[ORDER_COLUMN.entryCount - 1],
    amountDue: row[ORDER_COLUMN.amountDue - 1],
    message: String(row[ORDER_COLUMN.message - 1] || "").trim(),
    entryStatus: String(row[ORDER_COLUMN.entryStatus - 1] || "").trim(),
    paymentReceived: row[ORDER_COLUMN.paymentReceived - 1],
    paymentReceivedAt: row[ORDER_COLUMN.paymentReceivedAt - 1],
    paymentInstructionsSent: String(row[ORDER_COLUMN.paymentInstructionsSent - 1] || "").trim(),
    notes: String(row[ORDER_COLUMN.notes - 1] || "").trim(),
  };
}

function getOrCreateSheet_(sheetName, headers) {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  ensureHeaders_(sheet, headers);
  return sheet;
}

function getOrCreatePlainSheet_(sheetName) {
  const spreadsheet = getSpreadsheet_();
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function ensureHeaders_(sheet, headers) {
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length, 1);
  const current = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const hasHeaders = current.some((value) => String(value || "").trim() !== "");
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const exactMatch = headers.every((header, index) => current[index] === header);
    const unexpectedExtra = current.slice(headers.length).some((value) => String(value || "").trim() !== "");
    if (!exactMatch || unexpectedExtra) throw new Error(`The ${sheet.getName()} sheet has unexpected headers.`);
  }
  styleHeader_(sheet, headers.length);
}

function styleHeader_(sheet, columnCount) {
  sheet.getRange(1, 1, 1, columnCount).setBackground("#173f35").setFontColor("#fffdf9").setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function getSpreadsheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Bind this Apps Script project to the private wedding ledger spreadsheet first.");
  return spreadsheet;
}

function internalOrderIdExists_(ordersSheet, internalOrderId) {
  const lastRow = ordersSheet.getLastRow();
  if (lastRow <= 1) return false;
  return ordersSheet.getRange(2, ORDER_COLUMN.internalOrderId, lastRow - 1, 1).getDisplayValues()
    .some((row) => String(row[0] || "").trim().toUpperCase() === internalOrderId);
}

function addOrderNote_(ordersSheet, rowNumber, note) {
  const cell = ordersSheet.getRange(rowNumber, ORDER_COLUMN.notes);
  cell.setValue(appendNote_(cell.getDisplayValue(), note));
}

function calculateAmountForEntryCount_(entryCount) {
  const parsed = parseEntryCount_(entryCount);
  return parsed === null ? 0 : Math.floor(parsed / 3) * 25 + (parsed % 3) * 10;
}

function parseEntryCount_(value) {
  const text = String(value === null || value === undefined ? "" : value).trim();
  if (!/^\d+$/.test(text)) return null;
  const entryCount = Number(text);
  return Number.isInteger(entryCount) && entryCount >= 1 && entryCount <= 99 ? entryCount : null;
}

function calculateWinnerPrize_(submittedEntryValue) {
  return Math.round(Math.max(0, Number(submittedEntryValue) || 0) * 0.5 * 100) / 100;
}

function shuffleCopy_(values) {
  const copy = values.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const temporary = copy[index];
    copy[index] = copy[randomIndex];
    copy[randomIndex] = temporary;
  }
  return copy;
}

function cleanText_(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maxLength);
}

function safeCellText_(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function isValidEmail_(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isCheckedValue_(value) { return value === true || String(value || "").trim().toLowerCase() === "true"; }
function isYesValue_(value) { return value === true || ["yes", "true"].includes(String(value || "").trim().toLowerCase()); }
function formatDate_(date) { return Utilities.formatDate(date, SITE_CONFIG.timezone, "yyyy-MM-dd HH:mm"); }
function firstName_(fullName) { return String(fullName || "").trim().split(/\s+/)[0] || "there"; }
function appendNote_(existing, note) { return [existing, note].filter(Boolean).join(" | "); }

function formatPublicDateTime_(value) {
  if (!value) return "Date and time to be announced";
  return Utilities.formatDate(new Date(value), SITE_CONFIG.timezone, "MMMM d, yyyy 'at' h:mm a")
    .replace(" AM", " a.m.").replace(" PM", " p.m.");
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map((byte) => {
    const normalized = byte < 0 ? byte + 256 : byte;
    return (`0${normalized.toString(16)}`).slice(-2);
  }).join("");
}

function escapeHtml_(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function publicErrorMessage_(error) {
  const message = error && error.message ? error.message : String(error || "Unknown error");
  return message.slice(0, 300);
}
