// URL бэкенд-сервера WATA Digital Goods
// Поменяйте на адрес вашего развёрнутого сервера
const API_URL = 'https://heystore-api.onrender.com';

const BASEROW_API_TOKEN = 'gUcyV8zyChn6xC8VbTF3eGE0sg92o3T5';
const TG_BOT_TOKEN = '8433047336:AAEGAUDR3RWYPtPe2CcGKGHwEMtlB1k9IVU';
const TG_CHAT_ID = '7964821965';

const BASEROW_TABLES = {
    neural: '821829',
    steam: '894772',
    vouchers: '894773',
    telegram: '894774'
};

const COMMISSION_RATE = 0.085;
const PROFIT_RATE = 0.05;

async function baserowCreate(tableId, data) {
    try {
        const res = await fetch(`https://api.baserow.io/api/database/rows/table/${tableId}/?user_field_names=true`, {
            method: 'POST',
            headers: { 'Authorization': `Token ${BASEROW_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const row = await res.json();
        return row.id || null;
    } catch (e) { console.error('Baserow create error:', e); return null; }
}

async function baserowUpdate(tableId, rowId, data) {
    try {
        await fetch(`https://api.baserow.io/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`, {
            method: 'PATCH',
            headers: { 'Authorization': `Token ${BASEROW_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) { console.error('Baserow update error:', e); }
}

function calcFinancials(sellPrice) {
    const commission = Math.round(sellPrice * COMMISSION_RATE * 100) / 100;
    const cost = Math.round(sellPrice * (1 - COMMISSION_RATE - PROFIT_RATE) * 100) / 100;
    const profit = Math.round((sellPrice - cost - commission) * 100) / 100;
    return { cost, commission, profit };
}

async function sendTgNotification(product, price, email, orderId) {
    try {
        const message = `🛒 *Новый заказ!*\n\n📦 Продукт: ${product}\n💰 Цена: ${price} ₽\n📧 Email: ${email}\n🆔 Заказ: ${orderId}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`;
        await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TG_CHAT_ID, text: message, parse_mode: 'Markdown' })
        });
    } catch (e) { /* silent */ }
}

async function trackNeuralOrder(email, service, plan, price, orderId) {
    const rowId = await baserowCreate(BASEROW_TABLES.neural, {
        'Дата': new Date().toISOString(),
        'Order ID': orderId,
        'Email client': email,
        'Сервис': service,
        'Тариф': plan,
        'Сумма продажи': parseFloat(price),
        'Статус': 'Pending'
    });
    await sendTgNotification(service + ' — ' + plan, price, email, orderId);
    return rowId;
}

async function trackVoucherOrder(email, service, region, nominal, price, orderId) {
    const fin = calcFinancials(price);
    const rowId = await baserowCreate(BASEROW_TABLES.vouchers, {
        'Дата': new Date().toISOString(),
        'Order ID': orderId,
        'Email': email,
        'Сервис': service,
        'Регион': region || '',
        'Номинал': nominal || '',
        'Сумма продажи': price,
        'Закуп': fin.cost,
        'Комиссия': fin.commission,
        'Прибыль': fin.profit,
        'Статус': 'Pending'
    });
    await sendTgNotification(service + (nominal ? ' — ' + nominal : ''), price, email, orderId);
    return rowId;
}

async function trackSteamOrder(email, account, netAmount, price, orderId) {
    const fin = calcFinancials(price);
    const rowId = await baserowCreate(BASEROW_TABLES.steam, {
        'Дата': new Date().toISOString(),
        'Order ID': orderId,
        'Email': email,
        'Аккаунт': account,
        'Сумма пополнения': netAmount,
        'Сумма продажи': price,
        'Закуп': fin.cost,
        'Комиссия': fin.commission,
        'Прибыль': fin.profit,
        'Статус': 'Pending'
    });
    await sendTgNotification('Пополнение Steam ' + netAmount + '₽', price, email, orderId);
    return rowId;
}

async function trackTelegramOrder(email, type, username, quantity, price, orderId) {
    const fin = calcFinancials(price);
    const rowId = await baserowCreate(BASEROW_TABLES.telegram, {
        'Дата': new Date().toISOString(),
        'Order ID': orderId,
        'Email': email,
        'Тип': type,
        'Username': username,
        'Количество': String(quantity),
        'Сумма продажи': price,
        'Закуп': fin.cost,
        'Комиссия': fin.commission,
        'Прибыль': fin.profit,
        'Статус': 'Pending'
    });
    await sendTgNotification('Telegram ' + type + (type === 'Stars' ? ' x' + quantity : ' — ' + quantity), price, email, orderId);
    return rowId;
}

function generateOrderId() {
    return 'HS-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

function formatPrice(price) {
    return Math.ceil(price).toLocaleString('ru-RU') + ' ₽';
}

async function loadDynamicPrices() {
    try {
        const res = await fetch(`${API_URL}/api/prices`);
        const prices = await res.json();
        const map = {
            'service-telegram-premium.html': 'telegram-premium',
            'service-telegram-stars.html': 'telegram-stars',
            'service-genshin.html': 'genshin',
            'service-pubg.html': 'pubg',
            'service-spotify.html': 'spotify',
            'service-apple.html': 'apple',
            'service-googleplay.html': 'googleplay',
            'service-xbox.html': 'xbox',
            'service-playstation.html': 'playstation',
            'service-valorant.html': 'valorant',
            'service-netflix.html': 'netflix',
            'service-roblox.html': 'roblox',
            'service-fortnite.html': 'fortnite',
        };
        document.querySelectorAll('a.service-card, a.popular-card').forEach(card => {
            const href = card.getAttribute('href');
            const key = map[href];
            if (key && prices[key]) {
                const priceEl = card.querySelector('.service-price, .popular-price');
                if (priceEl) priceEl.textContent = 'от ' + formatPrice(prices[key]);
            }
        });
    } catch (e) { /* prices stay static on error */ }
}

let _categoriesCache = null;
async function loadRegions(category, selectEl, onRegionChange) {
    try {
        if (!_categoriesCache) {
            const res = await fetch(`${API_URL}/api/vouchers/categories`);
            _categoriesCache = await res.json();
        }
        const regions = _categoriesCache[category] || [];
        if (!regions.length) return null;

        const ruRegion = regions.find(r => r.country === 'RU');
        const defaultRegion = ruRegion || regions[0];

        selectEl.innerHTML = regions.map(r =>
            `<option value="${r.id}"${r.id === defaultRegion.id ? ' selected' : ''}>${r.countryName} (${r.country})</option>`
        ).join('');
        selectEl.value = defaultRegion.id;

        initCustomSelect(selectEl, onRegionChange);

        return defaultRegion.id;
    } catch (e) {
        selectEl.innerHTML = '<option>Ошибка загрузки регионов</option>';
        return null;
    }
}

function initCustomSelect(selectEl, onChange) {
    const existing = selectEl.parentElement.querySelector('.custom-select');
    if (existing) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'custom-select-options';
    optionsContainer.setAttribute('role', 'listbox');

    const selectedOpt = selectEl.options[selectEl.selectedIndex];
    trigger.textContent = selectedOpt ? selectedOpt.textContent : '';

    Array.from(selectEl.options).forEach(opt => {
        const item = document.createElement('div');
        item.className = 'custom-select-option';
        item.setAttribute('role', 'option');
        if (opt.selected) {
            item.classList.add('selected');
            item.setAttribute('aria-selected', 'true');
        }
        item.textContent = opt.textContent;
        item.dataset.value = opt.value;
        item.addEventListener('click', () => {
            selectEl.value = opt.value;
            trigger.textContent = opt.textContent;
            optionsContainer.querySelectorAll('.custom-select-option').forEach(o => {
                o.classList.remove('selected');
                o.removeAttribute('aria-selected');
            });
            item.classList.add('selected');
            item.setAttribute('aria-selected', 'true');
            wrapper.classList.remove('open');
            if (onChange) onChange(opt.value);
        });
        optionsContainer.appendChild(item);
    });

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select.open').forEach(s => {
            if (s !== wrapper) s.classList.remove('open');
        });
        wrapper.classList.toggle('open');
    });

    document.addEventListener('click', () => wrapper.classList.remove('open'));
    wrapper.addEventListener('click', (e) => e.stopPropagation());

    selectEl.after(wrapper);
    wrapper.appendChild(trigger);
    wrapper.appendChild(optionsContainer);
}

function initThemeToggle() {
    const themeToggle = document.querySelector('.theme-toggle');
    const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;
    const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); themeToggle.innerHTML = sunIcon; }
    else { themeToggle.innerHTML = moonIcon; }
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('theme', 'light'); themeToggle.innerHTML = moonIcon; }
        else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark'); themeToggle.innerHTML = sunIcon; }
    });
}
