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
const languageSelect = document.getElementById("language-select");
const HARDCODED_EMAIL = "admin@blindfridge.app";

// Expose a quick hack for the developer console
window.forceLogout = () => {
    signOut(auth).then(() => console.log("Force logged out successfully!"));
};

// Fridge DOM Elements
const form = document.getElementById("item-form");
const nameInput = document.getElementById("item-name");
const quantityInput = document.getElementById("item-quantity");
const locationInput = document.getElementById("item-location");
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

//Custom HTML Modal replacing alert/confirm
//Btw i like bbq chicken wings a lot 
function showModal(title, message, buttons) {
    return new Promise((resolve) => {
        // VIBE FIX: Capture what the user was looking at before the modal opened
        const previouslyFocusedElement = document.activeElement;

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
                // VIBE FIX: Send them right back to where they were
                if (previouslyFocusedElement) previouslyFocusedElement.focus();
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

const translations = {
    en: {
        appTitle: "Fridge Manager",
        appSubtitle: "A simple, accessible shared fridge inventory.",
        languageLabel: "Language",

        authHeading: "Fridge Vault",
        authSubtitle: "Enter your master password to access your inventory.",
        secretPassword: "Secret Password",
        unlockFridge: "Unlock Fridge",

        addOrEditItem: "Add or Edit Item",
        editItem: "Edit Item",
        itemNameLabel: "Item Name (Required)",
        itemNamePlaceholder: "e.g. Milk, Leftover Pasta",
        quantityLabel: "Quantity (Optional)",
        quantityPlaceholder: "e.g. 1 liter, 2 bowls",
        locationLabel: "Fridge Location (Optional)",
        locationPlaceholder: "e.g. Top shelf, door, bottom drawer",
        dateStoredLabel: "Date Stored (Optional)",
        expiryDateLabel: "Expiry Date (Optional)",
        addItem: "Add Item",
        updateItem: "Update Item",
        cancelEdit: "Cancel Edit",

        useSoon: "Use Soon",
        allFridgeItems: "All Fridge Items",
        emptyState: "The fridge is currently empty.",
        settings: "Settings",
        settingsSubtitle: "Manage your device session.",
        logout: "Log Out",

        quantityMeta: "Quantity",
        locationMeta: "Fridge Location",
        expiresMeta: "Expires",
        storedMeta: "Stored",
        addedOverWeek: "Added over a week ago",

        edit: "Edit",
        delete: "Delete",
        decreaseQuantityFor: "Decrease quantity for {name}",
        increaseQuantityFor: "Increase quantity for {name}",
        editAria: "Edit {name}",
        deleteAria: "Delete {name}",

        editingReady: "Editing {name}. Form ready.",
        editCancelled: "Edit cancelled. Form reset.",
        addItemAria: "Add item to fridge",
        updateItemAria: "Update item {name}",

        deleteItemTitle: "Delete Item",
        deleteConfirm: "Are you sure you want to remove {name} from your fridge?",
        cancel: "Cancel",
        removed: "{name} removed from fridge.",

        increased: "Increased quantity of {name} to {quantity}",
        decreased: "Decreased quantity of {name} to {quantity}",
        quantityError: "Error updating quantity.",

        invalidDateTitle: "Invalid Date",
        dateStoredFuture: "Date stored cannot be in the future.",
        dateStoredFutureModal: "Date Stored cannot be in the future!",
        okay: "Okay",

        updatedSuccess: "{name} updated successfully.",
        addedSuccess: "{name} added to fridge.",
        savingError: "Error saving item.",
        removingError: "Error removing item.",
        weakPassword: "Password must be at least 6 characters long.",
        incorrectPassword: "Incorrect password.",
        loadError: "Failed to connect to database stream.",
        loadErrorEmpty: "Could not load fridge items. Check your Firebase Firestore rules.",

        loadingItems: "Loading fridge items...",
        oldItemsListAria: "List of items to use soon",
        inventoryListAria: "List of all fridge items"
    },

    tr: {
        appTitle: "Buzdolabı Yöneticisi",
        appSubtitle: "Basit ve erişilebilir ortak buzdolabı listesi.",
        languageLabel: "Dil",

        authHeading: "Buzdolabı Kasası",
        authSubtitle: "Envantere erişmek için ana şifreni gir.",
        secretPassword: "Gizli Şifre",
        unlockFridge: "Buzdolabını Aç",

        addOrEditItem: "Ürün Ekle veya Düzenle",
        editItem: "Ürünü Düzenle",
        itemNameLabel: "Ürün Adı (Zorunlu)",
        itemNamePlaceholder: "örn. Süt, Kalan Makarna",
        quantityLabel: "Miktar (İsteğe Bağlı)",
        quantityPlaceholder: "örn. 1 litre, 2 kase",
        locationLabel: "Buzdolabı Konumu (İsteğe Bağlı)",
        locationPlaceholder: "örn. Üst raf, kapak, alt çekmece",
        dateStoredLabel: "Konulduğu Tarih (İsteğe Bağlı)",
        expiryDateLabel: "Son Kullanma Tarihi (İsteğe Bağlı)",
        addItem: "Ürün Ekle",
        updateItem: "Ürünü Güncelle",
        cancelEdit: "Düzenlemeyi İptal Et",

        useSoon: "Yakında Kullan",
        allFridgeItems: "Tüm Buzdolabı Ürünleri",
        emptyState: "Buzdolabı şu anda boş.",
        settings: "Ayarlar",
        settingsSubtitle: "Cihaz oturumunu yönet.",
        logout: "Çıkış Yap",

        quantityMeta: "Miktar",
        locationMeta: "Buzdolabı Konumu",
        expiresMeta: "Son Kullanma",
        storedMeta: "Konuldu",
        addedOverWeek: "Bir haftadan uzun süre önce eklendi",

        edit: "Düzenle",
        delete: "Sil",
        decreaseQuantityFor: "{name} miktarını azalt",
        increaseQuantityFor: "{name} miktarını artır",
        editAria: "{name} ürününü düzenle",
        deleteAria: "{name} ürününü sil",

        editingReady: "{name} düzenleniyor. Form hazır.",
        editCancelled: "Düzenleme iptal edildi. Form sıfırlandı.",
        addItemAria: "Buzdolabına ürün ekle",
        updateItemAria: "{name} ürününü güncelle",

        deleteItemTitle: "Ürünü Sil",
        deleteConfirm: "{name} ürününü buzdolabından kaldırmak istediğine emin misin?",
        cancel: "İptal",
        removed: "{name} buzdolabından kaldırıldı.",

        increased: "{name} miktarı {quantity} olarak artırıldı",
        decreased: "{name} miktarı {quantity} olarak azaltıldı",
        quantityError: "Miktar güncellenirken hata oluştu.",

        invalidDateTitle: "Geçersiz Tarih",
        dateStoredFuture: "Konulduğu tarih gelecekte olamaz.",
        dateStoredFutureModal: "Konulduğu tarih gelecekte olamaz!",
        okay: "Tamam",

        updatedSuccess: "{name} başarıyla güncellendi.",
        addedSuccess: "{name} buzdolabına eklendi.",
        savingError: "Ürün kaydedilirken hata oluştu.",
        removingError: "Ürün kaldırılırken hata oluştu.",
        weakPassword: "Şifre en az 6 karakter olmalı.",
        incorrectPassword: "Yanlış şifre.",
        loadError: "Veritabanı bağlantısı kurulamadı.",
        loadErrorEmpty: "Buzdolabı ürünleri yüklenemedi. Firebase Firestore kurallarını kontrol et.",

        loadingItems: "Buzdolabı ürünleri yükleniyor...",
        oldItemsListAria: "Yakında kullanılması gereken ürünlerin listesi",
        inventoryListAria: "Tüm buzdolabı ürünlerinin listesi"
    },

    ar: {
        appTitle: "مدير الثلاجة",
        appSubtitle: "قائمة بسيطة وسهلة للوصول لمحتويات الثلاجة المشتركة.",
        languageLabel: "اللغة",

        authHeading: "خزنة الثلاجة",
        authSubtitle: "أدخل كلمة المرور للوصول إلى القائمة.",
        secretPassword: "كلمة المرور",
        unlockFridge: "فتح الثلاجة",

        addOrEditItem: "إضافة أو تعديل عنصر",
        editItem: "تعديل العنصر",
        itemNameLabel: "اسم العنصر (مطلوب)",
        itemNamePlaceholder: "مثال: حليب، مكرونة متبقية",
        quantityLabel: "الكمية (اختياري)",
        quantityPlaceholder: "مثال: 1 لتر، وعاءان",
        locationLabel: "مكانه في الثلاجة (اختياري)",
        locationPlaceholder: "مثال: الرف العلوي، الباب، الدرج السفلي",
        dateStoredLabel: "تاريخ التخزين (اختياري)",
        expiryDateLabel: "تاريخ الانتهاء (اختياري)",
        addItem: "إضافة العنصر",
        updateItem: "تحديث العنصر",
        cancelEdit: "إلغاء التعديل",

        useSoon: "استخدمه قريباً",
        allFridgeItems: "كل عناصر الثلاجة",
        emptyState: "الثلاجة فارغة حالياً.",
        settings: "الإعدادات",
        settingsSubtitle: "إدارة جلسة هذا الجهاز.",
        logout: "تسجيل الخروج",

        quantityMeta: "الكمية",
        locationMeta: "المكان في الثلاجة",
        expiresMeta: "ينتهي في",
        storedMeta: "تم التخزين",
        addedOverWeek: "تمت إضافته منذ أكثر من أسبوع",

        edit: "تعديل",
        delete: "حذف",
        decreaseQuantityFor: "تقليل كمية {name}",
        increaseQuantityFor: "زيادة كمية {name}",
        editAria: "تعديل {name}",
        deleteAria: "حذف {name}",

        editingReady: "يتم تعديل {name}. النموذج جاهز.",
        editCancelled: "تم إلغاء التعديل وإعادة ضبط النموذج.",
        addItemAria: "إضافة عنصر إلى الثلاجة",
        updateItemAria: "تحديث العنصر {name}",

        deleteItemTitle: "حذف العنصر",
        deleteConfirm: "هل أنت متأكد أنك تريد إزالة {name} من الثلاجة؟",
        cancel: "إلغاء",
        removed: "تمت إزالة {name} من الثلاجة.",

        increased: "تمت زيادة كمية {name} إلى {quantity}",
        decreased: "تم تقليل كمية {name} إلى {quantity}",
        quantityError: "حدث خطأ أثناء تحديث الكمية.",

        invalidDateTitle: "تاريخ غير صالح",
        dateStoredFuture: "تاريخ التخزين لا يمكن أن يكون في المستقبل.",
        dateStoredFutureModal: "تاريخ التخزين لا يمكن أن يكون في المستقبل!",
        okay: "حسناً",

        updatedSuccess: "تم تحديث {name} بنجاح.",
        addedSuccess: "تمت إضافة {name} إلى الثلاجة.",
        savingError: "حدث خطأ أثناء حفظ العنصر.",
        removingError: "حدث خطأ أثناء إزالة العنصر.",
        weakPassword: "يجب أن تكون كلمة المرور 6 أحرف على الأقل.",
        incorrectPassword: "كلمة المرور غير صحيحة.",
        loadError: "فشل الاتصال بقاعدة البيانات.",
        loadErrorEmpty: "تعذر تحميل عناصر الثلاجة. تحقق من قواعد Firebase Firestore.",

        loadingItems: "يتم تحميل عناصر الثلاجة...",
        oldItemsListAria: "قائمة العناصر التي يجب استخدامها قريباً",
        inventoryListAria: "قائمة كل عناصر الثلاجة"
    }
};

let currentLanguage = localStorage.getItem("fridgeLanguage") || "en";

function t(key, values = {}) {
    let text = translations[currentLanguage]?.[key] || translations.en[key] || key;

    Object.entries(values).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, value);
    });

    return text;
}

function setText(selector, key) {
    const el = document.querySelector(selector);
    if (el) el.textContent = t(key);
}

function applyLanguage(lang) {
    currentLanguage = translations[lang] ? lang : "en";
    localStorage.setItem("fridgeLanguage", currentLanguage);

    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
    document.title = t("appTitle");

    if (languageSelect) {
        languageSelect.value = currentLanguage;
        languageSelect.setAttribute("aria-label", t("languageLabel"));
    }

    setText("header h1", "appTitle");
    setText("header p", "appSubtitle");

    setText("#auth-heading", "authHeading");
    setText(".auth-subtitle", "authSubtitle");
    setText('label[for="auth-password"]', "secretPassword");
    setText("#login-btn", "unlockFridge");

    setText('label[for="item-name"]', "itemNameLabel");
    nameInput.placeholder = t("itemNamePlaceholder");

    setText('label[for="item-quantity"]', "quantityLabel");
    quantityInput.placeholder = t("quantityPlaceholder");

    setText('label[for="item-location"]', "locationLabel");
    locationInput.placeholder = t("locationPlaceholder");

    setText('label[for="item-date-stored"]', "dateStoredLabel");
    setText('label[for="item-expiry"]', "expiryDateLabel");

    setText("#old-items-heading", "useSoon");
    setText("#inventory-heading", "allFridgeItems");
    setText("#settings-heading", "settings");
    setText("#settings-section p", "settingsSubtitle");

    logoutBtn.textContent = t("logout");
    logoutBtn.setAttribute("aria-label", t("logout"));

    oldItemsList.setAttribute("aria-label", t("oldItemsListAria"));
    inventoryList.setAttribute("aria-label", t("inventoryListAria"));
    emptyState.textContent = t("emptyState");

    const loadingText = document.querySelector("#loading-spinner .sr-only");
    if (loadingText) loadingText.textContent = t("loadingItems");

    if (editIdInput.value) {
        formHeading.textContent = t("editItem");
        submitBtn.textContent = t("updateItem");
    } else {
        formHeading.textContent = t("addOrEditItem");
        submitBtn.textContent = t("addItem");
        submitBtn.setAttribute("aria-label", t("addItemAria"));
    }

    cancelBtn.textContent = t("cancelEdit");
    cancelBtn.setAttribute("aria-label", t("cancelEdit"));

    renderItems();
}

if (languageSelect) {
    languageSelect.addEventListener("change", (e) => {
        applyLanguage(e.target.value);
    });
}

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
            metaHtml += `<span>${t("quantityMeta")}: ${item.quantity}</span>`;
            if (/\d+/.test(item.quantity)) {
                 metaHtml += `
                 <span class="quantity-controls">
                    <button type="button" class="icon-btn dec-btn" aria-label="${t("decreaseQuantityFor", { name: item.name })}">-</button>
                    <button type="button" class="icon-btn inc-btn" aria-label="${t("increaseQuantityFor", { name: item.name })}">+</button>
                 </span>`;
            }
        }
        const itemLocation = item.location ? item.location : "Location not set";
        metaHtml += `<span>${t("locationMeta")}: ${itemLocation}</span>`;
        if (item.expiryDate) {
            metaHtml += `<span class="${old ? 'warning-text' : ''}">${t("expiresMeta")}: ${formatDate(item.expiryDate)}</span>`;
        } else if (old) {
             metaHtml += `<span class="warning-text">${t("addedOverWeek")}</span>`;
        } else if (item.dateStored) {
             metaHtml += `<span>${t("storedMeta")}: ${formatDate(item.dateStored)}</span>`;
        }

        li.innerHTML = `
            <div class="item-details">
                <h3>${item.name} <span class="sr-only">${old ? '(Use soon)' : ''}</span></h3>
                <div class="item-meta">
                    ${metaHtml}
                </div>
            </div>
            <div class="item-actions">
                <button type="button" class="edit-btn" data-id="${item.id}" aria-label="${t("editAria", { name: item.name })}">${t("edit")}</button>
                <button type="button" class="delete-btn" data-id="${item.id}" aria-label="${t("deleteAria", { name: item.name })}">${t("delete")}</button>
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
    locationInput.value = item.location || "";
    dateStoredInput.value = item.dateStored || "";
    expiryInput.value = item.expiryDate || "";
    
    submitBtn.textContent = t("updateItem");
    submitBtn.setAttribute("aria-label", t("updateItemAria", { name: item.name }));
    cancelBtn.classList.remove("hidden");
    formHeading.textContent = t("editItem");
        
    // Move focus to form heading or input
    nameInput.focus();
    announce(t("editingReady", { name: item.name }));
}

// Cancel edit
function cancelEdit() {
    editIdInput.value = "";
    form.reset();
    
    submitBtn.textContent = t("addItem");
    submitBtn.setAttribute("aria-label", t("addItemAria"));
    cancelBtn.classList.add("hidden");
    formHeading.textContent = t("addOrEditItem");
    
    announce(t("editCancelled"));
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
    const location = locationInput.value.trim();
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
        location: location,
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
            let errorMessage = "";
            if (err2.code === 'auth/weak-password') {
                errorMessage = "Password must be at least 6 characters long.";
            } else {
                errorMessage = "Incorrect password.";
            }
            authError.textContent = errorMessage;
            // VIBE FIX: Actually tell the screen reader about the error
            announce(errorMessage);
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
        appContainer.classList.remove("hidden");

        emptyState.textContent = "Could not load fridge items. Check your Firebase Firestore rules.";
        emptyState.classList.remove("hidden");
    });
}

applyLanguage(currentLanguage);

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
