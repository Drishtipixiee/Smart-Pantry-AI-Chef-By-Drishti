const API_URL = '';

// --- DOM Elements ---
const pantryList = document.getElementById('pantry-list');
const addItemForm = document.getElementById('add-item-form');
const editModal = document.getElementById('edit-modal');
const closeBtn = document.querySelector('.close-btn');
const editItemForm = document.getElementById('edit-item-form');
const chefSuggestBtn = document.getElementById('chef-suggest-btn');
const suggestionsDiv = document.getElementById('chef-suggestions');
const ingredientChecklistDiv = document.getElementById('ingredient-checklist');
const expiryChartCanvas = document.getElementById('expiry-chart').getContext('2d');
const totalItemsDiv = document.getElementById('total-items');
let pantryChart = null;

// --- Barcode Scanner Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const html5QrCode = new Html5Qrcode("qr-reader", { verbose: false });
    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        onScanSuccess(decodedText, decodedResult);
        html5QrCode.stop().then(ignore => {
            document.getElementById('qr-reader').style.display = 'none';
        }).catch(err => console.error("Failed to stop scanner", err));
    };
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    document.getElementById('toggle-scanner-btn').addEventListener('click', () => {
        const scannerDiv = document.getElementById('qr-reader');
        if (scannerDiv.style.display === 'none') {
            scannerDiv.style.display = 'block';
            html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
                .catch(err => console.log("Camera start failed"));
        } else {
            scannerDiv.style.display = 'none';
            html5QrCode.stop().catch(err => console.error("Failed to stop scanner cleanly"));
        }
    });

    document.getElementById('barcode-file-input').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const result = await html5QrCode.scanFile(file, true);
            onScanSuccess(result.decodedText, result);
        } catch (err) {
            alert('Could not find a barcode in the uploaded image.');
        }
    });
});

function onScanSuccess(decodedText, decodedResult) {
    lookupBarcode(decodedText);
}

async function lookupBarcode(barcode) {
    try {
        const response = await fetch(`${API_URL}/lookup_barcode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: barcode }),
        });
        const product = await response.json();
        if (product.name) {
            document.getElementById('item-name').value = product.name;
            if (product.expiry_date) {
                document.getElementById('item-expiry').value = product.expiry_date;
            }
            alert(`Found product: ${product.name}`);
        } else {
            alert('Product not found in the database.');
        }
    } catch (error) {
        alert('Could not connect to the barcode lookup service.');
    }
}

// --- Analytics Dashboard Function ---
const updateDashboard = (items) => {
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const okCount = items.filter(i => i.expiry_status === 'OK').length;
    const nearExpiryCount = items.filter(i => i.expiry_status === 'NEAR_EXPIRY').length;
    const expiredCount = items.filter(i => i.expiry_status === 'EXPIRED').length;
    totalItemsDiv.innerHTML = `Total Items: <span>${totalItems}</span>`;
    if (pantryChart) pantryChart.destroy();
    pantryChart = new Chart(expiryChartCanvas, {
        type: 'doughnut',
        data: {
            labels: ['OK', 'Near Expiry', 'Expired'],
            datasets: [{
                label: 'Pantry Status',
                data: [okCount, nearExpiryCount, expiredCount],
                backgroundColor: ['rgba(46, 204, 113, 0.7)','rgba(241, 196, 15, 0.7)','rgba(231, 76, 60, 0.7)'],
                borderColor: ['#2ECC71', '#F1C40F', '#E74C3C'],
                borderWidth: 1
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });
};

// --- Core App Functions ---
const showEditModal = (item) => {
    document.getElementById('edit-item-id').value = item.id;
    document.getElementById('edit-item-name').value = item.name;
    document.getElementById('edit-item-expiry').value = item.expiry_date;
    document.getElementById('edit-item-quantity').value = item.quantity;
    editModal.style.display = 'block';
};
const hideEditModal = () => { editModal.style.display = 'none'; };
const deleteItem = async (itemId) => {
    try {
        await fetch(`${API_URL}/items/${itemId}`, { method: 'DELETE' });
        fetchAndDisplayItems();
    } catch (error) { console.error('Error deleting item:', error); }
};

const fetchAndDisplayItems = async () => {
    try {
        const response = await fetch(`${API_URL}/items`);
        const items = await response.json();
        updateDashboard(items);
        pantryList.innerHTML = '';
        ingredientChecklistDiv.innerHTML = '';
        const availableItems = items.filter(item => item.expiry_status !== 'EXPIRED');
        availableItems.forEach(item => {
            const label = document.createElement('label'); label.className = 'ingredient-label';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = item.name;
            const span = document.createElement('span'); span.textContent = item.name;
            label.appendChild(checkbox); label.appendChild(span);
            ingredientChecklistDiv.appendChild(label);
        });
        items.forEach(item => {
            const li = document.createElement('li');
            const itemText = document.createElement('span'); itemText.textContent = `${item.name} (Qty: ${item.quantity}) - Expires: ${item.expiry_date} [Status: ${item.expiry_status}]`;
            const buttonContainer = document.createElement('div');
            const editButton = document.createElement('button'); editButton.textContent = 'Edit'; editButton.className = 'edit-btn'; editButton.onclick = () => showEditModal(item);
            const deleteButton = document.createElement('button'); deleteButton.textContent = 'Delete'; deleteButton.className = 'delete-btn'; deleteButton.onclick = () => deleteItem(item.id);
            buttonContainer.appendChild(editButton); buttonContainer.appendChild(deleteButton);
            li.appendChild(itemText); li.appendChild(buttonContainer);
            pantryList.appendChild(li);
        });
    } catch (error) { console.error('Error fetching items:', error); }
};

// --- Event Listeners ---
closeBtn.onclick = hideEditModal;
window.onclick = (event) => { if (event.target == editModal) { hideEditModal(); } };
addItemForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newItem = { name: document.getElementById('item-name').value, expiry_date: document.getElementById('item-expiry').value, quantity: document.getElementById('item-quantity').value };
    try {
        await fetch(`${API_URL}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newItem) });
        fetchAndDisplayItems();
        addItemForm.reset();
    } catch (error) { console.error('Error adding item:', error); }
});
editItemForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const itemId = document.getElementById('edit-item-id').value;
    const updatedItem = { name: document.getElementById('edit-item-name').value, expiry_date: document.getElementById('edit-item-expiry').value, quantity: document.getElementById('edit-item-quantity').value };
    try {
        await fetch(`${API_URL}/items/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedItem) });
        hideEditModal();
        fetchAndDisplayItems();
    } catch (error) { console.error('Error updating item:', error); }
});
chefSuggestBtn.addEventListener('click', async () => {
    const selectedCheckboxes = ingredientChecklistDiv.querySelectorAll('input:checked');
    const selectedIngredients = Array.from(selectedCheckboxes).map(cb => cb.value);
    suggestionsDiv.innerHTML = '🧠 Generating recipe...';
    suggestionsDiv.style.display = 'block';
    try {
        const response = await fetch(`${API_URL}/chef/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredients: selectedIngredients }) });
        const result = await response.json();
        if (result.error) {
            suggestionsDiv.innerHTML = `<p>Error: ${result.error}</p>`;
        } else {
            suggestionsDiv.innerHTML = `<h3>Generated Recipe:</h3><p>${result.recipe}</p>`;
        }
    } catch (error) {
        suggestionsDiv.innerHTML = `<p>Could not connect to the recipe generator.</p>`;
    }
});

// --- Initial Load ---
fetchAndDisplayItems();