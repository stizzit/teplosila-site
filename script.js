// script.js - ТЕПЛОСИЛА (ПОЛНАЯ ВЕРСИЯ)

// ===== АВТООПРЕДЕЛЕНИЕ URL ДЛЯ РАБОТЫ И НА ПК, И НА ТЕЛЕФОНЕ =====
function getApiUrl() {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3000/api';
    }
    
    return `http://${hostname}:3000/api`;
}

const API_URL = getApiUrl();
console.log('🔗 API URL:', API_URL);
console.log('📱 Хост:', window.location.hostname);

// ===== КОРЗИНА =====
let cart = {
    items: [],
    total: 0,
    count: 0
};

function loadCart() {
    const saved = localStorage.getItem('teplosilaCart');
    if (saved) {
        try {
            cart = JSON.parse(saved);
        } catch(e) {
            cart = { items: [], total: 0, count: 0 };
        }
    }
    updateCartDisplay();
}

function saveCart() {
    localStorage.setItem('teplosilaCart', JSON.stringify(cart));
    updateCartDisplay();
}

function updateCartDisplay() {
    document.querySelectorAll('.cart-count').forEach(el => {
        if (el) el.textContent = cart.count || 0;
    });
}

function addToCart(product) {
    console.log('🛒 Добавление товара:', product);
    
    const existingItem = cart.items.find(item => String(item.id) === String(product.id));
    
    if (existingItem) {
        existingItem.quantity += product.quantity || 1;
    } else {
        cart.items.push({
            id: String(product.id),
            name: product.name,
            price: Number(product.price) || 0,
            image: product.image || 'img/default.jpg',
            quantity: product.quantity || 1,
            unit: product.unit || 'шт'
        });
    }
    
    cart.count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    saveCart();
    showNotification(`✅ "${product.name}" добавлен в корзину!`);
}

function removeFromCart(productId) {
    cart.items = cart.items.filter(item => String(item.id) !== String(productId));
    cart.count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    saveCart();
    showNotification(`🗑 Товар удален из корзины`);
}

function updateCartItemQuantity(productId, quantity) {
    const item = cart.items.find(item => String(item.id) === String(productId));
    if (item) {
        item.quantity = Math.max(1, quantity);
        cart.count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        saveCart();
    }
}

function clearCart() {
    cart = { items: [], total: 0, count: 0 };
    saveCart();
}

function showNotification(message) {
    const existingNotif = document.querySelector('.custom-notification');
    if (existingNotif) existingNotif.remove();
    
    const notif = document.createElement('div');
    notif.className = 'custom-notification';
    notif.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: linear-gradient(135deg, #10B981, #059669);
        color: white;
        padding: 14px 28px;
        border-radius: 50px;
        z-index: 10000;
        box-shadow: 0 10px 40px rgba(16, 185, 129, 0.4);
        font-weight: 600;
        font-size: 14px;
        animation: slideInRight 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    notif.innerHTML = `<i class="fas fa-check-circle" style="font-size: 18px;"></i> ${message}`;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 2500);
}

// Добавляем стили для анимации уведомлений
const notificationStyle = document.createElement('style');
notificationStyle.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    .quantity-control {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: #F8FAFC;
        border-radius: 50px;
        padding: 5px 10px;
        margin: 12px 0;
        border: 1px solid #E2E8F0;
        transition: all 0.3s ease;
    }
    .quantity-control:hover {
        border-color: #3B82F6;
        background: #FFFFFF;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .quantity-btn {
        width: 34px;
        height: 34px;
        border: none;
        background: white;
        border-radius: 50%;
        font-size: 1.2rem;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s ease;
        color: #1E3A8A;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .quantity-btn:hover {
        background: linear-gradient(135deg, #1E40AF, #3B82F6);
        color: white;
        transform: scale(1.05);
    }
    .quantity-btn:active {
        transform: scale(0.95);
    }
    .quantity-input {
        width: 55px;
        padding: 8px 0;
        text-align: center;
        border: 1px solid #E2E8F0;
        border-radius: 30px;
        font-size: 0.95rem;
        font-weight: 600;
        color: #1E3A8A;
        background: white;
        transition: all 0.2s ease;
    }
    .quantity-input:focus {
        outline: none;
        border-color: #3B82F6;
        box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
    }
    .quantity-unit {
        font-size: 0.8rem;
        font-weight: 500;
        color: #64748B;
        min-width: 45px;
        text-align: left;
    }
    .quantity-pop {
        animation: quantityPopAnim 0.3s ease !important;
    }
    @keyframes quantityPopAnim {
        0% { transform: scale(1); background-color: transparent; }
        40% { transform: scale(1.05); background-color: #DBEAFE; }
        100% { transform: scale(1); background-color: transparent; }
    }
    .btn-clicked {
        animation: btnClickAnim 0.2s ease !important;
    }
    @keyframes btnClickAnim {
        0% { transform: scale(1); }
        50% { transform: scale(0.9); }
        100% { transform: scale(1); }
    }
    .quantity-input::-webkit-outer-spin-button,
    .quantity-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
    .quantity-input[type=number] {
        -moz-appearance: textfield;
    }
    @media (max-width: 768px) {
        .quantity-btn { width: 30px; height: 30px; font-size: 1rem; }
        .quantity-input { width: 48px; padding: 6px 0; font-size: 0.85rem; }
        .quantity-unit { font-size: 0.7rem; min-width: 35px; }
        .quantity-control { gap: 5px; padding: 4px 8px; }
    }
    @media (max-width: 480px) {
        .quantity-btn { width: 28px; height: 28px; font-size: 0.9rem; }
        .quantity-input { width: 42px; padding: 5px 0; font-size: 0.8rem; }
        .quantity-unit { font-size: 0.65rem; min-width: 30px; }
    }
`;
document.head.appendChild(notificationStyle);

function initQuantityControls(container = document.body) {
    const controls = container.querySelectorAll('.quantity-control');
    
    controls.forEach(control => {
        if (control.dataset.initialized === 'true') return;
        control.dataset.initialized = 'true';
        
        const minusBtn = control.querySelector('.qty-minus, .quantity-minus');
        const plusBtn = control.querySelector('.qty-plus, .quantity-plus');
        const input = control.querySelector('.quantity-input');
        
        if (!minusBtn || !plusBtn || !input) return;
        
        const updateValue = (newValue) => {
            let val = Math.max(1, parseInt(newValue) || 1);
            input.value = val;
            input.classList.add('quantity-pop');
            setTimeout(() => input.classList.remove('quantity-pop'), 300);
            const event = new Event('change', { bubbles: true });
            input.dispatchEvent(event);
        };
        
        minusBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentVal = parseInt(input.value) || 1;
            updateValue(currentVal - 1);
            minusBtn.classList.add('btn-clicked');
            setTimeout(() => minusBtn.classList.remove('btn-clicked'), 200);
        });
        
        plusBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentVal = parseInt(input.value) || 1;
            updateValue(currentVal + 1);
            plusBtn.classList.add('btn-clicked');
            setTimeout(() => plusBtn.classList.remove('btn-clicked'), 200);
        });
        
        input.addEventListener('change', (e) => {
            let val = parseInt(e.target.value) || 1;
            val = Math.max(1, val);
            e.target.value = val;
        });
        
        input.addEventListener('input', (e) => {
            let val = parseInt(e.target.value) || 1;
            if (val < 1) {
                e.target.value = 1;
            }
        });
    });
}

// ===== ГЛОБАЛЬНЫЙ ОБРАБОТЧИК КОРЗИНЫ =====
function initCartButtons() {
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-to-cart-btn');
        if (!btn) return;
        
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        
        let productId = btn.dataset.id;
        let productName = btn.dataset.name;
        let productPrice = parseFloat(btn.dataset.price) || 0;
        let productImage = btn.dataset.image || 'img/default.jpg';
        
        if (!productName) {
            const card = btn.closest('.product-card');
            if (card) {
                productName = card.querySelector('h4')?.textContent || 'Товар';
                const priceEl = card.querySelector('.price');
                if (priceEl) {
                    const priceText = priceEl.textContent.replace(/[^\d]/g, '');
                    productPrice = parseInt(priceText) || 0;
                }
                const img = card.querySelector('img');
                if (img) productImage = img.src;
            }
        }
        
        let quantity = 1;
        const card = btn.closest('.product-card');
        if (card) {
            const qtyInput = card.querySelector('.quantity-input');
            if (qtyInput) {
                quantity = parseInt(qtyInput.value) || 1;
            }
        }
        
        let unit = 'шт';
        const unitSpan = card?.querySelector('.quantity-unit');
        if (unitSpan && unitSpan.textContent.includes('метр')) {
            unit = 'метр';
        } else if (unitSpan && unitSpan.textContent.includes('секций')) {
            unit = 'секций';
        }
        
        addToCart({
            id: productId,
            name: productName,
            price: productPrice,
            image: productImage,
            quantity: quantity,
            unit: unit
        });
        
        setTimeout(() => {
            delete btn.dataset.processing;
        }, 500);
    });
}

// ===== МОБИЛЬНОЕ МЕНЮ =====
function initMobileMenu() {
    const toggle = document.getElementById('mobileMenuToggle');
    const menu = document.getElementById('mobileMenu');
    const close = document.getElementById('mobileMenuClose');
    
    if (!toggle || !menu) return;
    
    toggle.addEventListener('click', () => {
        menu.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    const closeMenu = () => {
        menu.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    if (close) close.addEventListener('click', closeMenu);
    
    menu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeMenu);
    });
    
    menu.addEventListener('click', (e) => {
        if (e.target === menu) closeMenu();
    });
}

// ===== ПОИСК =====
function initSearch() {
    const searchInput = document.getElementById('globalSearchInput');
    const searchBtn = document.getElementById('globalSearchBtn');
    
    if (!searchInput || !searchBtn) return;
    
    const performSearch = async () => {
        const query = searchInput.value.trim().toLowerCase();
        if (!query) return;
        
        try {
            const res = await fetch(`${API_URL}/products`);
            const allProducts = await res.json();
            
            const foundProducts = allProducts.filter(p => {
                const searchText = [
                    p.name || '',
                    p.description || '',
                    String(p.price || ''),
                    p.section || '',
                    p.tab || '',
                    p.unit || ''
                ].join(' ').toLowerCase();
                
                const queryWords = query.split(/\s+/);
                return queryWords.some(word => searchText.includes(word));
            });
            
            sessionStorage.setItem('searchQuery', query);
            sessionStorage.setItem('searchResults', JSON.stringify(foundProducts));
            window.location.href = 'search.html';
            
        } catch (err) {
            console.error('Ошибка поиска:', err);
            alert('🔍 Поиск временно недоступен. Попробуйте позже.');
        }
    };
    
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
}

// ===== НАБЛЮДАТЕЛЬ ЗА НОВЫМИ ЭЛЕМЕНТАМИ =====
function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
        let shouldInit = false;
        
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        if (node.classList?.contains('products-grid') ||
                            node.classList?.contains('product-card') ||
                            node.querySelector?.('.quantity-control')) {
                            shouldInit = true;
                        }
                    }
                });
            }
        });
        
        if (shouldInit) {
            setTimeout(() => {
                initQuantityControls();
            }, 100);
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
}

// ===== ЗАГРУЗКА ПРИ СТАРТЕ =====
document.addEventListener('DOMContentLoaded', () => {
    loadCart();
    initCartButtons();
    initMobileMenu();
    initSearch();
    initQuantityControls();
    initMutationObserver();
    
    console.log('✅ Сайт ТЕПЛОСИЛА загружен');
    console.log('📱 API URL:', API_URL);
});

// ===== ЭКСПОРТ В ГЛОБАЛЬНУЮ ОБЛАСТЬ =====
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartItemQuantity = updateCartItemQuantity;
window.clearCart = clearCart;
window.cart = cart;
window.updateCartDisplay = updateCartDisplay;
window.initQuantityControls = initQuantityControls;
window.changeQty = function(btn, delta) {
    const input = btn.parentElement.querySelector('input');
    if (input) {
        let val = parseInt(input.value) || 1;
        val = Math.max(1, val + delta);
        input.value = val;
        input.classList.add('quantity-pop');
        setTimeout(() => input.classList.remove('quantity-pop'), 300);
    }
};