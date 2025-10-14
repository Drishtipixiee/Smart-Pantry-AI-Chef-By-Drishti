// The base URL of your Flask API
const API_URL = 'http://127.0.0.1:5000';

const pantryList = document.getElementById('pantry-list');
const addItemForm = document.getElementById('add-item-form');

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
        pantryList.innerHTML = '';
        items.forEach(item => {
            const li = document.createElement('li');
            const itemText = document.createElement('span');
            itemText.textContent = `${item.name} (Qty: ${item.quantity}) - Expires: ${item.expiry_date} [Status: ${item.expiry_status}]`;
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.className = 'delete-btn';
            deleteButton.onclick = () => deleteItem(item.id);
            li.appendChild(itemText);
            li.appendChild(deleteButton);
            pantryList.appendChild(li);
        });
    } catch (error) { console.error('Error fetching items:', error); }
};

addItemForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newItem = {
        name: document.getElementById('item-name').value,
        expiry_date: document.getElementById('item-expiry').value,
        quantity: document.getElementById('item-quantity').value
    };
    try {
        await fetch(`${API_URL}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newItem),
        });
        fetchAndDisplayItems();
        addItemForm.reset();
    } catch (error) { console.error('Error adding item:', error); }
});

fetchAndDisplayItems();