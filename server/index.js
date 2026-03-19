require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
app.use(cors({
    origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
    methods: ['GET', 'POST']
}));
app.use(express.json());

const WATA_BASE = 'https://dg-api.wata.pro/api';
const TOKEN_MAIN = process.env.WATA_DG_TOKEN;
const TOKEN_STARS = process.env.WATA_STARS_TOKEN;
const TOKEN_STEAM = process.env.WATA_STEAM_TOKEN;
const MARGIN = parseFloat(process.env.MARGIN || '0.05');
const COMMISSION = parseFloat(process.env.COMMISSION || '0.085');

async function wata(method, path, body, token) {
    const opts = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${WATA_BASE}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error('WATA API error');
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

function calcSellPrice(cost, minPrice) {
    const priceForMargin = cost / (1 - COMMISSION - MARGIN);
    return Math.max(minPrice, Math.ceil(priceForMargin));
}

function handleError(res, e) {
    console.error('API Error:', e.data || e.message);
    res.status(e.status || 500).json({ error: e.data || { message: e.message } });
}

// ====================== STEAM (отдельный терминал) ======================

app.get('/api/steam/price', async (req, res) => {
    try {
        const { account, amount } = req.query;
        if (!account || !amount) return res.status(400).json({ error: { message: 'account and amount required' } });
        const data = await wata('GET', `/v3/steam/amount?NetAmount=${amount}&Account=${encodeURIComponent(account)}`, null, TOKEN_STEAM);
        res.json({ ...data, sellPrice: calcSellPrice(data.price, data.minPrice) });
    } catch (e) { handleError(res, e); }
});

app.post('/api/steam/order', async (req, res) => {
    try {
        const data = await wata('POST', '/v3/steam', req.body, TOKEN_STEAM);
        res.json(data);
    } catch (e) { handleError(res, e); }
});

app.get('/api/steam/order/:id', async (req, res) => {
    try {
        const data = await wata('GET', `/v3/steam/order/${req.params.id}`, null, TOKEN_STEAM);
        res.json(data);
    } catch (e) { handleError(res, e); }
});

// ====================== TELEGRAM STARS (отдельный терминал) ======================

app.get('/api/stars/price', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: { message: 'username required' } });
        const data = await wata('GET', `/stars/price?Username=${encodeURIComponent(username)}`, null, TOKEN_STARS);
        const priceForMargin = data.starPrice / (1 - COMMISSION - MARGIN);
        const sellPricePerStar = Math.max(data.minPrice, Math.ceil(priceForMargin * 100) / 100);
        res.json({ ...data, sellPricePerStar });
    } catch (e) { handleError(res, e); }
});

app.post('/api/stars/order', async (req, res) => {
    try {
        const data = await wata('POST', '/stars', req.body, TOKEN_STARS);
        res.json(data);
    } catch (e) { handleError(res, e); }
});

app.get('/api/stars/order/:id', async (req, res) => {
    try {
        const data = await wata('GET', `/stars/order/${req.params.id}`, null, TOKEN_STARS);
        res.json(data);
    } catch (e) { handleError(res, e); }
});

// ====================== GAME TOPUP (основной терминал) ======================

app.get('/api/topup/games', async (req, res) => {
    try {
        const data = await wata('GET', '/v3/topup', null, TOKEN_MAIN);
        res.json(data.filter(g => g.isAvailable));
    } catch (e) { handleError(res, e); }
});

app.get('/api/topup/:gameId', async (req, res) => {
    try {
        const data = await wata('GET', `/v3/topup/${req.params.gameId}`, null, TOKEN_MAIN);
        if (data.products) {
            data.products = data.products
                .filter(p => p.isAvailable)
                .map(p => ({ ...p, sellPrice: calcSellPrice(p.price, p.minPrice) }));
        }
        res.json(data);
    } catch (e) { handleError(res, e); }
});

app.post('/api/topup/order', async (req, res) => {
    try {
        const data = await wata('POST', '/v3/topup', req.body, TOKEN_MAIN);
        res.json(data);
    } catch (e) { handleError(res, e); }
});

app.get('/api/topup/order/:id', async (req, res) => {
    try {
        const data = await wata('GET', `/v3/topup/orders/${req.params.id}`, null, TOKEN_MAIN);
        res.json(data);
    } catch (e) { handleError(res, e); }
});

// ====================== VOUCHERS (основной терминал) ======================

app.get('/api/vouchers/services', async (req, res) => {
    try {
        const data = await wata('GET', '/v3/vouchers/services', null, TOKEN_MAIN);
        res.json(data.filter(s => s.isAvailable));
    } catch (e) { handleError(res, e); }
});

app.get('/api/vouchers/:serviceId', async (req, res) => {
    try {
        const data = await wata('GET', `/v3/vouchers/${req.params.serviceId}`, null, TOKEN_MAIN);
        if (data.vouchers) {
            data.vouchers = data.vouchers
                .filter(v => v.isAvailable && v.stock > 0)
                .map(v => ({ ...v, sellPrice: calcSellPrice(v.price, v.minPrice) }));
        }
        res.json(data);
    } catch (e) { handleError(res, e); }
});

app.post('/api/vouchers/order', async (req, res) => {
    try {
        const data = await wata('POST', '/v3/vouchers', req.body, TOKEN_MAIN);
        res.json(data);
    } catch (e) { handleError(res, e); }
});

app.get('/api/vouchers/order/:id', async (req, res) => {
    try {
        const data = await wata('GET', `/v3/vouchers/order/${req.params.id}`, null, TOKEN_MAIN);
        res.json(data);
    } catch (e) { handleError(res, e); }
});

// ====================== HEALTH ======================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        tokens: {
            main: !!TOKEN_MAIN,
            stars: !!TOKEN_STARS,
            steam: !!TOKEN_STEAM
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WATA DG Server running on port ${PORT}`));
