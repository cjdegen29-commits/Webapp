
// Add new code above if possible.
// ============================================================================
//  BrandmarAPI: Client-Side SDK for Distributor OCR Processor
/**
 * @file app.js
 * @description Client-side SDK and logic for the Distributor OCR Processor.
 *
 * HOW TO USE THIS API (For HTML/Frontend Developer):
 * * This file exposes a global object called `BrandmarAPI`. You can call these methods 
 * from anywhere in your frontend code without worrying about DOM element IDs.
 * * Core Methods:
 * - BrandmarAPI.isAuthenticated() -> Checks if the user has an active Google session.
 * - BrandmarAPI.getAvailableWorkbooks() -> Returns an array of valid Google Sheets.
 * - BrandmarAPI.compressImage(file) -> Utility to shrink images before sending to save bandwidth/tokens.
 * - BrandmarAPI.processReceipts(files) -> Sends images to Gemini AI and returns extracted JSON data.
 * - BrandmarAPI.exportToSheet(sheetId, data) -> Pushes the final JSON data into the selected Google Sheet.
 * * Note: The bottom half of this file contains temporary UI bindings for `index.html`. 
 * You can safely delete or replace the "UI LOGIC & EVENT LISTENERS" section when building the final interface, unless you find it useful.
 */

globalThis.BrandmarAPI = {
    /**
     * Checks if the user is currently authenticated with a valid session.
     * Useful for determining whether to show the Login button or the main app interface.
     * * @returns {Promise<boolean>} - True if authenticated, false otherwise.
     */
    async isAuthenticated() {
        try {
            await this.getAvailableWorkbooks();
            return true;
        } catch (error) {
            console.error('isAuthenticated error:', error);
            return false;
        }
    },

    /**
     * Fetches a list of available Google Sheets workbooks that the user can export to.
     * Filters automatically based on the backend regex (e.g., "Brandmar Holdings 202X").
     * * @returns {Promise<Array>} - A promise resolving to an array of available workbook objects {id, name}.
     * @throws {Error} - Throws "unauthorized" if the user needs to log in.
     */
    async getAvailableWorkbooks() {
        const response = await fetch('/api/workbooks', { method: 'GET' });
        if (!response.ok) {
            if (response.status === 401) throw new Error("unauthorized");
            throw new Error("Failed to fetch workbooks");
        }
        return await response.json(); 
    },

    /**
     * Native Image Compression for Token Reduction.
     * Shrinks large photos client-side before they are sent to the server.
     * * @param {File} file - The raw image file from the input element.
     * @param {number} [maxDimension=1200] - The maximum width or height.
     * @param {number} [quality=0.85] - JPEG compression quality (0.0 to 1.0).
     * @returns {Promise<File>} - The compressed image file.
     */
    async compressImage(file, maxDimension = 1200, quality = 0.85) {
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
    },

    /**
     * Takes an array of image files, sends them to the backend for OCR processing, 
     * and returns the structured JSON extracted by Gemini.
     * * @param {File[]} imageFiles - Array of image files (ideally compressed first) to process.
     * @returns {Promise<Object>} - A promise resolving to the extracted JSON data payload.
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

    /**
     * Exports the verified OCR data to the specified Google Sheet.
     * * @param {string} spreadsheetId - The target Google Sheet ID selected by the user.
     * @param {Object} extractedData - The JSON data payload containing the receipt info.
     * @returns {Promise<Object>} - The server response containing success status and any validation warnings.
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

/* ==========================================================================
   UI LOGIC & EVENT LISTENERS (Example Implementation)
   Note for HTML Dev: This section handles the temporary index.html UI. 
   You can delete everything below this line when building the final interface.
   ========================================================================== */

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

document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('auth-section');
    const workbookSection = document.getElementById('workbook-section');
    const workbookSelect = document.getElementById('workbook-select');
    const exportBtn = document.getElementById('export-btn');
    const statusMsg = document.getElementById('status-message'); // Corrected to match index.html
    const jsonOutput = document.getElementById('json-output');

    // Check Auth and Load Workbooks on Page Load
    try {
        const workbooks = await globalThis.BrandmarAPI.getAvailableWorkbooks();
        
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

    // The Export Button Listener
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

            const result = await globalThis.BrandmarAPI.exportToSheet(selectedSheetId, dataToExport);
            
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

    // The Form Submit Listener
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
            // Compress images to save bandwidth and API tokens utilizing the core API
            const compressedFiles = await Promise.all(files.map(f => globalThis.BrandmarAPI.compressImage(f)));
            
            // Render the debug images to the DOM
            renderDebugImages(compressedFiles);

            // Send to the backend API utilizing the core API
            const extractedData = await globalThis.BrandmarAPI.processReceipts(compressedFiles);

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