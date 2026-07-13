import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const source = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

describe("Apps Script contract", () => {
  it("uses the same quantity pricing formula as the frontend", () => {
    const functionMatch = source.match(/function calculateAmountForQuantity_\(quantity\) \{([\s\S]*?)\n\}/);
    assert.ok(functionMatch, "backend pricing function should exist");
    const calculateBackendAmount = new Function("quantity", functionMatch[1]);
    const expected = new Map([[1, 10], [2, 20], [3, 25], [4, 35], [5, 45], [6, 50], [7, 60], [8, 70], [9, 75], [12, 100], [99, 825]]);
    for (const [quantity, amount] of expected) assert.equal(calculateBackendAmount(quantity), amount);
    assert.equal(calculateBackendAmount(100), 0);
    assert.doesNotMatch(source, /request\.amount/);
  });

  it("accepts quantity and legacy package paths while returning trusted fields", () => {
    assert.match(source, /request\.ticketQuantity/);
    assert.match(source, /request\.quantity/);
    assert.match(source, /packageId: storedPackageId/);
    assert.match(source, /ticketQuantity: payload\.ticketCount/);
    assert.match(source, /amountDue: payload\.amountDue/);
    assert.match(source, /Payment Instructions Sent/);
    assert.match(source, /Re-send Payment Instructions/);
  });

  it("keeps paid-ticket expansion, refunds, and email copy wired", () => {
    assert.match(source, /getTicketNumbers_\(record\.ticketNumbers\)\.forEach/);
    assert.match(source, /function markSelectedOrderRefunded/);
    assert.match(source, /Your Wedding 50\/50 Ticket Numbers/);
    assert.match(source, /Your payment is confirmed — good luck!/);
    assert.match(source, /sendPaymentInstructionsEmail_\(payload\)/);
  });
});
