/**
 * Advanced Parser for Old Dutch Distributor Reports
 * @param {string} text - The raw OCR text extracted from the receipt image
 * @returns {object} - Structured data with report type, date, and key metrics
 * @returns {object} - An object containing the report type, date, and extracted financial metrics. If the report type is unrecognized, an error message is included.
 * 
 * This function is designed to handle the unique formatting of Old Dutch distributor reports, which can vary significantly in structure. It identifies the report type based on specific keywords and extracts relevant financial metrics accordingly. The parser is robust against variations in spacing and formatting, making it suitable for real-world OCR outputs that may not be perfectly clean.
 */
function parseOldDutchReceipt(text) {
    const lines = text.split('\n');
    const result = {
        reportType: 'Unknown',
        date: null,
        data: {}
    };

    // 1. Identify Date (Format: Mar/04/2026)
    const dateRegex = /([A-Z][a-z]{2}\/\d{2}\/\d{4})/;
    const dateMatch = new RegExp(dateRegex).exec(text);
    if (dateMatch) result.date = dateMatch[0];

    // 2. Identify Report Type and Extract Data
    if (text.includes("DISTRIBUTOR'S SUMMARY")) {
        parseOldDutchSummary(lines);
    } else if (text.includes("DISTRIBUTOR'S GROSS PROFIT")) {
        parseOldDutchDistGrossProfit(lines);
    } else if (text.includes("PAYMENTS RECEIVED REPORT")) {
        parseOldDutchPaymentsReceived(lines);
    } else {
        return { ...result, error: 'Unrecognized report type. Please verify the input.' };
    }

    return result;
}

/**
 * Helper to parse the Payments Received report which has a unique structure with dual-column Absorptions
 */
function parseOldDutchPaymentsReceived(lines) {
    result.reportType = "Payments";
    result.data.totalCash = findValueNextTo(lines, "Total Cash:");
    result.data.totalChecks = findValueNextTo(lines, "Total Checks:");
}

/**
 * Helper to parse the Gross Profit report which has a unique structure with a single key metric
 */
function parseOldDutchDistGrossProfit(lines) {
    result.reportType = "Gross Profit";
    result.data.grossProfit = findValueNextTo(lines, "DISTRIBUTOR'S GROSS PROFIT");
}

/**
 *  Helper to parse the Summary report which has a unique structure with dual-column Absorptions
 */
function parseOldDutchSummary(lines) {
    result.reportType = "Summary";
    result.data.grossSales = findValueNextTo(lines, "GROSS SALES");
    result.data.gstHst = findValueNextTo(lines, "GST/HST CHARGED");
    result.data.odCredits = findValueNextTo(lines, "TOTAL OLD DUTCH CREDITS");
    
    // Handling the dual-column Absorptions (ODF and DIST)
    const absorpLine = lines.find(l => l.includes("TOTAL ABSORPTIONS"));
    if (absorpLine) {
        const values = absorpLine.match(/\d+\.\d{2}/g);
        if (values && values.length >= 2) {
            result.data.absorptionsODF = values[0];
            result.data.absorptionsDIST = values[1];
        }
    }
} 

/**
 * Helper to find a currency value on the same line as a label
 */
function findValueNextTo(lines, label) {
    const targetLine = lines.find(line => line.toUpperCase().includes(label.toUpperCase()));
    if (targetLine) {
        const match = targetLine.match(/\d+\.\d{2}/);
        return match ? match[0] : null;
    }
    return null;
}

export default { parseOldDutchReceipt };