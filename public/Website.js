document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const authSection = document.getElementById('auth-section');
    const workbookSection = document.getElementById('workbook-section');
    const workbookSelect = document.getElementById('workbook-select');
    const receiptInput = document.getElementById('receiptInput');
    const previewContainer = document.getElementById('preview-container');
    const ocrForm = document.getElementById('ocr-form');
    const submitBtn = document.getElementById('submit-btn');
    const resultSection = document.getElementById('result-section');
    const jsonOutput = document.getElementById('json-output');
    const exportBtn = document.getElementById('export-btn');

    // ========================================================================
    // 1. Authentication & Initialization
    // ========================================================================
    try {
        const isAuth = await BrandmarAPI.isAuthenticated();
        if (isAuth) {
            authSection.hidden = true;
            workbookSection.hidden = false;
            
            const workbooks = await BrandmarAPI.getAvailableWorkbooks();
            workbookSelect.innerHTML = ''; 
            
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
        } else {
            // User is not logged in
            authSection.hidden = false;
            workbookSection.hidden = true;
        }
    } catch (error) {
        authSection.hidden = false;
        workbookSection.hidden = true;
        console.error("Auth check failed:", error);
    }

    // ========================================================================
    // 2. Handle Continuous Camera Scanning
    // ========================================================================
    const addPhotoBtn = document.getElementById('add-photo-btn');
    let scannedFiles = []; // Array to hold our captured photos

    // Trigger the hidden camera input when the button is clicked
    addPhotoBtn.addEventListener('click', () => {
        receiptInput.click();
    });

    // When the input returns photo(s), add them to our array and update the UI
    receiptInput.addEventListener('change', (e) => {
        // Convert the FileList object to a standard JavaScript array
        const newFiles = Array.from(e.target.files);
        
        if (newFiles.length === 0) return;

        // Push every selected file into our staging array
        newFiles.forEach(file => {
            scannedFiles.push(file);
        });

        updatePreviews();
        
        // Reset the input value so the same filename can be selected again if needed
        receiptInput.value = ''; 
    });

    function updatePreviews() {
        previewContainer.innerHTML = ''; 
        
        scannedFiles.forEach((file, index) => {
            // Create a wrapper for the image and its delete button
            const wrapper = document.createElement('div');
            wrapper.className = 'preview-wrapper'; // <--- ADD THIS LINE
            
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.className = 'preview-img';
            img.alt = `Scanned Page ${index + 1}`;
            
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = 'Remove';
            removeBtn.onclick = () => {
                scannedFiles.splice(index, 1); // Remove from array
                updatePreviews(); // Re-render
            };

            wrapper.appendChild(img);
            wrapper.appendChild(removeBtn);
            previewContainer.appendChild(wrapper);
        });

        // Enable the submit button only if we have at least one photo
        submitBtn.disabled = scannedFiles.length === 0;
    }

    // ========================================================================
    // 3. Process Receipts via SDK
    // ========================================================================
    ocrForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Use our JavaScript array instead of the input element's files
        if (scannedFiles.length === 0) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
        showStatus('Compressing images and sending to AI...', 'info');
        resultSection.hidden = true;

        try {
            const compressedFiles = await Promise.all(scannedFiles.map(f => BrandmarAPI.compressImage(f)));
            const extractedData = await BrandmarAPI.processReceipts(compressedFiles);

            jsonOutput.value = JSON.stringify(extractedData, null, 2);
            resultSection.hidden = false;
            
            if (extractedData.metadata?.dates_consistent === false) {
                showStatus('Warning: Dates across receipts do not match. Please verify carefully.', 'warning'); // UPDATED
            } else {
                showStatus('Extraction complete! Review data below.', 'success'); // UPDATED
            }

        } catch (error) {
            showStatus(`Error: ${error.message}`, 'error'); // UPDATED
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Process Receipts';
        }
    });

    // ========================================================================
    // 4. Export to Google Sheets via SDK
    // ========================================================================
    exportBtn.addEventListener('click', async () => {
        try {
            const dataToExport = JSON.parse(jsonOutput.value);
            const selectedSheetId = workbookSelect.value;

            if (!selectedSheetId) {
                showStatus('Please select a target workbook.', 'error'); // UPDATED
                return;
            }

            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting...';
            showStatus('Pushing to Google Sheets...', 'info'); // UPDATED

            const result = await BrandmarAPI.exportToSheet(selectedSheetId, dataToExport);
            
            if (result.warning) {
                showStatus(`Warning: ${result.warning}`, 'warning'); // UPDATED
            } else {
                showStatus('Successfully added to Google Sheets!', 'success'); // UPDATED
            }
            
        } catch (error) {
            showStatus(`Export Error: ${error.message}`, 'error'); // UPDATED
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = 'Confirm & Send to Sheets';
        }
    });
});

// Helper function to update the status box UI
    function showStatus(message, type = 'info') {
        statusBox.textContent = message;
        statusBox.className = type; // Applies 'info', 'success', 'error', or 'warning'
    }