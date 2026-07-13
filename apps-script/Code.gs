/**
 * Private Google Sheets backend for Ben and Tori's wedding 50/50.
 *
 * Paid entries become individual rows in the private Jar Entries sheet. Those
 * rows can be turned into printable name slips for the physical jar draw.
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
  "Payment Confirmed At",
  "Entry Position",
];

const PAYMENT_STATUSES = Object.freeze(["Pending", "Paid", "Refunded", "Cancelled"]);

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
  paymentStatus: 10,
  paymentConfirmedAt: 11,
  paymentInstructionsSent: 12,
  paidConfirmationSent: 13,
  notes: 14,
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Wedding Draw")
    .addItem("Setup Spreadsheet", "setupSpreadsheet")
    .addSeparator()
    .addItem("Re-send E-transfer Details", "resendPaymentInstructions")
    .addItem("Confirm Selected Payment", "confirmSelectedPayment")
    .addItem("Re-send Paid Confirmation", "resendPaidConfirmation")
    .addItem("Mark Selected Payment Refunded", "markSelectedPaymentRefunded")
    .addSeparator()
    .addItem("Refresh Summary", "refreshSummary")
    .addItem("Refresh Jar Entries", "refreshJarEntries")
    .addItem("Create Printable Jar Slips", "createPrintableJarSlips")
    .addItem("Create Jar Snapshot", "createJarSnapshot")
    .addToUi();
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lock.waitLock(10000);
    lockAcquired = true;
    const payload = validateSubmission_(parseRequest_(e), new Date());
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);

    if (internalOrderIdExists_(ordersSheet, payload.internalOrderId)) {
      throw new Error("This request has already been received. Please check your email for the payment details.");
    }

    ordersSheet.appendRow([
      new Date(),
      safeCellText_(payload.internalOrderId),
      safeCellText_(payload.jarName),
      safeCellText_(payload.email),
      safeCellText_(payload.phone),
      safeCellText_(payload.eTransferName),
      payload.entryCount,
      payload.amountDue,
      safeCellText_(payload.message),
      "Pending",
      "",
      "No",
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
      ordersSheet.getRange(rowNumber, ORDER_COLUMN.notes).setValue(
        `E-transfer details email failed: ${publicErrorMessage_(emailError)}`,
      );
    }

    refreshSummary_();
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
    if (lockAcquired) lock.releaseLock();
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action === "status") {
    return jsonResponse_(getPublicStatus_());
  }
  return jsonResponse_({ ok: true, message: "Wedding 50/50 endpoint is ready." });
}

function setupSpreadsheet() {
  setupSpreadsheet_();
  SpreadsheetApp.getUi().alert("Setup complete. Orders, Summary, Jar Entries, and Printable Jar Slips are ready.");
}

function setupSpreadsheet_() {
  const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
  const summarySheet = getOrCreateSheet_(SHEET_NAMES.SUMMARY, ["Metric", "Value"]);
  const entriesSheet = getOrCreateSheet_(SHEET_NAMES.JAR_ENTRIES, JAR_ENTRY_HEADERS);
  const slipsSheet = getOrCreatePlainSheet_(SHEET_NAMES.PRINTABLE_SLIPS);

  ordersSheet.getRange("A2:A").setNumberFormat("yyyy-mm-dd hh:mm");
  ordersSheet.getRange("H2:H").setNumberFormat("$#,##0.00");
  ordersSheet.getRange("K2:K").setNumberFormat("yyyy-mm-dd hh:mm");
  ordersSheet.setFrozenRows(1);
  ordersSheet.autoResizeColumns(1, ORDER_HEADERS.length);
  entriesSheet.setFrozenRows(1);
  entriesSheet.autoResizeColumns(1, JAR_ENTRY_HEADERS.length);
  summarySheet.setFrozenRows(1);
  slipsSheet.setHiddenGridlines(true);
  refreshSummary_();
  refreshJarEntries_();
}

function confirmSelectedPayment() {
  const ui = SpreadsheetApp.getUi();
  try {
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    const rowNumber = getSelectedOrderRow_(ordersSheet);
    const record = getOrderRecord_(ordersSheet, rowNumber);
    validateOrderForConfirmation_(record);

    const confirmedAt = new Date();
    ordersSheet.getRange(rowNumber, ORDER_COLUMN.paymentStatus).setValue("Paid");
    ordersSheet.getRange(rowNumber, ORDER_COLUMN.paymentConfirmedAt).setValue(confirmedAt);
    record.paymentStatus = "Paid";
    record.paymentConfirmedAt = confirmedAt;

    let confirmationSent = false;
    try {
      sendPaidConfirmationEmail_(record);
      confirmationSent = true;
      ordersSheet.getRange(rowNumber, ORDER_COLUMN.paidConfirmationSent).setValue("Yes");
    } catch (emailError) {
      addOrderNote_(ordersSheet, rowNumber, `Paid confirmation email failed: ${publicErrorMessage_(emailError)}`);
    }

    refreshSummary_();
    refreshJarEntries_();
    SpreadsheetApp.flush();

    const firstName = firstName_(record.jarName);
    const sentText = confirmationSent ? " A confirmation email was sent." : " The email could not be sent; check Notes.";
    ui.alert(`${firstName}'s payment is confirmed. ${firstName}'s name was added to Jar Entries ${record.entryCount} time${record.entryCount === 1 ? "" : "s"}.${sentText}`);
  } catch (error) {
    ui.alert(`Could not confirm payment: ${publicErrorMessage_(error)}`);
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

function resendPaidConfirmation() {
  const ui = SpreadsheetApp.getUi();
  try {
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    const rowNumber = getSelectedOrderRow_(ordersSheet);
    const record = getOrderRecord_(ordersSheet, rowNumber);
    validateRecordBasics_(record);
    if (record.paymentStatus !== "Paid") throw new Error("Only a paid entry can receive the paid confirmation.");
    sendPaidConfirmationEmail_(record);
    ordersSheet.getRange(rowNumber, ORDER_COLUMN.paidConfirmationSent).setValue("Yes");
    ui.alert(`Paid confirmation sent to ${record.email}.`);
  } catch (error) {
    ui.alert(`Could not send the paid confirmation: ${publicErrorMessage_(error)}`);
  }
}

function markSelectedPaymentRefunded() {
  const ui = SpreadsheetApp.getUi();
  try {
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    const rowNumber = getSelectedOrderRow_(ordersSheet);
    const record = getOrderRecord_(ordersSheet, rowNumber);
    if (record.paymentStatus !== "Paid") throw new Error("Only a paid entry can be marked refunded.");

    const response = ui.alert(
      "Mark payment refunded?",
      `${record.jarName}'s ${record.entryCount} jar entr${record.entryCount === 1 ? "y" : "ies"} will be removed from Jar Entries. The original Orders row will stay in the ledger.`,
      ui.ButtonSet.YES_NO,
    );
    if (response !== ui.Button.YES) return;

    ordersSheet.getRange(rowNumber, ORDER_COLUMN.paymentStatus).setValue("Refunded");
    addOrderNote_(ordersSheet, rowNumber, `Marked Refunded ${formatDate_(new Date())}`);
    refreshSummary_();
    refreshJarEntries_();
    ui.alert("Payment marked Refunded. The private order history was preserved.");
  } catch (error) {
    ui.alert(`Could not mark the payment refunded: ${publicErrorMessage_(error)}`);
  }
}

function refreshSummary() {
  try {
    refreshSummary_();
    SpreadsheetApp.getUi().alert("Summary refreshed.");
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Could not refresh Summary: ${publicErrorMessage_(error)}`);
  }
}

function refreshJarEntries() {
  try {
    const rows = refreshJarEntries_();
    SpreadsheetApp.getUi().alert(`Jar Entries refreshed. ${rows.length} paid name slip${rows.length === 1 ? "" : "s"} are ready.`);
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Could not refresh Jar Entries: ${publicErrorMessage_(error)}`);
  }
}

function createPrintableJarSlips() {
  try {
    const jarRows = refreshJarEntries_();
    const jarNames = shuffleCopy_(jarRows.map((row) => row[0]));
    const expectedCount = jarNames.length;
    if (expectedCount === 0) throw new Error("There are no paid entries to print yet.");

    const grid = buildPrintableSlipGrid_(jarNames, 2);
    const preparedCount = countPrintableSlips_(grid);
    if (preparedCount !== expectedCount) {
      throw new Error(`Slip preparation stopped because ${preparedCount} names were prepared for ${expectedCount} paid entries.`);
    }

    const sheet = getOrCreatePlainSheet_(SHEET_NAMES.PRINTABLE_SLIPS);
    sheet.clear();
    sheet.setHiddenGridlines(true);
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

    const writtenValues = sheet.getRange(1, 1, grid.length, 2).getDisplayValues();
    const writtenCount = countPrintableSlips_(writtenValues);
    if (writtenCount !== expectedCount) {
      throw new Error(`Print check failed: the sheet contains ${writtenCount} names for ${expectedCount} paid entries.`);
    }

    SpreadsheetApp.flush();
    SpreadsheetApp.getUi().alert(`Printable Jar Slips created: ${writtenCount} slips for ${expectedCount} paid entries. Print, cut on the borders, and place every slip in the jar.`);
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Could not create printable slips: ${publicErrorMessage_(error)}`);
  }
}

function createJarSnapshot() {
  try {
    const sourceRows = refreshJarEntries_();
    if (sourceRows.length === 0) throw new Error("There are no paid jar entries to snapshot.");
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
      lastUpdated: getLastSummaryUpdate_(),
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
    ["Confirmed sales", summary.confirmedSales],
    ["Pending sales", summary.pendingSales],
    ["Paid orders", summary.paidOrderCount],
    ["Pending orders", summary.pendingOrderCount],
    ["Confirmed jar entries", summary.confirmedEntryCount],
    ["Estimated winner prize", summary.winnerPrize],
    ["Ben and Tori's portion", summary.confirmedSales - summary.winnerPrize],
    ["Last updated", now],
  ];

  summarySheet.clearContents();
  summarySheet.getRange(1, 1, rows.length, 2).setValues(rows);
  styleHeader_(summarySheet, 2);
  summarySheet.getRange("B2:B3").setNumberFormat("$#,##0.00");
  summarySheet.getRange("B7:B8").setNumberFormat("$#,##0.00");
  summarySheet.getRange("B9").setNumberFormat("yyyy-mm-dd hh:mm");
  summarySheet.setColumnWidth(1, 230);
  summarySheet.setColumnWidth(2, 180);
  PropertiesService.getScriptProperties().setProperty("SUMMARY_LAST_UPDATED", now.toISOString());
  return summary;
}

function refreshJarEntries_() {
  const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
  const entriesSheet = getOrCreateSheet_(SHEET_NAMES.JAR_ENTRIES, JAR_ENTRY_HEADERS);
  const rows = buildJarEntryRows_(getOrderRecords_(ordersSheet));

  entriesSheet.clearContents();
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
    if (record.paymentStatus !== "Paid") return;
    const entryCount = parseEntryCount_(record.entryCount);
    if (!record.jarName || entryCount === null) {
      throw new Error(`A paid Orders row has an invalid jar name or entry count. Internal ID: ${record.internalOrderId || "missing"}`);
    }
    for (let position = 1; position <= entryCount; position += 1) {
      rows.push([
        record.jarName,
        record.internalOrderId,
        record.email,
        record.phone,
        record.paymentConfirmedAt || "",
        position,
      ]);
    }
  });
  return rows;
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
    confirmedSales: 0,
    pendingSales: 0,
    paidOrderCount: 0,
    pendingOrderCount: 0,
    confirmedEntryCount: 0,
    winnerPrize: 0,
  };

  records.forEach((record) => {
    const amount = Number(record.amountDue) || 0;
    if (record.paymentStatus === "Paid") {
      const entryCount = parseEntryCount_(record.entryCount);
      if (entryCount === null || calculateAmountForEntryCount_(entryCount) !== amount) {
        throw new Error(`A paid Orders row has invalid pricing. Internal ID: ${record.internalOrderId || "missing"}`);
      }
      summary.confirmedSales += amount;
      summary.paidOrderCount += 1;
      summary.confirmedEntryCount += entryCount;
    } else if (record.paymentStatus === "Pending") {
      summary.pendingSales += amount;
      summary.pendingOrderCount += 1;
    }
  });

  summary.winnerPrize = calculateWinnerPrize_(summary.confirmedSales);
  return summary;
}

function buildPublicStatus_(records, fallbackLastUpdated) {
  const summary = calculateSummary_(records);
  return {
    confirmedSales: summary.confirmedSales,
    confirmedEntryCount: summary.confirmedEntryCount,
    winnerPrize: summary.winnerPrize,
    paidOrderCount: summary.paidOrderCount,
    lastUpdated: fallbackLastUpdated || "Not updated yet",
  };
}

function validateSubmission_(request, now) {
  if (cleanText_(request.honeypot, 200)) throw new Error("Submission rejected.");
  const closingDate = new Date(SITE_CONFIG.salesClosingDate);
  if (Number.isNaN(closingDate.getTime()) || now.getTime() >= closingDate.getTime()) {
    throw new Error("Entries are closed.");
  }

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

  return {
    internalOrderId,
    jarName,
    email,
    phone,
    eTransferName,
    entryCount,
    amountDue: calculateAmountForEntryCount_(entryCount),
    message,
  };
}

function validateOrderForConfirmation_(record) {
  validateRecordBasics_(record);
  if (record.paymentStatus === "Paid") throw new Error("This payment is already confirmed.");
  if (record.paymentStatus !== "Pending") {
    throw new Error(`Only Pending payments can be confirmed. Current status: ${record.paymentStatus || "blank"}.`);
  }
  const expectedAmount = calculateAmountForEntryCount_(record.entryCount);
  if (!expectedAmount || Number(record.amountDue) !== expectedAmount) {
    throw new Error("The entry count and amount do not match the pricing formula. Correct the Orders row before confirming.");
  }
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
    `Hi ${firstName_(record.jarName)},`,
    "",
    "Thanks for joining our wedding 50/50.",
    `Please send an Interac e-transfer of $${amount.toFixed(2)} to ${SITE_CONFIG.eTransferAddress}.`,
    `Entries: ${entryCount}`,
    "",
    "Once the payment arrives, we'll put your name in our physical jar once for each paid entry and send you a quick confirmation.",
    "",
    `Draw: ${formatPublicDateTime_(SITE_CONFIG.drawDate)}`,
    SITE_CONFIG.publicWebsiteUrl,
    "",
    "Thanks for helping us out!",
    "Ben & Tori",
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
        <p>Once the payment arrives, we'll put your name in our physical jar once for each paid entry and send you a quick confirmation.</p>
        <p>Draw: <strong>${escapeHtml_(formatPublicDateTime_(SITE_CONFIG.drawDate))}</strong></p>
        <p><a href="${escapeHtml_(SITE_CONFIG.publicWebsiteUrl)}" style="color:#173f35;font-weight:bold;">Open the 50/50 website</a></p>
        <p>Thanks for helping us out!<br><strong>Ben &amp; Tori</strong></p>
      </div>
    </div>`;

  MailApp.sendEmail({ to: record.email, subject, body: plainText, htmlBody });
}

function sendPaidConfirmationEmail_(record) {
  const subject = "You’re in Ben & Tori’s Wedding 50/50 🎉";
  const entryCount = Number(record.entryCount) || 0;
  const plainText = [
    `Hi ${firstName_(record.jarName)},`,
    "",
    "We received your e-transfer. You're in!",
    `Name in the jar: ${record.jarName}`,
    `Amount received: $${Number(record.amountDue).toFixed(2)}`,
    `Paid entries: ${entryCount}`,
    "",
    `We have added ${entryCount} separate name slip${entryCount === 1 ? "" : "s"} to our private jar list. We'll print and cut every slip, mix them in the physical jar, and draw one name on video.`,
    "",
    `Draw: ${formatPublicDateTime_(SITE_CONFIG.drawDate)}`,
    SITE_CONFIG.publicWebsiteUrl,
    "",
    "Good luck, and thank you!",
    "Ben & Tori",
  ].join("\n");

  const htmlBody = `
    <div style="background:#f8f3ea;padding:32px 16px;font-family:Arial,sans-serif;color:#21352f;">
      <div style="max-width:600px;margin:0 auto;background:#fffdf9;border-top:5px solid #173f35;padding:32px;">
        <p style="color:#b88f4e;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">Ben &amp; Tori's Wedding 50/50</p>
        <h1 style="font-family:Georgia,serif;font-size:32px;font-weight:normal;color:#173f35;">You're in! 🎉</h1>
        <p>Hi ${escapeHtml_(firstName_(record.jarName))},</p>
        <p><strong>We received your e-transfer.</strong></p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0;">
          <tr><td style="padding:10px 0;color:#6d7b73;">Name in the jar</td><td style="padding:10px 0;text-align:right;font-weight:bold;">${escapeHtml_(record.jarName)}</td></tr>
          <tr><td style="padding:10px 0;color:#6d7b73;">Amount received</td><td style="padding:10px 0;text-align:right;font-weight:bold;">$${Number(record.amountDue).toFixed(2)}</td></tr>
          <tr><td style="padding:10px 0;color:#6d7b73;">Paid entries</td><td style="padding:10px 0;text-align:right;font-weight:bold;">${entryCount}</td></tr>
        </table>
        <p>We have added ${entryCount} separate name slip${entryCount === 1 ? "" : "s"} to our private jar list. We'll print and cut every slip, mix them in the physical jar, and draw one name on video.</p>
        <p>Draw: <strong>${escapeHtml_(formatPublicDateTime_(SITE_CONFIG.drawDate))}</strong></p>
        <p><a href="${escapeHtml_(SITE_CONFIG.publicWebsiteUrl)}" style="color:#173f35;font-weight:bold;">Open the 50/50 website</a></p>
        <p>Good luck, and thank you!<br><strong>Ben &amp; Tori</strong></p>
      </div>
    </div>`;

  MailApp.sendEmail({ to: record.email, subject, body: plainText, htmlBody });
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error("No submission data was received.");
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("The submission data was not valid JSON.");
  }
}

function getSelectedOrderRow_(ordersSheet) {
  const activeSheet = SpreadsheetApp.getActiveSheet();
  if (!activeSheet || activeSheet.getName() !== ordersSheet.getName()) throw new Error("Select a row on the Orders sheet first.");
  const rowNumber = activeSheet.getActiveRange().getRow();
  if (rowNumber <= 1) throw new Error("Select an Orders row below the header.");
  return rowNumber;
}

function getOrderRecord_(sheet, rowNumber) {
  const values = sheet.getRange(rowNumber, 1, 1, ORDER_HEADERS.length).getValues()[0];
  return recordFromRow_(values);
}

function getOrderRecords_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, ORDER_HEADERS.length).getValues().map(recordFromRow_);
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
    paymentStatus: String(row[ORDER_COLUMN.paymentStatus - 1] || "").trim(),
    paymentConfirmedAt: row[ORDER_COLUMN.paymentConfirmedAt - 1],
    paymentInstructionsSent: String(row[ORDER_COLUMN.paymentInstructionsSent - 1] || "").trim(),
    paidConfirmationSent: String(row[ORDER_COLUMN.paidConfirmationSent - 1] || "").trim(),
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
    const currentHeaders = current.slice(0, headers.length);
    const exactMatch = headers.every((header, index) => currentHeaders[index] === header);
    const unexpectedExtra = current.slice(headers.length).some((value) => String(value || "").trim() !== "");
    if (!exactMatch || unexpectedExtra) {
      throw new Error(`The ${sheet.getName()} sheet has unexpected headers. Use a fresh private spreadsheet or correct the header row before continuing.`);
    }
  }
  styleHeader_(sheet, headers.length);
}

function styleHeader_(sheet, columnCount) {
  sheet.getRange(1, 1, 1, columnCount)
    .setBackground("#173f35")
    .setFontColor("#fffdf9")
    .setFontWeight("bold");
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
  if (parsed === null) return 0;
  return Math.floor(parsed / 3) * 25 + (parsed % 3) * 10;
}

function parseEntryCount_(value) {
  const text = String(value === null || value === undefined ? "" : value).trim();
  if (!/^\d+$/.test(text)) return null;
  const entryCount = Number(text);
  return Number.isInteger(entryCount) && entryCount >= 1 && entryCount <= 99 ? entryCount : null;
}

function calculateWinnerPrize_(confirmedSales) {
  return Math.round(Math.max(0, Number(confirmedSales) || 0) * 0.5 * 100) / 100;
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

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getLastSummaryUpdate_() {
  return PropertiesService.getScriptProperties().getProperty("SUMMARY_LAST_UPDATED") || "Not updated yet";
}

function formatDate_(date) {
  return Utilities.formatDate(date, SITE_CONFIG.timezone, "yyyy-MM-dd HH:mm");
}

function formatPublicDateTime_(value) {
  if (!value) return "Date and time to be announced";
  return Utilities.formatDate(new Date(value), SITE_CONFIG.timezone, "MMMM d, yyyy 'at' h:mm a")
    .replace(" AM", " a.m.")
    .replace(" PM", " p.m.");
}

function firstName_(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "there";
}

function appendNote_(existing, note) {
  return [existing, note].filter(Boolean).join(" | ");
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map((byte) => {
    const normalized = byte < 0 ? byte + 256 : byte;
    return (`0${normalized.toString(16)}`).slice(-2);
  }).join("");
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function publicErrorMessage_(error) {
  const message = error && error.message ? error.message : String(error || "Unknown error");
  return message.slice(0, 300);
}
