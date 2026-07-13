/**
 * Ben and Tori's Wedding 50/50 Google Apps Script backend.
 *
 * Bind this script to the private Google Sheet that stores the ledger.
 * The website only receives the small JSON response from doPost and the
 * aggregate-only response from doGet?action=status.
 */

const SHEET_NAMES = Object.freeze({
  ORDERS: "Orders",
  SUMMARY: "Summary",
  DRAW_ENTRIES: "Draw Entries",
});

const ORDER_HEADERS = [
  "Submitted At",
  "Order ID",
  "Full Name",
  "Email",
  "Phone",
  "E-transfer Name",
  "Package ID",
  "Package Display",
  "Ticket Count",
  "Amount Due",
  "Message",
  "Payment Status",
  "Payment Confirmed At",
  "Ticket Numbers",
  "Confirmation Sent",
  "Notes",
  "Payment Instructions Sent",
];

const DRAW_ENTRY_HEADERS = [
  "Ticket Number",
  "Order ID",
  "Buyer Name",
  "Buyer Email",
  "Buyer Phone",
  "Package",
  "Amount Paid",
  "Payment Confirmed At",
];

const PACKAGE_DEFINITIONS = Object.freeze({
  single: Object.freeze({ display: "1 Ticket", ticketCount: 1, amount: 10 }),
  triple: Object.freeze({ display: "3 Tickets", ticketCount: 3, amount: 25 }),
});

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
  orderId: 2,
  fullName: 3,
  email: 4,
  phone: 5,
  eTransferName: 6,
  packageId: 7,
  packageDisplay: 8,
  ticketCount: 9,
  amountDue: 10,
  message: 11,
  paymentStatus: 12,
  paymentConfirmedAt: 13,
  ticketNumbers: 14,
  confirmationSent: 15,
  notes: 16,
  paymentInstructionsSent: 17,
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Wedding Draw")
    .addItem("Setup Spreadsheet", "setupSpreadsheet")
    .addItem("Re-send Payment Instructions", "resendPaymentInstructions")
    .addItem("Confirm Selected Order", "confirmSelectedOrder")
    .addItem("Re-send Confirmation Email", "resendConfirmationEmail")
    .addItem("Mark Selected Order Refunded", "markSelectedOrderRefunded")
    .addItem("Refresh Summary", "refreshSummary")
    .addItem("Refresh Draw Entries", "refreshDrawEntries")
    .addItem("Create Draw Snapshot", "createDrawSnapshot")
    .addToUi();
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
    const payload = validateSubmission_(parseRequest_(e));
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);

    if (orderIdExists_(ordersSheet, payload.orderId)) {
      throw new Error("This order reference has already been submitted. Please use the original reference or submit again with a new form.");
    }

    ordersSheet.appendRow([
      new Date(),
      safeCellText_(payload.orderId),
      safeCellText_(payload.fullName),
      safeCellText_(payload.email),
      safeCellText_(payload.phone),
      safeCellText_(payload.eTransferName),
      payload.packageId,
      payload.packageDisplay,
      payload.ticketCount,
      payload.amountDue,
      safeCellText_(payload.message),
      "Pending",
      "",
      "",
      "No",
      "",
      "No",
    ]);

    const rowNumber = ordersSheet.getLastRow();
    let paymentInstructionsStatus = "No";
    let paymentInstructionsNote = "";

    try {
      sendPaymentInstructionsEmail_(payload);
      paymentInstructionsStatus = "Yes";
    } catch (emailError) {
      paymentInstructionsNote = `Payment instructions email failed: ${publicErrorMessage_(emailError)}`;
    }

    ordersSheet.getRange(rowNumber, ORDER_COLUMN.paymentInstructionsSent).setValue(paymentInstructionsStatus);
    if (paymentInstructionsNote) {
      ordersSheet.getRange(rowNumber, ORDER_COLUMN.notes).setValue(paymentInstructionsNote);
    }

    refreshSummary_();
    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      orderId: payload.orderId,
      packageDisplay: payload.packageDisplay,
      ticketQuantity: payload.ticketCount,
      amountDue: payload.amountDue,
      paymentInstructionsSent: paymentInstructionsStatus === "Yes",
    });
  } catch (error) {
    return jsonResponse_({ ok: false, message: publicErrorMessage_(error) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {
      // The lock may not have been acquired if validation failed early.
    }
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
  SpreadsheetApp.getUi().alert("Wedding Draw setup complete. Orders, Summary, and Draw Entries are ready.");
}

function setupSpreadsheet_() {
  getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
  getOrCreateSheet_(SHEET_NAMES.SUMMARY, ["Metric", "Value"]);
  getOrCreateSheet_(SHEET_NAMES.DRAW_ENTRIES, DRAW_ENTRY_HEADERS);
  refreshSummary_();
  refreshDrawEntries_();
}

function confirmSelectedOrder() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    const rowNumber = getSelectedOrderRow_(ordersSheet);
    const record = getOrderRecord_(ordersSheet, rowNumber);
    const packageDefinition = validateOrderForConfirmation_(record);
    const ticketNumbers = assignNextTicketNumbers_(ordersSheet, packageDefinition.ticketCount);
    const confirmedAt = new Date();

    ordersSheet.getRange(rowNumber, ORDER_COLUMN.paymentStatus).setValue("Paid");
    ordersSheet.getRange(rowNumber, ORDER_COLUMN.paymentConfirmedAt).setValue(confirmedAt);
    ordersSheet.getRange(rowNumber, ORDER_COLUMN.ticketNumbers).setValue(ticketNumbers.join(", "));

    let emailStatus = "No";
    let emailNote = "";

    try {
      sendConfirmationEmail_(record, packageDefinition, ticketNumbers);
      emailStatus = "Yes";
    } catch (emailError) {
      emailNote = `Confirmation email failed: ${publicErrorMessage_(emailError)}`;
    }

    ordersSheet.getRange(rowNumber, ORDER_COLUMN.confirmationSent).setValue(emailStatus);
    if (emailNote) {
      ordersSheet.getRange(rowNumber, ORDER_COLUMN.notes).setValue(appendNote_(record.notes, emailNote));
    }

    refreshSummary_();
    refreshDrawEntries_();
    SpreadsheetApp.flush();

    const message = emailNote
      ? `Order ${record.orderId} is paid and tickets ${ticketNumbers.join(", ")} were assigned. The email could not be sent, so use Re-send Confirmation Email after checking the address.`
      : `Order ${record.orderId} is paid. Ticket numbers assigned: ${ticketNumbers.join(", ")}.`;
    SpreadsheetApp.getUi().alert(message);
  } catch (error) {
    SpreadsheetApp.getUi().alert(publicErrorMessage_(error));
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {
      // No action required.
    }
  }
}

function resendConfirmationEmail() {
  try {
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    const rowNumber = getSelectedOrderRow_(ordersSheet);
    const record = getOrderRecord_(ordersSheet, rowNumber);
    if (record.paymentStatus !== "Paid") {
      throw new Error("Only paid orders can receive a confirmation email.");
    }

    const packageDefinition = getOrderPackageDefinition_(record);
    const ticketNumbers = getTicketNumbers_(record.ticketNumbers);
    if (!packageDefinition || ticketNumbers.length === 0) {
      throw new Error("This paid order does not have a valid package or ticket number list.");
    }

    sendConfirmationEmail_(record, packageDefinition, ticketNumbers);
    ordersSheet.getRange(rowNumber, ORDER_COLUMN.confirmationSent).setValue("Yes");
    SpreadsheetApp.flush();
    SpreadsheetApp.getUi().alert(`Confirmation email re-sent for ${record.orderId}.`);
  } catch (error) {
    SpreadsheetApp.getUi().alert(publicErrorMessage_(error));
  }
}

function resendPaymentInstructions() {
  try {
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    const rowNumber = getSelectedOrderRow_(ordersSheet);
    const record = getOrderRecord_(ordersSheet, rowNumber);
    if (!record.orderId || !record.email) {
      throw new Error("The selected row is missing an order reference or email address.");
    }

    sendPaymentInstructionsEmail_(record);
    ordersSheet.getRange(rowNumber, ORDER_COLUMN.paymentInstructionsSent).setValue("Yes");
    ordersSheet.getRange(rowNumber, ORDER_COLUMN.notes).setValue(
      appendNote_(record.notes, `Payment instructions re-sent ${formatDate_(new Date())}.`),
    );
    SpreadsheetApp.flush();
    SpreadsheetApp.getUi().alert(`Payment instructions re-sent for ${record.orderId}.`);
  } catch (error) {
    SpreadsheetApp.getUi().alert(publicErrorMessage_(error));
  }
}

function markSelectedOrderRefunded() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
    const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
    const rowNumber = getSelectedOrderRow_(ordersSheet);
    const record = getOrderRecord_(ordersSheet, rowNumber);

    if (record.paymentStatus === "Refunded") {
      throw new Error("This order is already marked Refunded.");
    }
    if (record.paymentStatus !== "Paid") {
      throw new Error("Only a paid order can be marked Refunded.");
    }

    ordersSheet.getRange(rowNumber, ORDER_COLUMN.paymentStatus).setValue("Refunded");
    ordersSheet.getRange(rowNumber, ORDER_COLUMN.notes).setValue(
      appendNote_(record.notes, `Refund marked ${formatDate_(new Date())}. Existing ticket numbers were preserved for audit history.`),
    );

    refreshSummary_();
    refreshDrawEntries_();
    SpreadsheetApp.flush();
    SpreadsheetApp.getUi().alert(`Order ${record.orderId} is marked Refunded. Its tickets are no longer eligible and will not be reassigned.`);
  } catch (error) {
    SpreadsheetApp.getUi().alert(publicErrorMessage_(error));
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {
      // No action required.
    }
  }
}

function refreshSummary() {
  refreshSummary_();
  SpreadsheetApp.getUi().alert("Summary refreshed.");
}

function refreshDrawEntries() {
  refreshDrawEntries_();
  SpreadsheetApp.getUi().alert("Draw Entries refreshed. Only paid orders are included.");
}

function createDrawSnapshot() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
    const entryRows = refreshDrawEntries_();
    const spreadsheet = getSpreadsheet_();
    const timestamp = new Date();
    const snapshotName = `Draw Snapshot ${Utilities.formatDate(timestamp, SITE_CONFIG.timezone, "yyyy-MM-dd HH-mm-ss")}`;
    const snapshotSheet = spreadsheet.insertSheet(snapshotName);
    const dataRows = [DRAW_ENTRY_HEADERS].concat(entryRows);

    if (dataRows.length > 0) {
      snapshotSheet.getRange(1, 1, dataRows.length, DRAW_ENTRY_HEADERS.length).setValues(dataRows);
    }

    const publicStatus = getPublicStatus_();
    const dataForHash = JSON.stringify(dataRows);
    const hash = sha256Hex_(dataForHash);
    const metadataStart = dataRows.length + 3;
    const metadata = [
      ["Snapshot created", timestamp],
      ["SHA-256", hash],
      ["Total eligible tickets", publicStatus.confirmedTicketCount],
      ["Total confirmed sales", publicStatus.confirmedSales],
      ["Winner prize", publicStatus.winnerPrize],
    ];

    snapshotSheet.getRange(metadataStart, 1, metadata.length, 2).setValues(metadata);
    styleHeader_(snapshotSheet, DRAW_ENTRY_HEADERS.length);
    snapshotSheet.setFrozenRows(1);
    snapshotSheet.autoResizeColumns(1, DRAW_ENTRY_HEADERS.length);

    try {
      const protection = snapshotSheet.protect().setDescription("Frozen wedding draw snapshot");
      protection.setWarningOnly(false);
    } catch (protectionError) {
      // Protection can be restricted by the active account. The immutable sheet
      // name and no-delete workflow still preserve the prior snapshot.
    }

    SpreadsheetApp.getUi().alert(`Draw snapshot created: ${snapshotName}\nEligible tickets: ${publicStatus.confirmedTicketCount}\nSHA-256: ${hash}`);
  } catch (error) {
    SpreadsheetApp.getUi().alert(publicErrorMessage_(error));
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {
      // No action required.
    }
  }
}

function parseRequest_(e) {
  if (!e) throw new Error("No request payload was received.");

  const rawBody = e.postData && e.postData.contents ? String(e.postData.contents) : "";
  if (rawBody) {
    try {
      return JSON.parse(rawBody);
    } catch (jsonError) {
      // Continue with form-encoded parameters below.
    }
  }

  return e.parameter || {};
}

function validateSubmission_(payload) {
  const request = payload || {};
  if (cleanText_(request.honeypot, 200)) {
    throw new Error("The submission could not be accepted.");
  }

  const packageId = cleanText_(request.packageId, 30);
  const hasQuantityField = Object.prototype.hasOwnProperty.call(request, "ticketQuantity") || Object.prototype.hasOwnProperty.call(request, "quantity");
  const quantityValue = Object.prototype.hasOwnProperty.call(request, "ticketQuantity") ? request.ticketQuantity : request.quantity;
  let storedPackageId = packageId;
  let packageDefinition;

  if (hasQuantityField) {
    const ticketQuantity = parseTicketQuantity_(quantityValue);
    if (ticketQuantity === null) throw new Error("Choose between 1 and 99 whole tickets.");
    storedPackageId = "quantity";
    packageDefinition = getQuantityPackageDefinition_(ticketQuantity);
  } else {
    packageDefinition = getPackageDefinition_(packageId);
  }

  if (!packageDefinition) throw new Error("Please choose a valid ticket quantity.");

  const fullName = cleanText_(request.fullName, 140);
  const email = cleanText_(request.email, 160).toLowerCase();
  const eTransferName = cleanText_(request.eTransferName, 140);
  const orderId = cleanText_(request.orderId, 40).toUpperCase();

  if (!fullName) throw new Error("Full name is required.");
  if (!isValidEmail_(email)) throw new Error("A valid email address is required.");
  if (!eTransferName) throw new Error("The e-transfer name is required.");
  if (!/^BT-[A-Z0-9]+-[A-Z0-9]{4}$/.test(orderId)) throw new Error("The order reference is invalid.");
  if (!asBoolean_(request.confirmed)) throw new Error("Please confirm that the submitted information is correct.");

  return {
    orderId,
    fullName,
    email,
    phone: cleanText_(request.phone, 60),
    eTransferName,
    packageId: storedPackageId,
    packageDisplay: packageDefinition.display,
    ticketCount: packageDefinition.ticketCount,
    amountDue: packageDefinition.amount,
    message: cleanText_(request.message, 500),
  };
}

function getPublicStatus_() {
  const ordersSheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.ORDERS);
  const records = ordersSheet ? getOrderRecords_(ordersSheet) : [];
  let confirmedSales = 0;
  let confirmedTicketCount = 0;
  let paidOrderCount = 0;
  let lastUpdated = null;

  records.forEach((record) => {
    if (record.paymentStatus !== "Paid") return;
    confirmedSales += Number(record.amountDue) || 0;
    confirmedTicketCount += getTicketNumbers_(record.ticketNumbers).length;
    paidOrderCount += 1;

    const confirmationDate = record.paymentConfirmedAt instanceof Date ? record.paymentConfirmedAt : null;
    if (confirmationDate && (!lastUpdated || confirmationDate.getTime() > lastUpdated.getTime())) {
      lastUpdated = confirmationDate;
    }
  });

  return {
    confirmedSales,
    confirmedTicketCount,
    winnerPrize: calculateWinnerPrize_(confirmedSales),
    paidOrderCount,
    lastUpdated: lastUpdated ? lastUpdated.toISOString() : getLastSummaryUpdate_(),
  };
}

function refreshSummary_() {
  const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
  const summarySheet = getOrCreateSheet_(SHEET_NAMES.SUMMARY, ["Metric", "Value"]);
  const records = getOrderRecords_(ordersSheet);
  const summary = calculateSummary_(records);
  const now = new Date();

  summarySheet.clearContents();
  const rows = [
    ["Metric", "Value"],
    ["Confirmed sales", summary.confirmedSales],
    ["Pending sales", summary.pendingSales],
    ["Paid orders", summary.paidOrderCount],
    ["Pending orders", summary.pendingOrderCount],
    ["Paid tickets", summary.paidTickets],
    ["Estimated winner prize", summary.winnerPrize],
    ["Ben and Tori's portion", summary.confirmedSales - summary.winnerPrize],
    ["Last updated", now],
  ];

  summarySheet.getRange(1, 1, rows.length, 2).setValues(rows);
  styleHeader_(summarySheet, 2);
  summarySheet.getRange(2, 2, 2, 1).setNumberFormat("$#,##0.00");
  summarySheet.getRange(7, 2, 2, 1).setNumberFormat("$#,##0.00");
  summarySheet.getRange(9, 2).setNumberFormat("yyyy-mm-dd hh:mm");
  summarySheet.setColumnWidth(1, 230);
  summarySheet.setColumnWidth(2, 180);
  PropertiesService.getScriptProperties().setProperty("SUMMARY_LAST_UPDATED", now.toISOString());
}

function refreshDrawEntries_() {
  const ordersSheet = getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADERS);
  const entriesSheet = getOrCreateSheet_(SHEET_NAMES.DRAW_ENTRIES, DRAW_ENTRY_HEADERS);
  const records = getOrderRecords_(ordersSheet);
  const rows = [];

  records.forEach((record) => {
    if (record.paymentStatus !== "Paid") return;
    getTicketNumbers_(record.ticketNumbers).forEach((ticketNumber) => {
      rows.push([
        ticketNumber,
        record.orderId,
        record.fullName,
        record.email,
        record.phone,
        record.packageDisplay,
        Number(record.amountDue) || 0,
        record.paymentConfirmedAt || "",
      ]);
    });
  });

  entriesSheet.clearContents();
  entriesSheet.getRange(1, 1, 1, DRAW_ENTRY_HEADERS.length).setValues([DRAW_ENTRY_HEADERS]);
  if (rows.length > 0) {
    entriesSheet.getRange(2, 1, rows.length, DRAW_ENTRY_HEADERS.length).setValues(rows);
  }

  styleHeader_(entriesSheet, DRAW_ENTRY_HEADERS.length);
  entriesSheet.setFrozenRows(1);
  entriesSheet.getRange("G2:G").setNumberFormat("$#,##0.00");
  entriesSheet.autoResizeColumns(1, DRAW_ENTRY_HEADERS.length);
  return rows;
}

function calculateSummary_(records) {
  let confirmedSales = 0;
  let pendingSales = 0;
  let paidOrderCount = 0;
  let pendingOrderCount = 0;
  let paidTickets = 0;

  records.forEach((record) => {
    const amount = Number(record.amountDue) || 0;
    if (record.paymentStatus === "Paid") {
      confirmedSales += amount;
      paidOrderCount += 1;
      paidTickets += getTicketNumbers_(record.ticketNumbers).length;
    } else if (record.paymentStatus === "Pending") {
      pendingSales += amount;
      pendingOrderCount += 1;
    }
  });

  return {
    confirmedSales,
    pendingSales,
    paidOrderCount,
    pendingOrderCount,
    paidTickets,
    winnerPrize: calculateWinnerPrize_(confirmedSales),
  };
}

function validateOrderForConfirmation_(record) {
  if (!record.orderId || !record.fullName || !record.email) throw new Error("The selected row is missing required order details.");
  if (record.paymentStatus === "Paid") throw new Error("This order is already marked Paid.");
  if (record.paymentStatus !== "Pending") throw new Error(`Only Pending orders can be confirmed. Current status: ${record.paymentStatus || "blank"}.`);

  const packageDefinition = getOrderPackageDefinition_(record);
  if (!packageDefinition) throw new Error("The selected order has an invalid package ID.");
  if (Number(record.ticketCount) !== packageDefinition.ticketCount) throw new Error("The ticket count in the selected order does not match its pricing. Correct it before confirming.");
  if (Number(record.amountDue) !== packageDefinition.amount) throw new Error("The amount in the selected order does not match the package amount. Correct it before confirming.");
  return packageDefinition;
}

function assignNextTicketNumbers_(ordersSheet, ticketCount) {
  const highest = getHighestAssignedTicketNumber_(ordersSheet);
  const ticketNumbers = [];
  for (let index = 1; index <= ticketCount; index += 1) {
    ticketNumbers.push(formatTicketNumber_(highest + index));
  }
  return ticketNumbers;
}

function getHighestAssignedTicketNumber_(ordersSheet) {
  let highest = 0;
  getOrderRecords_(ordersSheet).forEach((record) => {
    getTicketNumbers_(record.ticketNumbers).forEach((ticketNumber) => {
      highest = Math.max(highest, Number(ticketNumber));
    });
  });
  return highest;
}

function sendConfirmationEmail_(record, packageDefinition, ticketNumbers) {
  const ticketList = ticketNumbers.join(", ");
  const subject = "Your Wedding 50/50 Ticket Numbers";
  const salesClosingDate = formatPublicDateTime_(SITE_CONFIG.salesClosingDate);
  const drawDate = formatPublicDateTime_(SITE_CONFIG.drawDate);
  const plainText = [
    `Hi ${record.fullName},`,
    "",
    "Your payment is confirmed — good luck!",
    `Order reference: ${record.orderId}`,
    `Amount received: $${Number(record.amountDue).toFixed(2)}`,
    `Ticket quantity: ${packageDefinition.ticketCount}`,
    `Ticket number${ticketNumbers.length === 1 ? "" : "s"}: ${ticketList}`,
    `Sales close: ${salesClosingDate}`,
    `Draw: ${drawDate}`,
    `Public website: ${SITE_CONFIG.publicWebsiteUrl}`,
    "",
    "Thank you for helping us celebrate.",
    "Ben and Tori",
  ].join("\n");

  const htmlBody = `
    <div style="background:#f8f3ea;padding:32px 16px;font-family:Arial,sans-serif;color:#21352f;">
      <div style="max-width:600px;margin:0 auto;background:#fffdf9;border-top:5px solid #173f35;padding:32px;">
        <p style="color:#b88f4e;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">Ben &amp; Tori's Wedding 50/50</p>
        <h1 style="font-family:Georgia,serif;font-size:32px;font-weight:normal;color:#173f35;">Your Wedding 50/50 Ticket Numbers</h1>
        <p>Hi ${escapeHtml_(record.fullName)},</p>
        <p><strong>Your payment is confirmed — good luck!</strong></p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0;">
          <tr><td style="padding:10px 0;color:#6d7b73;">Order reference</td><td style="padding:10px 0;text-align:right;font-weight:bold;">${escapeHtml_(record.orderId)}</td></tr>
          <tr><td style="padding:10px 0;color:#6d7b73;">Amount received</td><td style="padding:10px 0;text-align:right;font-weight:bold;">$${Number(record.amountDue).toFixed(2)}</td></tr>
          <tr><td style="padding:10px 0;color:#6d7b73;">Ticket quantity</td><td style="padding:10px 0;text-align:right;font-weight:bold;">${packageDefinition.ticketCount}</td></tr>
          <tr><td style="padding:10px 0;color:#6d7b73;">Ticket number${ticketNumbers.length === 1 ? "" : "s"}</td><td style="padding:10px 0;text-align:right;font-weight:bold;">${escapeHtml_(ticketList)}</td></tr>
        </table>
        <p>Sales close: <strong>${escapeHtml_(salesClosingDate)}</strong><br />Draw: <strong>${escapeHtml_(drawDate)}</strong></p>
        <p><a href="${escapeHtml_(SITE_CONFIG.publicWebsiteUrl)}" style="color:#173f35;font-weight:bold;">Open the public draw website</a></p>
        <p>Thank you for helping us celebrate.</p>
        <p><strong>Ben and Tori</strong></p>
      </div>
    </div>`;

  MailApp.sendEmail({ to: record.email, subject, body: plainText, htmlBody });
}

function sendPaymentInstructionsEmail_(record) {
  const quantity = Number(record.ticketCount) || 0;
  const amount = Number(record.amountDue) || 0;
  const subject = "Your Wedding 50/50 Payment Instructions";
  const plainText = [
    `Hi ${firstName_(record.fullName)},`,
    "",
    "Your ticket request is saved.",
    `Please send an Interac e-transfer of $${amount.toFixed(2)} to ${SITE_CONFIG.eTransferAddress}.`,
    `Ticket quantity: ${quantity}`,
    `Order reference: ${record.orderId}`,
    "",
    "Include the order reference in the transfer message if you can. Ticket numbers are emailed after payment is confirmed.",
    "",
    `Draw: ${formatPublicDateTime_(SITE_CONFIG.drawDate)}`,
    SITE_CONFIG.publicWebsiteUrl,
    "",
    "Ben and Tori",
  ].join("\n");

  const htmlBody = `
    <div style="background:#f8f3ea;padding:32px 16px;font-family:Arial,sans-serif;color:#21352f;">
      <div style="max-width:600px;margin:0 auto;background:#fffdf9;border-top:5px solid #173f35;padding:32px;">
        <p style="color:#b88f4e;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">Ben &amp; Tori's Wedding 50/50</p>
        <h1 style="font-family:Georgia,serif;font-size:32px;font-weight:normal;color:#173f35;">Your payment details</h1>
        <p>Hi ${escapeHtml_(firstName_(record.fullName))},</p>
        <p>Your ticket request is saved. Please send the exact amount below by Interac e-transfer.</p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0;">
          <tr><td style="padding:10px 0;color:#6d7b73;">Send to</td><td style="padding:10px 0;text-align:right;font-weight:bold;overflow-wrap:anywhere;">${escapeHtml_(SITE_CONFIG.eTransferAddress)}</td></tr>
          <tr><td style="padding:10px 0;color:#6d7b73;">Amount</td><td style="padding:10px 0;text-align:right;font-weight:bold;">$${amount.toFixed(2)}</td></tr>
          <tr><td style="padding:10px 0;color:#6d7b73;">Tickets</td><td style="padding:10px 0;text-align:right;font-weight:bold;">${quantity}</td></tr>
          <tr><td style="padding:10px 0;color:#6d7b73;">Order reference</td><td style="padding:10px 0;text-align:right;font-weight:bold;">${escapeHtml_(record.orderId)}</td></tr>
        </table>
        <p>Include the order reference in the transfer message if you can. Ticket numbers are emailed after payment is confirmed.</p>
        <p>Draw: <strong>${escapeHtml_(formatPublicDateTime_(SITE_CONFIG.drawDate))}</strong></p>
        <p><a href="${escapeHtml_(SITE_CONFIG.publicWebsiteUrl)}" style="color:#173f35;font-weight:bold;">Open the draw website</a></p>
        <p><strong>Ben and Tori</strong></p>
      </div>
    </div>`;

  MailApp.sendEmail({ to: record.email, subject, body: plainText, htmlBody });
}

function getSelectedOrderRow_(ordersSheet) {
  const activeSheet = SpreadsheetApp.getActiveSheet();
  if (!activeSheet || activeSheet.getName() !== ordersSheet.getName()) {
    throw new Error("Select a row on the Orders sheet first.");
  }

  const rowNumber = activeSheet.getActiveRange().getRow();
  if (rowNumber <= 1) throw new Error("Select an order row below the header.");
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
    orderId: String(row[ORDER_COLUMN.orderId - 1] || "").trim(),
    fullName: String(row[ORDER_COLUMN.fullName - 1] || "").trim(),
    email: String(row[ORDER_COLUMN.email - 1] || "").trim(),
    phone: String(row[ORDER_COLUMN.phone - 1] || "").trim(),
    eTransferName: String(row[ORDER_COLUMN.eTransferName - 1] || "").trim(),
    packageId: String(row[ORDER_COLUMN.packageId - 1] || "").trim(),
    packageDisplay: String(row[ORDER_COLUMN.packageDisplay - 1] || "").trim(),
    ticketCount: row[ORDER_COLUMN.ticketCount - 1],
    amountDue: row[ORDER_COLUMN.amountDue - 1],
    message: String(row[ORDER_COLUMN.message - 1] || "").trim(),
    paymentStatus: String(row[ORDER_COLUMN.paymentStatus - 1] || "").trim(),
    paymentConfirmedAt: row[ORDER_COLUMN.paymentConfirmedAt - 1],
    ticketNumbers: String(row[ORDER_COLUMN.ticketNumbers - 1] || "").trim(),
    confirmationSent: String(row[ORDER_COLUMN.confirmationSent - 1] || "").trim(),
    notes: String(row[ORDER_COLUMN.notes - 1] || "").trim(),
    paymentInstructionsSent: String(row[ORDER_COLUMN.paymentInstructionsSent - 1] || "").trim(),
  };
}

function getOrCreateSheet_(sheetName, headers) {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const existingColumnCount = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, existingColumnCount).getValues()[0];
  const hasAnyHeaders = current.some((value) => String(value || "").trim() !== "");

  if (!hasAnyHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const comparableHeaders = current.slice(0, Math.min(current.length, headers.length));
    const hasExpectedPrefix = comparableHeaders.every((header, index) => header === headers[index]);
    if (!hasExpectedPrefix || current.length > headers.length) {
      throw new Error(`The ${sheet.getName()} sheet has unexpected headers. Fix the header row before continuing.`);
    }
    if (current.length < headers.length) {
      sheet.getRange(1, current.length + 1, 1, headers.length - current.length).setValues([headers.slice(current.length)]);
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

function getPackageDefinition_(packageId) {
  return PACKAGE_DEFINITIONS[packageId] || null;
}

function calculateAmountForQuantity_(quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return 0;
  return Math.floor(quantity / 3) * 25 + (quantity % 3) * 10;
}

function parseTicketQuantity_(value) {
  const text = String(value === null || value === undefined ? "" : value).trim();
  if (!/^\d+$/.test(text)) return null;
  const quantity = Number(text);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 99 ? quantity : null;
}

function getQuantityPackageDefinition_(ticketQuantity) {
  const amount = calculateAmountForQuantity_(ticketQuantity);
  if (!amount) return null;
  return {
    display: `${ticketQuantity} Ticket${ticketQuantity === 1 ? "" : "s"}`,
    ticketCount: ticketQuantity,
    amount,
  };
}

function getOrderPackageDefinition_(record) {
  if (record.packageId === "quantity") {
    return getQuantityPackageDefinition_(parseTicketQuantity_(record.ticketCount));
  }
  return getPackageDefinition_(record.packageId);
}

function getTicketNumbers_(value) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((ticketNumber) => ticketNumber.trim())
    .filter((ticketNumber) => /^\d{4}$/.test(ticketNumber));
}

function formatTicketNumber_(number) {
  return String(number).padStart(4, "0");
}

function orderIdExists_(ordersSheet, orderId) {
  const lastRow = ordersSheet.getLastRow();
  if (lastRow <= 1) return false;
  const orderIds = ordersSheet.getRange(2, ORDER_COLUMN.orderId, lastRow - 1, 1).getValues();
  return orderIds.some((row) => String(row[0] || "").trim().toUpperCase() === orderId);
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

function asBoolean_(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function calculateWinnerPrize_(confirmedSales) {
  return Math.round(Math.max(0, Number(confirmedSales) || 0) * 0.5 * 100) / 100;
}

function getLastSummaryUpdate_() {
  return PropertiesService.getScriptProperties().getProperty("SUMMARY_LAST_UPDATED") || "Not updated yet";
}

function formatDate_(date) {
  return Utilities.formatDate(date, SITE_CONFIG.timezone, "yyyy-MM-dd HH:mm");
}

function formatPublicDateTime_(value) {
  if (!value || String(value).toUpperCase().startsWith("TODO")) return "Date and time to be announced";
  return Utilities.formatDate(new Date(value), SITE_CONFIG.timezone, "MMMM d, yyyy 'at' h:mm a");
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
