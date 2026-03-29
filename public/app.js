/**
 * @file app.js
 * @description Client-side logic for the Distributor OCR Processor.
 *
 * USAGE:
 * 1. User selects up to 3 receipt images and submits the form (#ocr-form).
 * 2. Images are compressed client-side, displayed for debugging, and sent to the backend for OCR processing.
 * 3. OCR results are shown in a textarea (#json-output).
 * 4. User can edit the JSON and export it to Google Sheets using the export button (#export-btn).
 * 5. Status and error messages are displayed in #status-message.
 */

/**
 * BRANDMAR OCR - FRONTEND API
 * All network calls are encapsulated here for easy UI integration.
 */
const BrandmarAPI = {
    // 1. Process images through Gemini
    /**
     * processReceipts - Takes an array of image files, sends them to the backend for OCR processing, and returns the extracted data.
     * @param {File[]} imageFiles - Array of image files to process.
     * @returns {Promise<Object>} - A promise resolving to the extracted data.
     */
    async processReceipts(imageFiles) {
        const formData = new FormData();
        // Updated to 'receipts' to match what process.js is looking for
        imageFiles.forEach(file => formData.append('receipts', file));

        const response = await fetch('/api/process', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error(await response.text());
        return await response.json();
    },

    // 2. Fetch available workbooks from Google Drive
    /**
     * getAvailableWorkbooks - Fetches a list of available Google Sheets workbooks that the user can export to.
     * @returns {Promise<Array>} - A promise resolving to an array of available workbooks.
     */
    async getAvailableWorkbooks() {
        const response = await fetch('/api/workbooks', { method: 'GET' });
        if (!response.ok) {
            if (response.status === 401) throw new Error("unauthorized");
            throw new Error("Failed to fetch workbooks");
        }
        return await response.json(); 
    },

    // 3. Export data to the selected sheet
    /**
     * exportToSheet - Exports the extracted data to the specified Google Sheet.
     * @param {string} spreadsheetId - The ID of the target spreadsheet.
     * @param {Object} extractedData - The data to export.
     * @returns {Promise<Object>} - A promise resolving to the export result.
     */
    async exportToSheet(spreadsheetId, extractedData) {
        // Attach the target ID to the payload
        const payload = { target_spreadsheet_id: spreadsheetId, ...extractedData };
        const response = await fetch('/api/sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(await response.text());
        return await response.json();
    }
};

// Native Image Compression for Token Reduction
async function compressImage(file, maxDimension = 1200, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = handleReaderLoad;
        reader.onerror = (error) => reject(new Error(error?.message || error?.type || 'FileReader error'));

        function handleReaderLoad(event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => handleImageLoad(img);
            img.onerror = (error) => reject(new Error(error?.message || error?.type || 'FileReader error'));
        }

        function handleImageLoad(img) {
            let width = img.width;
            let height = img.height;

            if (width > height && width > maxDimension) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
            } else if (height > maxDimension) {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(handleCanvasBlob, 'image/jpeg', quality);
        }

        function handleCanvasBlob(blob) {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                type: 'image/jpeg',
                lastModified: Date.now()
            }));
        }
    });
}

// Helper to render compressed images to the DOM for debugging
function renderDebugImages(compressedFiles) {
    let debugContainer = document.getElementById('debug-images');
    if (!debugContainer) {
        debugContainer = document.createElement('div');
        debugContainer.id = 'debug-images';
        debugContainer.style.marginTop = '20px';
        debugContainer.style.display = 'flex';
        debugContainer.style.gap = '10px';
        debugContainer.style.overflowX = 'auto';
        document.getElementById('ocr-form').after(debugContainer);
    }
    
    debugContainer.innerHTML = '<h4>Debug: Compressed Images Sent to AI</h4>';
    
    compressedFiles.forEach(file => {
        const imgUrl = URL.createObjectURL(file);
        const imgElem = document.createElement('img');
        imgElem.src = imgUrl;
        imgElem.style.maxHeight = '200px';
        imgElem.style.border = '1px solid #ccc';
        imgElem.title = `Size: ${(file.size / 1024).toFixed(1)} KB`;
        debugContainer.appendChild(imgElem);
    });
}

/**
 * UI LOGIC & EVENT LISTENERS
 */
document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('auth-section');
    const workbookSection = document.getElementById('workbook-section');
    const workbookSelect = document.getElementById('workbook-select');
    const exportBtn = document.getElementById('export-btn');
    const statusMsg = document.getElementById('status-message'); // Corrected to match index.html
    const jsonOutput = document.getElementById('json-output');

    // 1. Check Auth and Load Workbooks on Page Load
    try {
        const workbooks = await BrandmarAPI.getAvailableWorkbooks();
        
        // If successful, user is logged in. Hide Auth, show Workbook Dropdown.
        authSection.style.display = 'none';
        workbookSection.style.display = 'block';
        
        // Populate the dropdown
        workbookSelect.innerHTML = ''; // Clear loading text
        if (workbooks.length === 0) {
            workbookSelect.innerHTML = '<option value="">No Brandmar workbooks found</option>';
        } else {
            workbooks.forEach(sheet => {
                const option = document.createElement('option');
                option.value = sheet.id;
                option.textContent = sheet.name;
                workbookSelect.appendChild(option);
            });
        }
    } catch (error) {
        if (error.message === "unauthorized") {
            // User needs to log in. Show Auth, hide Workbooks.
            authSection.style.display = 'block';
            workbookSection.style.display = 'none';
        } else {
            console.error("Error loading workbooks:", error);
            workbookSelect.innerHTML = '<option value="">Error loading workbooks</option>';
        }
    }

    // 2. The Export Button Listener
    exportBtn.addEventListener('click', async () => {
        try {
            // Read directly from the textarea so any manual user edits are captured
            const dataToExport = JSON.parse(jsonOutput.value);
            
            if (!dataToExport) {
                statusMsg.innerHTML = `<span style="color: red;">No data to export. Please process images first.</span>`;
                return;
            }

            const selectedSheetId = workbookSelect.value;
            if (!selectedSheetId) {
                statusMsg.innerHTML = `<span style="color: red;">Please select a target workbook.</span>`;
                return;
            }

            exportBtn.disabled = true;
            statusMsg.innerHTML = 'Pushing to Google Sheets...';

            const result = await BrandmarAPI.exportToSheet(selectedSheetId, dataToExport);
            
            // Handle validation warnings (e.g., Column P vs Q mismatch)
            if (result.warning) {
                statusMsg.innerHTML = `<span style="color: #d97706; font-weight: bold; border: 1px solid #d97706; padding: 5px; display: block;">⚠️ Warning: ${result.warning}</span>`;
            } else {
                statusMsg.innerHTML = '<span style="color: green; font-weight: bold;">Successfully added to Google Sheets!</span>';
            }
            
        } catch (error) {
            statusMsg.innerHTML = `<span style="color: red; font-weight: bold;">Export Error: ${error.message}</span>`;
        } finally {
            exportBtn.disabled = false;
        }
    });

    // 3. The Form Submit Listener
    const ocrForm = document.getElementById('ocr-form');
    const submitBtn = document.getElementById('submit-btn');

    ocrForm.addEventListener('submit', async (e) => {
        // Prevent the browser from refreshing the page
        e.preventDefault();

        const fileInput = document.getElementById('receipts');
        const files = Array.from(fileInput.files);

        if (files.length === 0) return;

        // Update UI to show loading state
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
        statusMsg.innerHTML = 'Compressing images and sending to AI...';
        jsonOutput.value = 'Processing...';
        exportBtn.style.display = 'none';

        try {
            // Compress images to save bandwidth and API tokens
            const compressedFiles = await Promise.all(files.map(f => compressImage(f)));
            
            // Render the debug images to the DOM
            renderDebugImages(compressedFiles);

            // Send to the backend API
            const extractedData = await BrandmarAPI.processReceipts(compressedFiles);

            // Update UI with the results
            jsonOutput.value = JSON.stringify(extractedData, null, 2);
            
            // Flag to the user if the dates on the receipts don't match
            if (extractedData.metadata?.dates_consistent === false) {
                 statusMsg.innerHTML = '<span style="color: orange; font-weight: bold;">Warning: Dates across receipts do not match. Please verify the data carefully before exporting.</span>';
            } else {
                 statusMsg.innerHTML = '<span style="color: green; font-weight: bold;">Extraction complete! Review and edit the data below before exporting.</span>';
            }
            
            // Reveal the export button
            exportBtn.style.display = 'block';

        } catch (error) {
            statusMsg.innerHTML = `<span style="color: red; font-weight: bold;">Error: ${error.message}</span>`;
            jsonOutput.value = '';
        } finally {
            // Reset the submit button
            submitBtn.disabled = false;
            submitBtn.textContent = 'Process Receipts';
        }
    });
});