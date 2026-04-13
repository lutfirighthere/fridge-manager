import "../keys.js"; // Initialize default app from keys.js
import { 
    getFirestore, collection, onSnapshot, 
    addDoc, doc, updateDoc, deleteDoc, serverTimestamp 
} from "firebase/firestore";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, setPersistence, browserLocalPersistence,
    signOut
} from "firebase/auth";

const db = getFirestore();
const auth = getAuth();

// Guarantee the session lasts practically forever on the device locally
setPersistence(auth, browserLocalPersistence);
const itemsCollection = collection(db, "fridgeItems");

let unsubscribeSnapshot = null;

// Auth DOM Elements
const authContainer = document.getElementById("auth-container");
const appContainer = document.getElementById("app-container");
const authForm = document.getElementById("auth-form");
const authPassword = document.getElementById("auth-password");
const authError = document.getElementById("auth-error");
const loadingSpinner = document.getElementById("loading-spinner");
const logoutBtn = document.getElementById("logout-btn");

const HARDCODED_EMAIL = "admin@blindfridge.app";

// Expose a quick hack for the developer console
window.forceLogout = () => {
    signOut(auth).then(() => console.log("Force logged out successfully!"));
};

// Fridge DOM Elements
const form = document.getElementById("item-form");
const nameInput = document.getElementById("item-name");
const quantityInput = document.getElementById("item-quantity");
const dateStoredInput = document.getElementById("item-date-stored");
const expiryInput = document.getElementById("item-expiry");
const editIdInput = document.getElementById("edit-id");
const submitBtn = document.getElementById("submit-btn");
const cancelBtn = document.getElementById("cancel-btn");
const formHeading = document.getElementById("form-heading");
const liveRegion = document.getElementById("live-region");

// Modal DOM Elements
const customModal = document.getElementById("custom-modal");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const modalActions = document.getElementById("modal-actions");

// Powerful Custom HTML Modal replacing alert/confirm
function showModal(title, message, buttons) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalActions.innerHTML = "";
        
        buttons.forEach(btnInfo => {
            const btn = document.createElement("button");
            btn.textContent = btnInfo.text;
            btn.className = btnInfo.class || "secondary-btn";
            btn.setAttribute("type", "button");
            
            // Basic styles if no classes explicitly dictate good backgrounds
            if (btnInfo.class === "primary-btn") {
                btn.style.backgroundColor = "var(--primary-color)";
                btn.style.color = "white";
                btn.style.border = "none";
            }
            
            btn.addEventListener("click", () => {
                customModal.classList.add("hidden");
                resolve(btnInfo.value);
            });
            modalActions.appendChild(btn);
        });
        
        customModal.classList.remove("hidden");
        // Accessibility: Trap focus to the first modal action
        const firstBtn = modalActions.querySelector("button");
        if(firstBtn) firstBtn.focus();
    });
}


// Restrict "Date Stored" to not allow future dates
const todayString = new Date().toISOString().split('T')[0];
dateStoredInput.max = todayString;

const inventoryList = document.getElementById("inventory-list");
const oldItemsList = document.getElementById("old-items-list");
const oldItemsSection = document.getElementById("old-items-section");
const emptyState = document.getElementById("empty-state");

let currentItems = [];

// Helper: Accessible Live Announcements
function announce(message) {
    liveRegion.textContent = message;
    // Clear out after short delay so repeated messages are announced properly
    setTimeout(() => {
        liveRegion.textContent = "";
    }, 3000);
}

// Logic: Check if item is getting old (past expiry or >7 days old if no expiry)
function isGettingOld(item) {
    const now = new Date();
    
    // Check expiry date
    if (item.expiryDate) {
        const expiry = new Date(item.expiryDate);
        // Expiry is today or in the past, or within next 2 days
        const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
        if (diffDays <= 2) {
            return true;
        }
        return false;
    }
    
    // Check time since added if no expiry exists
    if (item.dateStored) {
        const parts = item.dateStored.split('-');
        if (parts.length === 3) {
            const added = new Date(parts[0], parts[1]-1, parts[2]);
            const diffDays = (now - added) / (1000 * 60 * 60 * 24);
            if (diffDays >= 7) {
                return true;
            }
        }
    } else if (item.dateAdded && item.dateAdded.seconds) {
        const added = new Date(item.dateAdded.seconds * 1000);
        const diffDays = (now - added) / (1000 * 60 * 60 * 24);
        if (diffDays >= 7) {
            return true;
        }
    }
    return false;
}

// Format date for display
function formatDate(dateStr) {
    if (!dateStr) return "";
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    const parts = dateStr.split('-');
    if(parts.length === 3) {
      const d = new Date(parts[0], parts[1]-1, parts[2]);
      return d.toLocaleDateString(undefined, options);
    }
    return dateStr;
}

// Render the UI
function renderItems() {
    inventoryList.innerHTML = "";
    oldItemsList.innerHTML = "";
    
    let oldItemCount = 0;
    
    currentItems.forEach(item => {
        const old = isGettingOld(item);
        const li = document.createElement("li");
        li.className = `item-card ${old ? 'old-item' : ''}`;
        
        let metaHtml = "";
        if (item.quantity) {
            metaHtml += `<span>Quantity: ${item.quantity}</span>`;
            if (/\d+/.test(item.quantity)) {
                 metaHtml += `
                 <span class="quantity-controls">
                     <button type="button" class="icon-btn dec-btn" aria-label="Decrease quantity for ${item.name}">-</button>
                     <button type="button" class="icon-btn inc-btn" aria-label="Increase quantity for ${item.name}">+</button>
                 </span>`;
            }
        }
        if (item.expiryDate) {
            metaHtml += `<span class="${old ? 'warning-text' : ''}">Expires: ${formatDate(item.expiryDate)}</span>`;
        } else if (old) {
             metaHtml += `<span class="warning-text">Added over a week ago</span>`;
        } else if (item.dateStored) {
             metaHtml += `<span>Stored: ${formatDate(item.dateStored)}</span>`;
        }

        li.innerHTML = `
            <div class="item-details">
                <h3>${item.name} <span class="sr-only">${old ? '(Use soon)' : ''}</span></h3>
                <div class="item-meta">
                    ${metaHtml}
                </div>
            </div>
            <div class="item-actions">
                <button type="button" class="edit-btn" data-id="${item.id}" aria-label="Edit ${item.name}">Edit</button>
                <button type="button" class="delete-btn" data-id="${item.id}" aria-label="Delete ${item.name}">Delete</button>
            </div>
        `;
        
        // Add events
        li.querySelector(".edit-btn").addEventListener("click", () => setupEdit(item));
        li.querySelector(".delete-btn").addEventListener("click", () => deleteItem(item.id, item.name));
        
        const decBtn = li.querySelector(".dec-btn");
        if (decBtn) decBtn.addEventListener("click", () => changeQuantity(item, -1));
        
        const incBtn = li.querySelector(".inc-btn");
        if (incBtn) incBtn.addEventListener("click", () => changeQuantity(item, 1));
        
        if (old) {
            oldItemsList.appendChild(li);
            oldItemCount++;
        } else {
            inventoryList.appendChild(li);
        }
    });
    
    // Toggle visibilities
    if (oldItemCount > 0) {
        oldItemsSection.classList.remove("hidden");
    } else {
        oldItemsSection.classList.add("hidden");
    }
    
    if (currentItems.length - oldItemCount === 0) {
        emptyState.classList.remove("hidden");
    } else {
        emptyState.classList.add("hidden");
    }
}

// Set form to edit mode
function setupEdit(item) {
    editIdInput.value = item.id;
    nameInput.value = item.name;
    quantityInput.value = item.quantity || "";
    dateStoredInput.value = item.dateStored || "";
    expiryInput.value = item.expiryDate || "";
    
    submitBtn.textContent = "Update Item";
    submitBtn.setAttribute("aria-label", `Update item ${item.name}`);
    cancelBtn.classList.remove("hidden");
    formHeading.textContent = "Edit Item";
    
    // Move focus to form heading or input
    nameInput.focus();
    announce(`Editing ${item.name}. Form ready.`);
}

// Cancel edit
function cancelEdit() {
    editIdInput.value = "";
    form.reset();
    
    submitBtn.textContent = "Add Item";
    submitBtn.setAttribute("aria-label", "Add item to fridge");
    cancelBtn.classList.add("hidden");
    formHeading.textContent = "Add or Edit Item";
    
    announce("Edit cancelled. Form reset.");
}

// Quick increment / decrement
async function changeQuantity(item, delta) {
    if (!item.quantity) return;
    const match = item.quantity.match(/\d+/);
    if (match) {
        let num = parseInt(match[0], 10);
        num += delta;
        if (num < 0) num = 0;
        
        const newQuantity = item.quantity.replace(/\d+/, num);
        try {
            await updateDoc(doc(db, "fridgeItems", item.id), { quantity: newQuantity });
            if (delta > 0) {
                announce(`Increased quantity of ${item.name} to ${newQuantity}`);
            } else {
                announce(`Decreased quantity of ${item.name} to ${newQuantity}`);
            }
        } catch (error) {
            console.error("Error updating quantity:", error);
            announce("Error updating quantity.");
        }
    }
}

// Delete item
async function deleteItem(id, name) {
    const isConfirmed = await showModal(
        "Delete Item", 
        `Are you sure you want to remove ${name} from your fridge?`,
        [
            { text: "Cancel", value: false, class: "secondary-btn" },
            { text: "Delete", value: true, class: "delete-btn" }
        ]
    );

    if (isConfirmed) {
        try {
            await deleteDoc(doc(db, "fridgeItems", id));
            announce(`${name} removed from fridge.`);
        } catch (error) {
            console.error("Error deleting document: ", error);
            announce("Error removing item.");
        }
    }
}

// Handle form submit
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const id = editIdInput.value;
    const name = nameInput.value.trim();
    const quantity = quantityInput.value.trim();
    const dateStored = dateStoredInput.value;
    const expiryDate = expiryInput.value;
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Prevent future dates if inputted manually
    if (dateStored && dateStored > todayStr) {
        announce("Date stored cannot be in the future.");
        await showModal(
            "Invalid Date", 
            "Date Stored cannot be in the future!", 
            [{ text: "Okay", value: true, class: "primary-btn" }]
        );
        dateStoredInput.focus();
        return;
    }
    
    const itemData = {
        name,
        quantity: quantity || null,
        dateStored: dateStored || todayStr,
        expiryDate: expiryDate || null
    };
    
    try {
        if (id) {
            // Update
            await updateDoc(doc(db, "fridgeItems", id), itemData);
            announce(`${name} updated successfully.`);
        } else {
            // Add
            itemData.dateAdded = serverTimestamp();
            await addDoc(itemsCollection, itemData);
            announce(`${name} added to fridge.`);
        }
        
        cancelEdit(); // Resets form and UI to Add mode
        
    } catch (error) {
        console.error("Error saving document: ", error);
        announce("Error saving item.");
    }
});

// Cancel button event
cancelBtn.addEventListener("click", cancelEdit);

// Handle Logout
logoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (e) {
        console.error("Error signing out", e);
    }
});

// Handle Auth Actions
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.classList.add("hidden");
    const email = HARDCODED_EMAIL;
    const password = authPassword.value;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        try {
            // If sign-in fails because the master account doesn't exist yet, we create it.
            // But if it fails because it DOES exist, this createUser will also fail (email-already-in-use),
            // which safely means it was just an incorrect password!
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (err2) {
            if (err2.code === 'auth/weak-password') {
                authError.textContent = "Password must be at least 6 characters long.";
            } else {
                authError.textContent = "Incorrect password.";
            }
            authError.classList.remove("hidden");
        }
    }
});

function loadFridge() {
    authContainer.classList.add("hidden");
    loadingSpinner.classList.remove("hidden");
    appContainer.classList.add("hidden");
    
    unsubscribeSnapshot = onSnapshot(itemsCollection, (snapshot) => {
        // Data has loaded
        loadingSpinner.classList.add("hidden");
        appContainer.classList.remove("hidden");
        
        currentItems = [];
        snapshot.forEach((doc) => {
            currentItems.push({ id: doc.id, ...doc.data() });
        });
        currentItems.sort((a, b) => a.name.localeCompare(b.name));
        renderItems();
    }, (error) => {
        console.error("Error listening to Firestore: ", error);
        announce("Failed to connect to database stream.");
        loadingSpinner.classList.add("hidden");
    });
}

// Watch Auth State
onAuthStateChanged(auth, (user) => {
    if (user) {
        authForm.reset();
        loadFridge();
    } else {
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        authContainer.classList.remove("hidden");
        appContainer.classList.add("hidden");
        loadingSpinner.classList.add("hidden");
    }
});
